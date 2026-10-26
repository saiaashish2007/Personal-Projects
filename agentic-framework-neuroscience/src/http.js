import { SessionError, PAIR_IDS } from './session.js';
import { PRESETS } from './presets.js';
import { describeProvider } from './llm.js';
import { mutate, readSession, runJobs } from './runtime.js';

const VIEWERS = [...PAIR_IDS, 'observer'];
const ACCESS_CODE = process.env.ACCESS_CODE || '';

const ACTIONS = {
  createTask: (s, b) => {
    const preset = b.preset ? PRESETS.find((p) => p.key === b.preset) : null;
    if (b.preset && !preset) throw new SessionError(`Unknown preset "${b.preset}".`);
    s.createTask(preset ?? b);
  },
  setMode: (s, b) => s.setMode(b.pairId, b.mode),
  setPairConfig: (s, b) => s.setPairConfig(b.pairId, b),
  post: (s, b) => s.post(b),
  reviewDraft: (s, b) => s.reviewDraft(b),
  flagFriction: (s, b) => s.flagFriction(b),
  addMemory: (s, b) => s.addMemory(b),
  shareNote: (s, b) => s.shareNote(b),
  signOff: (s, b) => s.signOff(b),
  removeMemory: (s, b) => s.removeMemory(b),
  runRound: (s) => s.runRound(),
  reset: (s) => s.reset(),
};

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

function authorized(request) {
  return !ACCESS_CODE || request.headers.get('x-access-code') === ACCESS_CODE;
}

/**
 * Framework-free request handler shared by the local Node server and the
 * Vercel functions. `waitUntil` keeps background agent turns alive after the
 * response has been sent.
 */
export async function handleApi(request, { store, waitUntil }) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

  try {
    if (route === 'config') return json({ gated: Boolean(ACCESS_CODE), llm: describeProvider() });
    if (!authorized(request)) return json({ error: 'Access code required.' }, 401);

    if (request.method === 'GET' && route === 'state') {
      const viewer = url.searchParams.get('as');
      if (!VIEWERS.includes(viewer)) return json({ error: 'as must be A, B, C, or observer' }, 400);
      const { version, session } = await readSession(store);
      if (String(version) === url.searchParams.get('v') && !PAIR_IDS.some((id) => session.isThinking(id))) {
        return json({ version, unchanged: true });
      }
      return json({ version, view: session.view(viewer) });
    }

    if (request.method === 'GET' && route === 'presets') {
      return json(PRESETS.map(({ key, title, criticality, description }) => ({ key, title, criticality, description })));
    }

    if (request.method === 'GET' && route === 'export') {
      const { session } = await readSession(store);
      return json(session.exportData(), 200, { 'content-disposition': `attachment; filename="triad-session-${Date.now()}.json"` });
    }

    if (request.method === 'POST' && route === 'action') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body.' }, 400);
      }
      const handler = ACTIONS[body?.type];
      if (!handler) return json({ error: `Unknown action "${body?.type}".` }, 400);
      const { jobs } = await mutate(store, (s) => handler(s, body));
      if (jobs.length) waitUntil(runJobs(store, jobs).catch((err) => console.error('[jobs]', err)));
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof SessionError) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: err.message || 'Server error.' }, 500);
  }
}
