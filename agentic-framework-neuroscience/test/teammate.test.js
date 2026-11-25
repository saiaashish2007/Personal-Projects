import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';
import { PRESETS } from '../src/presets.js';
import { Workspace } from '../src/tools.js';
import { buildFile, readChunk, fileKind } from '../src/files.js';
import { parseRef } from '../src/github.js';
import { handleApi } from '../src/http.js';
import { createStore } from '../src/store.js';

// A one-page PDF with real text, with a correct xref table so pdf.js parses it.
function tinyPdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function started() {
  const s = new Session();
  s.createTask(PRESETS[0]);
  s.setMode('A', 'agent');
  s.setMode('B', 'both');
  s.setMode('C', 'human');
  return s;
}

const workspaceFor = (s, id) => new Workspace(s.buildCtx(id, { kind: 'round' }).workspace);

test('PDFs, code, and CSV files become readable text in chunks', async () => {
  const pdf = await buildFile({ id: 'file_pdf', name: 'spec.pdf', mime: 'application/pdf', buffer: tinyPdf('Retry budget is 3 attempts'), by: 'Maya' });
  assert.equal(pdf.kind, 'pdf');
  assert.equal(pdf.pages, 1);
  assert.match(pdf.text, /Retry budget is 3 attempts/);

  const code = await buildFile({ id: 'file_js', name: 'retry.js', buffer: Buffer.from('x'.repeat(7000) + 'END'), by: 'Sam' });
  assert.equal(code.kind, 'text');
  const first = readChunk(code, 0);
  assert.match(first, /\[more: call team.read_file again with offset 6000\]/);
  assert.match(readChunk(code, 6000), /END\n\[end of file\]/);

  assert.equal(fileKind('data.csv'), 'text');
  assert.equal(fileKind('photo.png', 'image/png'), 'image');
  const img = await buildFile({ id: 'file_png', name: 'photo.png', mime: 'image/png', buffer: Buffer.from([1, 2, 3]), by: 'Sam' });
  assert.match(img.note, /cannot see image contents/);
});

test('shared files are listed, readable, and searchable by agents', async () => {
  const s = started();
  const record = await buildFile({ id: 'file_csv', name: 'incidents.csv', buffer: Buffer.from('date,service,minutes\n2026-03-02,checkout,42\n'), by: 'B' });
  const msg = s.shareFile({ pairId: 'B', record, text: 'Here is the incident export' });
  assert.deepEqual(msg.files, ['file_csv']);
  assert.ok(s.queue.some((j) => j.kind === 'group' && j.trigger.messageId === msg.id), 'agents are triggered by the share');
  assert.equal(s.view('C').files[0].name, 'incidents.csv');
  assert.equal(s.view('C').files[0].text, undefined, 'views carry metadata, not the full text');

  const ws = workspaceFor(s, 'A');
  assert.match(ws.run('team.list_files'), /incidents\.csv/);
  assert.match(ws.run('team.read_file', { file_id: 'file_csv' }), /checkout,42/);
  assert.match(ws.run('team.search_memory', { query: 'checkout incident minutes' }), /file incidents\.csv/);
  assert.throws(() => s.shareFile({ pairId: 'A', record, text: '' }), /Agent only/);
});

test('delegation tells the thread and the new owner, and finished work is announced', () => {
  const s = started();
  const ws = workspaceFor(s, 'A');
  const created = ws.run('team.create_task', { title: 'Fix flaky retry test', due: 'Friday' });
  const id = created.match(/(task_\w+)/)[1];
  ws.run('team.assign_task', { task_id: id, owner: 'B', note: 'You wrote the retry module' });
  assert.match(ws.run('team.list_tasks', { owner: 'B' }), /Fix flaky retry test — doing, owner .*due Friday/);
  s.applyTeamEffects('A', ws.effects, { humanApproved: false });

  const task = s.global.task(id);
  assert.equal(task.owner, 'B');
  assert.equal(task.due, 'Friday');
  assert.ok(s.group.some((m) => m.kind === 'system' && /assigned "Fix flaky retry test" to .*You wrote the retry module/.test(m.text)));
  assert.ok(s.agentThread.some((m) => m.from === 'A' && m.to === 'B' && /You now own/.test(m.text)));
  assert.ok(s.queue.some((j) => j.kind === 'agent_dm' && j.to === 'B'), "the new owner's agent is asked to start");

  const ws2 = workspaceFor(s, 'B');
  ws2.run('team.submit_work', { task_id: id, title: 'Retry test fix', content: 'Seeded the clock and removed the 50 ms sleep; the test now passes 200/200 runs locally.' });
  s.applyTeamEffects('B', ws2.effects, { humanApproved: true });
  assert.ok(s.group.some((m) => m.kind === 'system' && /^Done: "Fix flaky retry test"/.test(m.text)));
});

