import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session, SessionError } from '../src/session.js';
import { Agent } from '../src/agent.js';
import { PRESETS } from '../src/presets.js';
import { createStore } from '../src/store.js';
import { mutate, readSession, drain } from '../src/runtime.js';
import { externalWritePolicy } from '../src/tools.js';

const onboarding = PRESETS.find((p) => p.key === 'onboarding-emails');
const postmortem = PRESETS.find((p) => p.key === 'postmortem');

function fresh(preset = onboarding) {
  const s = new Session();
  s.createTask(preset);
  s.queue = [];
  return s;
}

// Runs queued agent jobs in-process with the same prepare → think → apply phases as the runtime.
async function run(s, limit = 40) {
  let n = 0;
  while (s.queue.length && n++ < limit) {
    const job = s.queue.shift();
    if (!['group', 'private', 'revise', 'agent_dm'].includes(job.kind)) continue;
    const planned = s.prepareJob(job);
    const outs = {};
    for (const p of planned) outs[p.pairId] = await new Agent(p.agent).think(p.ctx);
    if (planned.length) s.applyJob(job, outs);
  }
}

const allAgents = (s) => ['A', 'B', 'C'].forEach((id) => s.setMode(id, 'agent'));

test('private briefs stay with each teammate and never reach other viewers', () => {
  const s = fresh(postmortem);
  const a = s.view('A');
  const b = s.view('B');
  assert.ok(a.mine.notes.some((n) => n.text.includes('214 tickets')));
  assert.ok(!b.mine.notes.some((n) => n.text.includes('214 tickets')));
  assert.equal(a.all, undefined);
  assert.ok(!JSON.stringify(b).includes('214 tickets'));
  assert.ok(JSON.stringify(s.view('observer')).includes('214 tickets'));
});

test('agent prompts only contain their own private memory', () => {
  const s = fresh(postmortem);
  const ctx = s.buildCtx('B', { kind: 'group', text: 'hi' });
  assert.ok(ctx.pairMemory.includes('Deploy #4812'));
  assert.ok(!ctx.pairMemory.includes('214 tickets'));
  assert.ok(!ctx.pairMemory.includes('Try again'));
});

test("a teammate's DMs to their agent are kept as private thoughts", () => {
  const s = fresh();
  s.post({ pairId: 'A', channel: 'pair', text: 'I think the day 3 email matters most' });
  const note = s.pairMem.A.notes.at(-1);
  assert.equal(note.type, 'thought');
  assert.ok(!s.view('B').mine.notes.some((n) => n.text.includes('day 3 email matters')));
});

