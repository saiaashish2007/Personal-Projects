import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, SessionError, PAIR_IDS } from './src/session.js';
import { PRESETS } from './src/presets.js';
import { describeProvider } from './src/llm.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8790);
const VIEWERS = [...PAIR_IDS, 'observer'];

const clients = new Set();
let broadcastTimer = null;

const session = new Session({
  dataDir: path.join(root, 'data'),
  onChange: () => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(broadcast, 40);
  },
});

// Each client gets its own filtered view, so pair-private threads and memory never
// leave the server for anyone except that pair and the observer.
function broadcast() {
  for (const c of clients) c.res.write(`data: ${JSON.stringify(session.view(c.viewer))}\n\n`);
}

const STATIC = {
  '/': ['public/index.html', 'text/html'],
  '/app.js': ['public/app.js', 'text/javascript'],
  '/style.css': ['public/style.css', 'text/css'],
};

const actions = {
  createTask: (b) => {
    const preset = b.preset ? PRESETS.find((p) => p.key === b.preset) : null;
    return session.createTask(preset ?? b);
  },
  setMode: (b) => session.setMode(b.pairId, b.mode),
  setPairConfig: (b) => session.setPairConfig(b.pairId, b),
  post: (b) => session.post(b),
  reviewDraft: (b) => session.reviewDraft(b),
  flagFriction: (b) => session.flagFriction(b),
  addMemory: (b) => session.addMemory(b),
  shareNote: (b) => session.shareNote(b),
  signOff: (b) => session.signOff(b),
  removeMemory: (b) => session.removeMemory(b),
  runRound: () => session.runRound(),
  reset: () => session.reset(),
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new SessionError('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    return send(res, 200, fs.readFileSync(path.join(root, file)), type);
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    const viewer = url.searchParams.get('as');
    if (!VIEWERS.includes(viewer)) return send(res, 400, { error: 'as must be A, B, C, or observer' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const client = { viewer, res };
    clients.add(client);
    res.write(`data: ${JSON.stringify(session.view(viewer))}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(client);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/presets') return send(res, 200, PRESETS.map(({ key, title, criticality }) => ({ key, title, criticality })));

  if (req.method === 'GET' && url.pathname === '/api/export') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="triad-session-${Date.now()}.json"`,
    });
    return res.end(JSON.stringify(session.exportData(), null, 2));
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    try {
      const body = await readBody(req);
      const handler = actions[body.type];
      if (!handler) return send(res, 400, { error: `Unknown action "${body.type}".` });
      await handler(body);
      return send(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof SessionError) return send(res, 400, { error: err.message });
      console.error(err);
      return send(res, 500, { error: 'Server error.' });
    }
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  const { provider, model } = describeProvider();
  console.log(`Triad collab running at http://127.0.0.1:${PORT}`);
  console.log(`  Pair views: /?as=A  /?as=B  /?as=C    Observer: /?as=observer`);
  console.log(`  Agents: ${provider === 'offline' ? 'offline heuristic agents (set ANTHROPIC_API_KEY or OPENAI_API_KEY for LLM agents)' : `${provider} · ${model}`}`);
});