test('anyone in the Slack thread is heard, bot mentions start a thread, and repeats are dropped', () => {
  process.env.SLACK_USER_MAP = JSON.stringify({ U1: 'B' });
  try {
    const s = started();
    s.slack.threadTs = '111.1';
    const guest = s.ingestSlack({ eventId: 'E1', ts: '111.2', user: 'U77', userName: 'Priya', text: 'Can someone summarize where we are?', threadTs: '111.1' });
    assert.equal(guest.as, 'guest');
    const msg = s.group.at(-1);
    assert.equal(msg.authorLabel, 'Priya (Slack)');
    assert.equal(msg.pairId, null);
    assert.ok(s.queue.some((j) => j.kind === 'group' && j.trigger.messageId === msg.id), 'agents react to guests');

    assert.equal(s.ingestSlack({ eventId: 'E1b', ts: '111.2', user: 'U77', text: 'Can someone summarize where we are?', threadTs: '111.1' }).ignored, 'duplicate', 'app_mention + message for the same ts');
    assert.equal(s.ingestSlack({ eventId: 'E2', ts: '200.1', user: 'U77', text: 'unrelated', threadTs: null }).ignored, 'other thread');

    const mention = s.ingestSlack({ eventId: 'E3', ts: '300.1', user: 'U77', userName: 'Priya', text: '<@UBOT> review https://github.com/o/r/pull/9', threadTs: null, mentionsBot: true });
    assert.equal(mention.as, 'guest');
    const job = s.queue.find((j) => j.trigger?.messageId === mention.posted);
    assert.equal(job.trigger.mentionsBot, true);
    assert.match(job.trigger.text, /^@Triad review/);
    const lead = s.activeAgentPairs()[0];
    assert.equal(s.buildCtx(lead, job.trigger).mustRespond, true, 'one agent must answer a bot mention');
    const other = s.activeAgentPairs()[1];
    assert.equal(s.buildCtx(other, job.trigger).mustRespond, false, 'the others decide for themselves');
  } finally {
    delete process.env.SLACK_USER_MAP;
  }
});

test('one agent answers a person first; the others get a turn only after seeing it, or if it stays quiet', () => {
  const s = started();
  s.setMode('C', 'agent');
  s.queue = [];
  s.post({ pairId: 'B', channel: 'group', text: `${s.pairs.C.agentName}, can you check the retry spec?` });
  const job = s.queue.find((j) => j.kind === 'group');
  const planned = s.prepareJob(job);
  assert.deepEqual(planned.map((p) => p.pairId), ['C'], 'the named agent answers alone');
  assert.equal(planned[0].ctx.primary, true);
  assert.equal(planned[0].ctx.mustRespond, true);

  s.queue = [];
  s.applyJob(job, { C: { motivation: 0.2, speak: false, message: '', effects: [], trace: { calls: 1, steps: [] } } });
  const follow = s.queue.find((j) => j.kind === 'group' && j.followUp);
  assert.ok(follow, 'a quiet primary hands the message to the others');
  assert.deepEqual(s.prepareJob(follow).map((p) => p.pairId), ['A', 'B']);

  s.queue = [];
  const retry = { ...job, primary: 'C', retried: false };
  s.applyJob(retry, { C: { motivation: 0, speak: false, message: '', effects: [], error: 'Cursor agent timed out', trace: { calls: 0, steps: [] } } });
  assert.ok(s.queue.some((j) => j.kind === 'group' && j.retried && !j.followUp), 'a model failure retries the same agent once');

  s.queue = [];
  s.post({ pairId: 'B', channel: 'group', text: 'Review https://github.com/o/r/pull/12 please' });
  const reviewCtx = s.prepareJob(s.queue.find((j) => j.kind === 'group'))[0].ctx;
  assert.deepEqual(reviewCtx.review, { repo: 'o/r', number: 12, url: 'https://github.com/o/r/pull/12' });
});

test('submit_work without a task id files a new task the agent owns', () => {
  const s = started();
  const ws = workspaceFor(s, 'A');
  const out = ws.run('team.submit_work', { title: 'Review of o/r#12', content: '## Summary\nLooks good overall; one blocking issue in retry.js:42 where 409 is retried.' });
  assert.match(out, /marked done/);
  s.applyTeamEffects('A', ws.effects, { humanApproved: true });
  const t = s.global.tasks.find((x) => x.title === 'Review of o/r#12');
  assert.equal(t.owner, 'A');
  assert.equal(t.status, 'done');
  assert.equal(t.artifacts.length, 1);
});

test('PR references are parsed from links or owner/name + number', () => {
  assert.deepEqual(parseRef({ url: 'https://github.com/expressjs/express/pull/7605' }), { repo: 'expressjs/express', number: 7605 });
  assert.deepEqual(parseRef({ repo: 'https://github.com/a/b.git', number: '3' }), { repo: 'a/b', number: 3 });
});

test('POST /api/upload shares a file into the team thread', async () => {
  const store = createStore();
  const waitUntil = () => {};
  const call = (path, body) => handleApi(new Request(`http://x/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { store, waitUntil });
  await call('action', { type: 'createTask', preset: PRESETS[0].key });
  const res = await call('upload', { pairId: 'A', name: 'notes.md', type: 'text/markdown', data: Buffer.from('# Launch notes\nShip on Tuesday.').toString('base64'), text: 'Notes from standup' });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.file.name, 'notes.md');
  assert.equal(out.file.text, undefined);
  const { data } = await store.read();
  assert.match(data.files[0].text, /Ship on Tuesday/);
  assert.match(data.group.at(-1).text, /Notes from standup\nShared a file: notes\.md/);
  const bad = await call('upload', { pairId: 'A', name: 'x.txt', data: '' });
  assert.equal(bad.status, 400);
});
