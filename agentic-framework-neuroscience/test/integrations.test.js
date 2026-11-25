import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { McpClient, readSse, resultText } from '../src/mcp/client.js';
import { verifySlackSignature } from '../src/slack.js';
import { Session } from '../src/session.js';
import { PRESETS } from '../src/presets.js';
import { assertPublicUrl, htmlToText } from '../src/mcp/web.js';

// A tiny Streamable HTTP MCP server. `sse` switches responses to text/event-stream.
function fakeMcpServer({ sse }) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const msg = JSON.parse(raw);
    seen.push({ method: msg.method, session: req.headers['mcp-session-id'] ?? null });
    if (!('id' in msg)) return res.writeHead(202).end();
    const result =
      msg.method === 'initialize'
        ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } }
        : msg.method === 'tools/list'
          ? msg.params?.cursor
            ? { tools: [{ name: 'create_issue', description: 'Create an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }] }
            : { tools: [{ name: 'search_issues', annotations: { readOnlyHint: true } }], nextCursor: 'p2' }
          : { content: [{ type: 'text', text: `called ${msg.params.name} with ${JSON.stringify(msg.params.arguments)}` }] };
    const body = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result });
    const headers = { 'mcp-session-id': 'sess-1', 'content-type': sse ? 'text/event-stream' : 'application/json' };
    res.writeHead(200, headers).end(sse ? `event: message\ndata: ${body}\n\n` : body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/mcp` })));
}

for (const sse of [false, true]) {
  test(`MCP client talks Streamable HTTP (${sse ? 'SSE' : 'JSON'} responses)`, async () => {
    const { server, seen, url } = await fakeMcpServer({ sse });
    try {
      const client = new McpClient({ url });
      const tools = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name), ['search_issues', 'create_issue'], 'follows pagination');
      const out = resultText(await client.callTool('create_issue', { title: 'Fix retries' }));
      assert.equal(out, 'called create_issue with {"title":"Fix retries"}');
      assert.deepEqual(seen.map((s) => s.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/list', 'tools/call']);
      assert.equal(seen.at(-1).session, 'sess-1', 'reuses the server session id');
    } finally {
      server.close();
    }
  });
}

test('model replies with raw newlines inside strings still parse', async () => {
  const { parseJson } = await import('../src/llm.js');
  const reply = 'Sure:\n{"thought":"done","action":{"tool":"team.submit_work","args":{"title":"Review","content":"## Summary\nLooks good.\n\t- one nit"}}}';
  assert.equal(parseJson(reply).action.args.content, '## Summary\nLooks good.\n\t- one nit');
});

test('readSse skips keep-alives and picks the matching response', () => {
  const body = ': ping\n\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n';
  assert.deepEqual(readSse(body, 7).result, { ok: true });
});

test('Slack request signatures are verified with a replay window', () => {
  const secret = 'shh';
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"event_callback"}';
  const sig = `v0=${crypto.createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
  assert.equal(verifySlackSignature({ secret, timestamp: ts, signature: sig, body }), true);
  assert.equal(verifySlackSignature({ secret, timestamp: ts, signature: sig, body: body + ' ' }), false);
  assert.equal(verifySlackSignature({ secret, timestamp: String(Number(ts) - 600), signature: sig, body }), false);
  assert.equal(verifySlackSignature({ secret: '', timestamp: ts, signature: sig, body }), false);
});

test('Slack replies from mapped users join the team thread once', () => {
  process.env.SLACK_USER_MAP = JSON.stringify({ U1: 'B' });
  try {
    const s = new Session();
    s.createTask(PRESETS[0]);
    s.slack.threadTs = '111.1';
    assert.ok(s.ingestSlack({ eventId: 'E1', user: 'U1', text: 'From Slack', threadTs: '111.1' }).posted);
    assert.equal(s.ingestSlack({ eventId: 'E1', user: 'U1', text: 'From Slack', threadTs: '111.1' }).ignored, 'duplicate');
    assert.equal(s.ingestSlack({ eventId: 'E3', user: 'U1', text: 'x', threadTs: '999.9' }).ignored, 'other thread');
    const msg = s.group.at(-1);
    assert.equal(msg.pairId, 'B');
    assert.equal(msg.source, 'slack');
    assert.ok(s.queue.some((j) => j.kind === 'group'), 'agents react to Slack messages');
  } finally {
    delete process.env.SLACK_USER_MAP;
  }
});

test('the web reader refuses private addresses and strips markup', async () => {
  await assert.rejects(assertPublicUrl('http://127.0.0.1/admin'));
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest'));
  await assert.rejects(assertPublicUrl('file:///etc/passwd'));
  assert.equal(htmlToText('<style>x{}</style><h1>Hi</h1><p>there &amp; you</p>').replace(/\s+/g, ' ').trim(), 'Hi there & you');
});
