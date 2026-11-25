import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient, resultText } from './client.js';
import { webServer } from './web.js';
import { slackServer } from '../slack.js';

/**
 * Connector registry. Every platform is reached through the same MCP surface
 * (listTools / callTool), whether it is a built-in server, a remote
 * Streamable-HTTP server, or a local stdio server.
 *
 * Extra servers can be added without code via MCP_SERVERS (JSON array) or a
 * mcp.config.json file in the project root:
 *   [{ "id": "jira", "label": "Jira", "url": "https://…/mcp", "headers": { "Authorization": "Bearer ${JIRA_TOKEN}" } }]
 *   [{ "id": "gdrive", "label": "Google Drive", "command": "npx", "args": ["-y", "some-gdrive-mcp"], "env": {} }]
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_MS = 5 * 60 * 1000;
const MAX_TOOLS_PER_SERVER = 14;

export const CATALOG = [
  {
    id: 'slack',
    label: 'Slack',
    why: 'Where the team already talks. Agents read channel history and threads, and the team thread is mirrored into a real Slack thread.',
    builtin: slackServer,
    env: ['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID'],
    setup: 'Create a Slack app, add a bot token with chat:write, chat:write.customize, channels:history, channels:read, then set SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_SIGNING_SECRET and SLACK_USER_MAP. Point Event Subscriptions at /api/slack/events.',
  },
  {
    id: 'github',
    label: 'GitHub',
    why: 'Engineering work: read code and issues, open issues and PR comments for tasks the team splits up.',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' },
    env: ['GITHUB_TOKEN'],
    tools: ['search_repositories', 'get_file_contents', 'list_issues', 'get_issue', 'search_issues', 'create_issue', 'add_issue_comment', 'list_pull_requests', 'get_pull_request'],
    setup: "Set GITHUB_TOKEN to a fine-grained personal access token. Uses GitHub's official remote MCP server.",
  },
  {
    id: 'linear',
    label: 'Linear',
    why: 'Task tracking: agents turn the team board into real tickets and update their status.',
    url: 'https://mcp.linear.app/mcp',
    headers: { Authorization: 'Bearer ${LINEAR_API_KEY}' },
    env: ['LINEAR_API_KEY'],
    setup: "Set LINEAR_API_KEY to a personal API key. Uses Linear's official remote MCP server.",
  },
  {
    id: 'notion',
    label: 'Notion',
    why: 'Docs and wikis: agents read specs and publish finished deliverables as pages.',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    childEnv: { NOTION_TOKEN: '${NOTION_TOKEN}' },
    env: ['NOTION_TOKEN'],
    localOnly: true,
    setup: 'Set NOTION_TOKEN to an internal integration secret and share the relevant pages with it. Runs as a local stdio server, so it works with npm start but not on Vercel.',
  },
  {
    id: 'google-drive',
    label: 'Google Drive & Docs',
    why: 'Most companies keep briefs, sheets, and meeting notes here.',
    env: [],
    custom: true,
    setup: 'Add a Google Drive MCP server to MCP_SERVERS or mcp.config.json (remote URL with an OAuth token header, or a local stdio command).',
  },
  {
    id: 'jira',
    label: 'Jira & Confluence',
    why: 'Common alternative to Linear and Notion in larger companies.',
    env: [],
    custom: true,
    setup: "Add Atlassian's remote MCP server to MCP_SERVERS or mcp.config.json with an OAuth bearer token.",
  },
  {
    id: 'web',
    label: 'Web reader',
    why: 'Lets agents research public pages while doing a task.',
    builtin: webServer,
    env: [],
    setup: 'Built in. Read-only; private and internal addresses are blocked.',
  },
];

const expand = (value) => String(value).replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '');
const expandAll = (obj = {}) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, expand(v)]));

function customServers() {
  const out = [];
  const sources = [];
  if (process.env.MCP_SERVERS) sources.push(process.env.MCP_SERVERS);
  const file = path.join(root, 'mcp.config.json');
  if (fs.existsSync(file)) sources.push(fs.readFileSync(file, 'utf8'));
  for (const raw of sources) {
    try {
      const list = JSON.parse(raw);
      for (const s of Array.isArray(list) ? list : list.servers ?? []) if (s?.id && (s.url || s.command)) out.push({ ...s, custom: true });
    } catch (err) {
      console.error('[mcp] Could not parse MCP server config:', err.message);
    }
  }
  return out;
}

const canSpawn = () => !process.env.VERCEL;

/** All known connectors with their configuration status (no network calls). */
export function listConnectors() {
  const custom = customServers();
  const entries = CATALOG.map((c) => {
    const override = custom.find((s) => s.id === c.id);
    const def = override ? { ...c, ...override, builtin: null } : c;
    const configured = def.builtin ? def.env.every((k) => process.env[k]) : def.custom && !override ? false : def.env.every((k) => process.env[k]);
    let status = configured ? 'ready' : 'not_configured';
    if (configured && def.command && !canSpawn()) status = 'local_only';
    return { ...def, status };
  });
  for (const s of custom) {
    if (!CATALOG.some((c) => c.id === s.id)) {
      entries.push({ ...s, label: s.label ?? s.id, why: s.why ?? 'Custom MCP server.', env: [], status: s.command && !canSpawn() ? 'local_only' : 'ready' });
    }
  }
  return entries;
}

