import { Session } from './session.js';
import { Agent } from './agent.js';

const MAX_RETRIES = 8;

/**
 * Loads the session, applies `fn`, and saves it with optimistic concurrency.
 * `fn` may run more than once on conflict, so it must only touch the session.
 */
export async function mutate(store, fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { version, data } = await store.read();
    const session = new Session({ snapshot: data });
    const result = await fn(session);
    const jobs = session.takeJobs();
    if (await store.write(session.toJSON(), version)) return { result, jobs, session };
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error('The session is busy. Please try again.');
}

export async function readSession(store) {
  const { version, data } = await store.read();
  return { version, session: new Session({ snapshot: data }) };
}

/**
 * Runs queued agent work. LLM calls happen between two short transactions, so a
 * slow model never blocks humans from posting in the meantime.
 */
export async function runJobs(store, jobs) {
  const queue = [...jobs];
  while (queue.length) {
    const job = queue.shift();
    const { result: planned } = await mutate(store, (s) => s.prepareJob(job));
    if (!planned.length) continue;
    const outs = Object.fromEntries(
      await Promise.all(planned.map(async (p) => [p.pairId, await new Agent(p.agent).think(p.ctx)]))
    );
    const { jobs: next } = await mutate(store, (s) => s.applyJob(job, outs));
    queue.push(...next);
  }
}
