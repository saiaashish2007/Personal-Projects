import { Session } from './session.js';
import { Agent } from './agent.js';
import { loadTools, callTool } from './mcp/registry.js';
import { postToSlack } from './slack.js';
import { newId } from './memory.js';

const MAX_RETRIES = 8;
const LEASE_MS = 150_000;
const DEFAULT_BUDGET_MS = Number(process.env.DRAIN_BUDGET_MS || 60_000);

/**
 * Loads the session, applies `fn`, and saves it with optimistic concurrency.
 * `fn` may run more than once on conflict, so it must only touch the session.
 */
export async function mutate(store, fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { version, data } = await store.read();
    const session = new Session({ snapshot: data });
    const result = await fn(session);
    if (await store.write(session.toJSON(), version)) return { result, session };
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error('The session is busy. Please try again.');
}

export async function readSession(store) {
  const { version, data } = await store.read();
  return { version, session: new Session({ snapshot: data }) };
}

export function needsDrain(session) {
  return session.queue.length > 0 && !session.leaseActive();
}

/**
 * Drains the persisted job queue. Only one drainer holds the lease at a time;
 * LLM and network calls run between short transactions so humans can keep
 * posting. Stops after `budgetMs` and leaves the rest for the next drain.
 */
export async function drain(store, { budgetMs = DEFAULT_BUDGET_MS } = {}) {
  const leaseId = newId('lease');
  const { result: got } = await mutate(store, (s) => s.acquireLease(leaseId, LEASE_MS));
  if (!got) return { ran: 0, reason: 'busy' };

  const started = Date.now();
  let ran = 0;
  try {
    while (Date.now() - started < budgetMs) {
      const { result: next } = await mutate(store, (s) => s.nextJob(leaseId, LEASE_MS));
      if (!next) break;
      ran += 1;
      await runOne(store, next);
    }
  } finally {
    await mutate(store, (s) => s.releaseLease(leaseId)).catch(() => {});
  }
  return { ran };
}

async function runOne(store, { job, planned, payload, approval }) {
  if (job.kind === 'slack_out') {
    try {
      const res = await postToSlack(payload);
      await mutate(store, (s) => s.applySlackResult(job.messageId, res));
    } catch (err) {
      await mutate(store, (s) => s.changed('slack_error', { message: err.message.slice(0, 200) }));
    }
    return;
  }

  if (job.kind === 'run_action') {
    let res;
    try {
      res = { ok: true, text: await callTool(approval.tool, approval.args) };
    } catch (err) {
      res = { ok: false, text: err.message };
    }
    await mutate(store, (s) => s.applyActionResult(approval.id, res));
    return;
  }

  const { tools } = await loadTools().catch(() => ({ tools: [] }));
  const outs = Object.fromEntries(
    await Promise.all(
      planned.map(async (p) => {
        const onStep = (label) => mutate(store, (s) => s.setProgress(p.pairId, label)).catch(() => {});
        const out = await new Agent(p.agent).think(p.ctx, { tools, callExternal: callTool, onStep });
        return [p.pairId, out];
      })
    )
  );
  await mutate(store, (s) => s.applyJob(job, outs));
}
