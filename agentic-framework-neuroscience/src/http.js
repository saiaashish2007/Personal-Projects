import { SessionError, PAIR_IDS } from './session.js';
import { PRESETS } from './presets.js';
import { describeProvider } from './llm.js';
import { mutate, readSession, drain, needsDrain } from './runtime.js';
import { listConnectors, loadTools } from './mcp/registry.js';
import { slackConfig, slackEnabled, verifySlackSignature } from './slack.js';

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
  post: (s, b) => s.post({ pairId: b.pairId, channel: b.channel, text: b.text }),
  reviewDraft: (s, b) => s.reviewDraft(b),
  decideAction: (s, b) => s.decideAction(b),
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

function kick(store, waitUntil) {
  waitUntil(drain(store).catch((err) => console.error('[drain]', err)));
}

/** Connector list for the UI, without secrets or internal handles. */
function publicConnectors(probe) {
  return listConnectors().map(({ id, label, why, setup, env, status, url, command, custom, builtin }) => ({
    id,
    label: label ?? id,
    why,
    setup,
    env,
    status,
    transport: url ? 'http' : command ? 'stdio' : builtin ? 'built-in' : 'your MCP server',
    custom: Boolean(custom),
    probe: probe?.status?.[id] ?? null,
    tools: probe ? probe.tools.filter((t) => t.server === id).map(({ name, description, readOnly }) => ({ name, description, readOnly })) : null,
  }));
}

async function slackEvents(request, { store, waitUntil }) {
  const raw = await request.text();
  const ok = verifySlackSignature({
    secret: slackConfig().secret,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    body: raw,
  });
  if (!ok) return json({ error: 'Bad signature.' }, 401);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (body.type === 'url_verification') return json({ challenge: body.challenge });
  const ev = body.event;
  if (body.type !== 'event_callback' || ev?.type !== 'message' || ev.subtype || ev.bot_id || !ev.text) return json({ ok: true, ignored: true });
  if (ev.channel !== slackConfig().channel) return json({ ok: true, ignored: 'other channel' });
  const { result } = await mutate(store, (s) => s.ingestSlack({ eventId: body.event_id, user: ev.user, text: ev.text, threadTs: ev.thread_ts ?? null }));
  kick(store, waitUntil);
  return json({ ok: true, ...result });
}

/**
 * Framework-free request handler shared by the local Node server and the
 * Vercel functions. `waitUntil` keeps the queue drain alive after the response
 * has been sent; any request that sees queued work with no active drainer
 * starts one, so a drain that hit its time limit is picked up by the next poll.
 */
export async function handleApi(request, { store, waitUntil }) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

  try {
    if (route === 'config') return json({ gated: Boolean(ACCESS_CODE), llm: describeProvider(), slack: slackEnabled(), storage: store.kind ?? 'memory' });
    if (request.method === 'POST' && route === 'slack/events') return await slackEvents(request, { store, waitUntil });
    if (!authorized(request)) return json({ error: 'Access code required.' }, 401);

    if (request.method === 'GET' && route === 'state') {
      const viewer = url.searchParams.get('as');
      if (!VIEWERS.includes(viewer)) return json({ error: 'as must be A, B, C, or observer' }, 400);
      const { version, session } = await readSession(store);
      if (needsDrain(session)) kick(store, waitUntil);
      if (String(version) === url.searchParams.get('v') && !PAIR_IDS.some((id) => session.isThinking(id))) {
        return json({ version, unchanged: true });
      }
      return json({ version, view: session.view(viewer) });
    }

    if (request.method === 'GET' && route === 'presets') {
      return json(PRESETS.map(({ key, title, criticality, description, channel }) => ({ key, title, criticality, description, channel })));
    }

    if (request.method === 'GET' && route === 'connectors') {
      const probe = url.searchParams.get('probe') ? await loadTools({ force: true }) : null;
      return json({ connectors: publicConnectors(probe) });
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
      const { session } = await mutate(store, (s) => handler(s, body));
      if (needsDrain(session)) kick(store, waitUntil);
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof SessionError) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: err.message || 'Server error.' }, 500);
  }
}
