import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const CURSOR_KEY = process.env.CURSOR_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export const provider = CURSOR_KEY ? 'cursor' : ANTHROPIC_KEY ? 'anthropic' : OPENAI_KEY ? 'openai' : 'offline';

const DEFAULT_MODELS = { cursor: 'composer-2.5', anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o-mini', offline: 'offline-heuristic' };
const model = process.env.LLM_MODEL || DEFAULT_MODELS[provider];
const TIMEOUT_MS = 45000;

export function describeProvider() {
  return { provider, model };
}

export async function complete({ system, user, maxTokens = 700 }) {
  if (provider === 'cursor') return completeWithCursor(`${system}\n\n---\n\n${user}`);

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.map((c) => c.text ?? '').join('') ?? '';
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  return null;
}

let sdkPromise = null;
let agentCwd = null;

// The Cursor SDK runs a full agent loop. `tools: []` strips every built-in tool
// (shell, file edits, search), so the agent can only answer in text and user
// messages cannot make it act on the server it runs on.
async function completeWithCursor(prompt) {
  if (!sdkPromise) {
    // Serverless filesystems are read-only outside /tmp; the SDK keeps its run store under HOME.
    if (process.env.VERCEL) process.env.HOME = os.tmpdir();
    sdkPromise = import('@cursor/sdk');
  }
  const { Agent } = await sdkPromise;
  if (!agentCwd) {
    agentCwd = path.join(os.tmpdir(), 'triad-agent-cwd');
    fs.mkdirSync(agentCwd, { recursive: true });
  }
  const run = Agent.prompt(prompt, {
    apiKey: CURSOR_KEY,
    model: { id: model },
    tools: [],
    local: { cwd: agentCwd, settingSources: [] },
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Cursor agent timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([run, timeout]);
    if (result.status !== 'finished') throw new Error(`Cursor agent run ended with status "${result.status}"`);
    return result.result ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export function parseJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
