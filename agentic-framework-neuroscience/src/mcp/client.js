import { spawn } from 'node:child_process';

/**
 * Minimal Model Context Protocol client: initialize, tools/list, tools/call.
 * Two transports from the MCP spec:
 *   - Streamable HTTP (remote servers; works on serverless hosts)
 *   - stdio (a local subprocess; only where processes can be spawned)
 */

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'triad', version: '0.3.0' };
const TIMEOUT_MS = 20000;

export class McpError extends Error {}

class HttpTransport {
  constructor({ url, headers = {} }) {
    this.url = url;
    this.headers = headers;
    this.sessionId = null;
    this.protocolVersion = null;
  }

  async send(message, { expectResponse = true } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
          ...(this.protocolVersion ? { 'mcp-protocol-version': this.protocolVersion } : {}),
          ...this.headers,
        },
        body: JSON.stringify(message),
      });
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;
      if (!expectResponse) return null;
      if (!res.ok) throw new McpError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('text/event-stream')) return readSse(await res.text(), message.id);
      return JSON.parse(await res.text());
    } catch (err) {
      if (err.name === 'AbortError') throw new McpError(`Timed out after ${TIMEOUT_MS / 1000}s`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  close() {}
}

// Picks the JSON-RPC response with the matching id out of an SSE body.
export function readSse(body, id) {
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      const msg = JSON.parse(data);
      if (msg.id === id && ('result' in msg || 'error' in msg)) return msg;
    } catch {
      // ignore keep-alives and partial events
    }
  }
  throw new McpError('No response found in the event stream.');
}

class StdioTransport {
  constructor({ command, args = [], env = {} }) {
    this.proc = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.pending = new Map();
    this.buffer = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let nl;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          const waiter = this.pending.get(msg.id);
          if (waiter) {
            this.pending.delete(msg.id);
            waiter.resolve(msg);
          }
        } catch {
          // servers may log non-JSON lines to stdout; skip them
        }
      }
    });
    this.proc.on('error', (err) => this.failAll(err));
    this.proc.on('exit', (code) => this.failAll(new McpError(`Server exited with code ${code}`)));
  }

  failAll(err) {
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
  }

  send(message, { expectResponse = true } = {}) {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    if (!expectResponse) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new McpError(`Timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);
      this.pending.set(message.id, {
        resolve: (m) => (clearTimeout(timer), resolve(m)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
    });
  }

  close() {
    this.proc.kill();
  }
}

export class McpClient {
  constructor(config) {
    this.config = config;
    this.transport = config.url ? new HttpTransport(config) : new StdioTransport(config);
    this.nextId = 1;
    this.ready = null;
    this.serverInfo = null;
  }

  async request(method, params) {
    const msg = { jsonrpc: '2.0', id: this.nextId++, method, params };
    const res = await this.transport.send(msg);
    if (res.error) throw new McpError(res.error.message ?? JSON.stringify(res.error));
    return res.result;
  }

  connect() {
    if (!this.ready) {
      this.ready = (async () => {
        const result = await this.request('initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        });
        this.serverInfo = result?.serverInfo ?? null;
        if (this.transport instanceof HttpTransport) this.transport.protocolVersion = result?.protocolVersion ?? PROTOCOL_VERSION;
        await this.transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, { expectResponse: false });
        return result;
      })();
      this.ready.catch(() => (this.ready = null));
    }
    return this.ready;
  }

  async listTools() {
    await this.connect();
    const tools = [];
    let cursor;
    do {
      const page = await this.request('tools/list', cursor ? { cursor } : {});
      tools.push(...(page?.tools ?? []));
      cursor = page?.nextCursor;
    } while (cursor && tools.length < 500);
    return tools;
  }

  async callTool(name, args = {}) {
    await this.connect();
    return this.request('tools/call', { name, arguments: args });
  }

  close() {
    this.transport.close();
  }
}

/** Flattens an MCP tool result into text an agent can read. */
export function resultText(result, limit = 4000) {
  const parts = (result?.content ?? []).map((c) => {
    if (c.type === 'text') return c.text;
    if (c.type === 'resource') return c.resource?.text ?? `[resource ${c.resource?.uri ?? ''}]`;
    return `[${c.type} content]`;
  });
  if (!parts.length && result?.structuredContent) parts.push(JSON.stringify(result.structuredContent));
  const text = parts.join('\n').trim() || '(empty result)';
  return (result?.isError ? 'ERROR: ' : '') + (text.length > limit ? `${text.slice(0, limit)}… [truncated]` : text);
}