test('sharing a note moves it into team memory with provenance', () => {
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

test('agents split the work on the board, hand off over the agent channel, and deliver', async () => {
  const s = fresh();
  allAgents(s);
  s.runRound();
  await run(s);
  assert.equal(s.global.tasks.length, onboarding.subtasks.length);
  assert.deepEqual([...new Set(s.global.tasks.map((t) => t.owner))].sort(), ['A', 'B', 'C']);
  assert.ok(s.agentThread.some((m) => m.from === 'A' && m.to === 'B'));
  for (const id of ['B', 'C']) {
    const delivered = s.global.tasks.filter((t) => t.owner === id && t.artifacts.length);
    assert.ok(delivered.length, `${id} should deliver after the handoff`);
    assert.ok(delivered[0].artifacts[0].content.includes(s.pairMem[id].notes.find((n) => n.source.kind === 'system').text));
  }
  assert.ok(s.pairMem.B.notes.some((n) => n.type === 'worklog'), 'work done is logged in private memory');
  assert.ok(s.traces.A.at(-1).steps.some((st) => st.tool === 'team.create_task'));
});

test('in Human + agent mode, board changes and handoffs wait for the human', async () => {
  const s = fresh();
  s.setMode('B', 'agent');
  s.setMode('C', 'agent');
  s.runRound();
  await run(s);
  assert.equal(s.global.tasks.length, 0, 'nothing reaches the board before approval');
  assert.equal(s.agentThread.filter((m) => m.from === 'A').length, 0, 'handoffs are held with the draft');
  const draft = s.drafts.A.find((d) => d.status === 'pending');
  assert.ok(draft.effects.some((e) => e.type === 'create_task'));
  s.reviewDraft({ pairId: 'A', draftId: draft.id, action: 'approve' });
  assert.equal(s.global.tasks.length, onboarding.subtasks.length);
  assert.ok(s.global.tasks.every((t) => t.source.humanApproved));
  assert.ok(s.agentThread.some((m) => m.from === 'A' && m.to === 'B'));
  assert.ok(s.queue.some((j) => j.kind === 'agent_dm' && j.to === 'B'));
});

test('draft review updates the engagement user model', () => {
  const s = fresh();
  s.createDraft('A', { message: 'Draft one', rationale: 'r', motivation: 0.8 }, {});
  s.reviewDraft({ pairId: 'A', draftId: s.drafts.A.at(-1).id, action: 'edit', text: 'Draft one, but better' });
  s.createDraft('A', { message: 'Draft two', rationale: 'r', motivation: 0.8 }, {});
  s.reviewDraft({ pairId: 'A', draftId: s.drafts.A.at(-1).id, action: 'reject' });
  const e = s.pairMem.A.userModel.engagement;
  assert.equal(e.adapt, 1);
  assert.equal(e.reject, 1);
  assert.equal(s.group.find((m) => m.viaDraft === 'adapt').text, 'Draft one, but better');
});

test('on consequential tasks, agent-only deliverables and decisions need a human sign-off', async () => {
  const s = fresh(postmortem);
  allAgents(s);
  s.runRound();
  await run(s);
  const art = s.global.tasks.flatMap((t) => t.artifacts)[0];
  assert.equal(art.status, 'needs_signoff');
  assert.throws(() => s.signOff({ pairId: 'A', itemId: art.id }), SessionError);
  s.setMode('B', 'both');
  s.signOff({ pairId: 'B', itemId: art.id });
  assert.equal(art.status, 'active');

  s.applyMemory('C', [{ scope: 'global', type: 'decision', text: 'Roll back faster' }], { humanApproved: false });
  assert.equal(s.global.active().find((i) => i.text === 'Roll back faster').status, 'needs_signoff');
});

test('outside-platform writes follow the approval policy', async () => {
  assert.equal(externalWritePolicy({ mode: 'agent', criticalityRank: 1 }), 'run');
  assert.equal(externalWritePolicy({ mode: 'both', criticalityRank: 3 }), 'draft');
  assert.equal(externalWritePolicy({ mode: 'agent', criticalityRank: 2 }), 'signoff');

  const s = fresh(postmortem);
  s.setMode('C', 'agent');
  const agent = new Agent({ pairId: 'C', name: 'Cipher', humanName: 'Sam Rivera', focus: 'Design' });
  const ctx = s.buildCtx('C', { kind: 'group', text: '' });
  const tools = [
    { name: 'github.create_issue', server: 'github', readOnly: false },
    { name: 'github.search_issues', server: 'github', readOnly: true },
  ];
  const calls = [];
  const callExternal = async (name) => (calls.push(name), 'ok');
  const { Workspace } = await import('../src/tools.js');
  const ws = new Workspace(ctx.workspace);
  assert.equal(await agent.runTool({ tool: 'github.search_issues', args: { q: 'x' } }, ws, tools, callExternal, ctx), 'ok');
  const obs = await agent.runTool({ tool: 'github.create_issue', args: { title: 'Fix retries' } }, ws, tools, callExternal, ctx);
  assert.match(obs, /sign-off/);
  assert.deepEqual(calls, ['github.search_issues'], 'the write must not run yet');

  s.applyTeamEffects('C', ws.effects, { humanApproved: false });
  const ap = s.approvals[0];
  assert.equal(ap.status, 'pending');
  assert.throws(() => s.decideAction({ pairId: 'C', approvalId: ap.id, decision: 'approve' }), SessionError);
  s.decideAction({ pairId: 'A', approvalId: ap.id, decision: 'approve' });
  s.lease = { id: 'L', until: Date.now() + 1000 };
  const next = s.nextJob('L', 1000);
  assert.equal(next.approval.tool, 'github.create_issue');
  s.applyActionResult(ap.id, { ok: true, text: 'Created issue #12' });
  assert.equal(ap.status, 'done');
  assert.ok(s.pairMem.C.notes.some((n) => n.text.includes('#12')));
});

test('recovery after friction is classified', () => {
  const s = fresh();
  const m1 = s.post({ pairId: 'A', channel: 'group', text: 'Write the emails' });
  s.flagFriction({ pairId: 'A', messageId: m1.id, source: 'me' });
  s.post({ pairId: 'A', channel: 'group', text: 'Use Postmark merge fields only, and the activation goal is two invites in seven days' });
  assert.equal(s.frictions[0].recovery, 'repair');
  assert.equal(s.pairMem.A.userModel.recoveries.repair, 1);
});

test('state survives a snapshot round trip', () => {
  const s = fresh();
  s.post({ pairId: 'A', channel: 'group', text: 'hello' });
  const again = new Session({ snapshot: JSON.parse(JSON.stringify(s.toJSON())) });
  assert.equal(again.group.at(-1).text, 'hello');
  assert.equal(again.task.id, s.task.id);
  assert.equal(again.queue.length, s.queue.length);
  assert.deepEqual(again.view('B').mine.notes, s.view('B').mine.notes);
});

test('store + runtime: the job queue is persisted and drained under a lease', async () => {
  const store = createStore();
  await mutate(store, (s) => s.createTask(onboarding));
  await mutate(store, (s) => ['A', 'B', 'C'].forEach((id) => s.setMode(id, 'agent')));
  await mutate(store, (s) => s.runRound());
  let { session } = await readSession(store);
  assert.ok(session.queue.length >= 1, 'work is queued in stored state, not in process memory');

  await mutate(store, (s) => s.acquireLease('other-instance', 60_000));
  assert.equal((await drain(store)).reason, 'busy', 'only one drainer at a time');
  await mutate(store, (s) => (s.lease.until = 0));
  assert.ok((await drain(store)).ran > 0);
  ({ session } = await readSession(store));
  assert.equal(session.queue.length, 0);
  assert.equal(session.lease, null);
  assert.ok(session.global.tasks.some((t) => t.artifacts.length));
  assert.ok(!['A', 'B', 'C'].some((id) => session.isThinking(id)));
});

test('stale writes are rejected so concurrent requests cannot clobber each other', async () => {
  const store = createStore();
  const { version, data } = await store.read();
  assert.equal(await store.write({ a: 1 }, version), true);
  assert.equal(await store.write({ a: 2 }, version), false);
  assert.equal(data, null);
});

test('agency estimate follows who authored team messages', () => {
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
