import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, SessionError } from '../src/session.js';
import { Agent } from '../src/agent.js';
import { PRESETS } from '../src/presets.js';
import { createStore } from '../src/store.js';
import { mutate, readSession, runJobs } from '../src/runtime.js';

const hidden = PRESETS.find((p) => p.key === 'hidden-profile');

function fresh() {
  const s = new Session();
  s.createTask(hidden);
  s.takeJobs();
  return s;
}

// Runs queued agent jobs in-process, the same two phases the runtime uses.
async function drain(s) {
  while (s.jobs.length) {
    const job = s.jobs.shift();
    const planned = s.prepareJob(job);
    const outs = {};
    for (const p of planned) outs[p.pairId] = await new Agent(p.agent).think(p.ctx);
    s.applyJob(job, outs);
  }
}

test('private briefs stay in each pair and never reach other viewers', () => {
  const s = fresh();
  const a = s.view('A');
  const b = s.view('B');
  assert.ok(a.mine.notes.some((n) => n.text.includes('largest stadium')));
  assert.ok(!b.mine.notes.some((n) => n.text.includes('largest stadium')));
  assert.equal(a.all, undefined);
  assert.ok(!JSON.stringify(b).includes('largest stadium'));
  assert.ok(JSON.stringify(s.view('observer')).includes('largest stadium'));
});

test('agent prompts only contain their own pair memory', () => {
  const s = fresh();
  const ctx = s.buildCtx('B', { kind: 'group', text: 'hi' });
  assert.ok(ctx.pairMemory.includes('renovation'));
  assert.ok(!ctx.pairMemory.includes('largest stadium'));
  assert.ok(!ctx.pairMemory.includes('subsidy'));
});

test('sharing a note moves it into global memory with provenance', () => {
  const s = fresh();
  const note = s.pairMem.A.notes[0];
  s.shareNote({ pairId: 'A', noteId: note.id });
  const item = s.global.active().find((i) => i.text === note.text);
  assert.equal(item.source.pairId, 'A');
  assert.equal(item.source.from, 'pair-memory');
  assert.ok(s.buildCtx('C', { kind: 'group', text: '' }).globalMemory.includes(note.text));
});

test('modes gate who can post', () => {
  const s = fresh();
  s.setMode('A', 'agent');
  assert.throws(() => s.post({ pairId: 'A', channel: 'group', text: 'hello' }), SessionError);
  s.setMode('B', 'human');
  assert.throws(() => s.post({ pairId: 'B', channel: 'pair', text: 'hello' }), SessionError);
  assert.doesNotThrow(() => s.post({ pairId: 'C', channel: 'group', text: 'hello' }));
});

test('paired agents draft privately; solo agents post to the group', async () => {
  const s = fresh();
  s.setMode('A', 'both');
  s.setMode('C', 'agent');
  s.post({ pairId: 'B', channel: 'group', text: 'Sounds good, I agree. Let us decide on Riverton as final.' });
  await drain(s);
  const critic = s.group.find((m) => m.kind === 'agent' && m.pairId === 'C');
  assert.ok(critic, 'solo critic agent should challenge the consensus in the group');
  assert.ok(!s.group.some((m) => m.kind === 'agent' && m.pairId === 'A' && !m.viaDraft), 'paired agent must not post directly');
});

test('draft review updates the engagement user model', async () => {
  const s = fresh();
  s.createDraft('A', { message: 'Draft one', rationale: 'r', clarifying: false, memory: [], motivation: 0.8 }, {});
  const d1 = s.drafts.A.at(-1);
  await s.reviewDraft({ pairId: 'A', draftId: d1.id, action: 'edit', text: 'Draft one, but better' });
  s.createDraft('A', { message: 'Draft two', rationale: 'r', clarifying: false, memory: [], motivation: 0.8 }, {});
  const d2 = s.drafts.A.at(-1);
  await s.reviewDraft({ pairId: 'A', draftId: d2.id, action: 'reject' });
  await drain(s);
  const e = s.pairMem.A.userModel.engagement;
  assert.equal(e.adapt, 1);
  assert.equal(e.reject, 1);
  const sent = s.group.find((m) => m.viaDraft === 'adapt');
  assert.equal(sent.text, 'Draft one, but better');
});

test('agent-only decisions on consequential tasks need a human sign-off', () => {
  const s = fresh();
  s.applyMemory('C', [{ scope: 'global', type: 'decision', text: 'Host in Lakeside' }], { humanApproved: false });
  const item = s.global.active().find((i) => i.text === 'Host in Lakeside');
  assert.equal(item.status, 'needs_signoff');
  s.setMode('A', 'agent');
  assert.throws(() => s.signOff({ pairId: 'A', itemId: item.id }), SessionError);
  s.signOff({ pairId: 'B', itemId: item.id });
  assert.equal(item.status, 'active');
  assert.equal(item.signedOffBy, 'B');
});

test('recovery after friction is classified', () => {
  const s = fresh();
  const m1 = s.post({ pairId: 'A', channel: 'group', text: 'Pick a city' });
  s.flagFriction({ pairId: 'A', messageId: m1.id, source: 'me' });
  s.post({ pairId: 'A', channel: 'group', text: 'Riverton stadium is under renovation, Lakeside has two league venues and cheaper hotels' });
  assert.equal(s.frictions[0].recovery, 'repair');
  assert.equal(s.pairMem.A.userModel.recoveries.repair, 1);
});

test('state survives a snapshot round trip', () => {
  const s = fresh();
  s.post({ pairId: 'A', channel: 'group', text: 'hello' });
  const again = new Session({ snapshot: JSON.parse(JSON.stringify(s.toJSON())) });
  assert.equal(again.group.at(-1).text, 'hello');
  assert.equal(again.task.id, s.task.id);
  assert.deepEqual(again.view('B').mine.notes, s.view('B').mine.notes);
});

test('store + runtime: actions persist and background agent turns land', async () => {
  const store = createStore();
  await mutate(store, (s) => s.createTask(hidden));
  await mutate(store, (s) => s.setMode('C', 'agent'));
  const { jobs } = await mutate(store, (s) => s.post({ pairId: 'B', channel: 'group', text: 'I agree, let us decide on Riverton as final.' }));
  assert.equal(jobs.length, 1);
  await runJobs(store, jobs);
  const { session } = await readSession(store);
  assert.ok(session.group.some((m) => m.kind === 'agent' && m.pairId === 'C'));
  assert.ok(!session.isThinking('C'));
});

test('stale writes are rejected so concurrent requests cannot clobber each other', async () => {
  const store = createStore();
  const { version, data } = await store.read();
  assert.equal(await store.write({ a: 1 }, version), true);
  assert.equal(await store.write({ a: 2 }, version), false);
  assert.equal(data, null);
});

test('agency estimate follows who authored group messages', () => {
  const s = fresh();
  s.addMessage({ channel: 'group', pairId: 'A', kind: 'human', text: 'x' });
  s.addMessage({ channel: 'group', pairId: 'A', kind: 'human', text: 'y' });
  s.addMessage({ channel: 'group', pairId: 'A', kind: 'agent', text: 'z', viaDraft: 'direct' });
  s.addMessage({ channel: 'group', pairId: 'C', kind: 'agent', text: 'solo' });
  const a = s.analytics();
  assert.equal(a.A.agency, 'H4');
  assert.equal(a.C.agency, 'H1');
  assert.equal(a.B.agency, null);
});