const clients = new Map();
let cache = null;

function clientFor(def) {
  if (def.builtin) return def.builtin;
  if (!clients.has(def.id)) {
    clients.set(
      def.id,
      new McpClient(
        def.url ? { url: expand(def.url), headers: expandAll(def.headers) } : { command: def.command, args: def.args ?? [], env: expandAll(def.childEnv ?? def.env ?? {}) }
      )
    );
  }
  return clients.get(def.id);
}

export function isReadOnly(tool) {
  const hint = tool.annotations?.readOnlyHint;
  if (typeof hint === 'boolean') return hint;
  return /^(get|list|search|read|fetch|find|query|describe|view|lookup)/i.test(tool.name);
}

/** Connects to every ready connector and returns their tools, cached per instance. */
export async function loadTools({ force = false } = {}) {
  if (cache && !force && Date.now() - cache.at < CACHE_MS) return cache;
  const ready = listConnectors().filter((c) => c.status === 'ready');
  const status = {};
  const tools = [];
  await Promise.all(
    ready.map(async (def) => {
      try {
        let list = await clientFor(def).listTools();
        if (def.tools?.length) {
          const picked = list.filter((t) => def.tools.includes(t.name));
          list = picked.length ? picked : list;
        }
        list = list.slice(0, MAX_TOOLS_PER_SERVER);
        for (const t of list) {
          tools.push({
            name: `${def.id}.${t.name}`,
            server: def.id,
            tool: t.name,
            description: (t.description ?? '').split('\n')[0].slice(0, 200),
            args: summarizeSchema(t.inputSchema),
            readOnly: isReadOnly(t),
          });
        }
        status[def.id] = { ok: true, tools: list.length };
      } catch (err) {
        status[def.id] = { ok: false, error: err.message.slice(0, 200) };
        clients.delete(def.id);
      }
    })
  );
  cache = { at: Date.now(), tools, status };
  return cache;
}

export async function callTool(fullName, args) {
  const [serverId, ...rest] = fullName.split('.');
  const def = listConnectors().find((c) => c.id === serverId && c.status === 'ready');
  if (!def) throw new Error(`Connector "${serverId}" is not configured.`);
  const result = await clientFor(def).callTool(rest.join('.'), args ?? {});
  return resultText(result);
}

export function summarizeSchema(schema) {
  const props = schema?.properties ?? {};
  const req = new Set(schema?.required ?? []);
  const parts = Object.entries(props)
    .slice(0, 8)
    .map(([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${v?.type ?? (v?.enum ? v.enum.join('|') : 'any')}`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}

/** Lets tests inject fake connectors. */
export function _setCacheForTests(value) {
  cache = value;
}
