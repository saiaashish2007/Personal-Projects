import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './src/http.js';
import { createStore } from './src/store.js';
import { describeProvider } from './src/llm.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8790);
const store = createStore({ file: path.join(root, 'data', 'session.json') });
const waitUntil = (promise) => promise.catch((err) => console.error('[jobs]', err));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(root, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
  return true;
}

async function toRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const response = await handleApi(await toRequest(req), { store, waitUntil });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  if (req.method === 'GET' && serveStatic(url.pathname, res)) return;
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const { provider, model } = describeProvider();
  console.log(`Triad running at http://127.0.0.1:${PORT}`);
  console.log(`  Agents: ${provider === 'offline' ? 'offline heuristic agents (set CURSOR_API_KEY in .env for LLM agents)' : `${provider} · ${model}`}`);
  console.log(`  Storage: ${process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'Postgres' : 'local file (data/session.json)'}`);
});
