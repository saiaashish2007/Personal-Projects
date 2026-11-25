import crypto from 'node:crypto';

/**
 * Slack bridge. With a bot token, the team thread is mirrored into a real
 * Slack thread, and replies from mapped Slack users flow back in as that
 * teammate. Env:
 *   SLACK_BOT_TOKEN       xoxb-… (scopes: app_mentions:read, chat:write, chat:write.customize, channels:history, channels:read, users:read, files:read)
 *   SLACK_SIGNING_SECRET  verifies the Events API webhook
 *   SLACK_CHANNEL_ID      channel the team thread lives in
 *   SLACK_USER_MAP        JSON map of Slack user id → teammate, e.g. {"U012ABC":"A","U034DEF":"B"}
 */

export const slackConfig = () => ({
  token: process.env.SLACK_BOT_TOKEN || '',
  secret: process.env.SLACK_SIGNING_SECRET || '',
  channel: process.env.SLACK_CHANNEL_ID || '',
  userMap: parseMap(process.env.SLACK_USER_MAP),
});

export const slackEnabled = () => {
  const c = slackConfig();
  return Boolean(c.token && c.channel);
};

function parseMap(raw) {
  try {
    const m = JSON.parse(raw || '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

export async function slackApi(method, body = {}, { token = slackConfig().token } = {}) {
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set.');
  const isRead = /\.(history|replies|list|info)$/.test(method);
  const res = isRead
    ? await fetch(`https://slack.com/api/${method}?${new URLSearchParams(body)}`, { headers: { authorization: `Bearer ${token}` } })
    : await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error ?? res.status}`);
  return data;
}

const names = new Map();

/** Display name for a Slack user id (cached per instance; needs users:read). */
export async function slackUserName(user) {
  if (!user) return null;
  if (names.has(user)) return names.get(user);
  try {
    const d = await slackApi('users.info', { user });
    const name = d.user?.profile?.display_name || d.user?.real_name || d.user?.name || null;
    names.set(user, name);
    return name;
  } catch {
    return null;
  }
}

/** Downloads a file shared in Slack (needs files:read). */
export async function downloadSlackFile(file, { token = slackConfig().token } = {}) {
  const url = file.url_private_download || file.url_private;
  if (!url) throw new Error('Slack file has no download URL.');
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Slack file download failed (${res.status}).`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html') && !String(file.name).toLowerCase().endsWith('.html')) throw new Error('Slack returned a login page; add the files:read scope.');
  return Buffer.from(await res.arrayBuffer());
}

/** Verifies a Slack Events API request (v0 HMAC-SHA256, 5-minute replay window). */
export function verifySlackSignature({ secret, timestamp, signature, body, now = Date.now() }) {
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Posts one Triad team-thread message into the mirrored Slack thread. */
export async function postToSlack({ text, author, isAgent, threadTs, taskTitle }) {
  const { channel } = slackConfig();
  let root = threadTs;
  if (!root) {
    const head = await slackApi('chat.postMessage', {
      channel,
      text: `:thread: *Triad task:* ${taskTitle ?? 'Team thread'}\nReplies in this thread are shared with the team's AI agents.`,
    });
    root = head.ts;
  }
  const res = await slackApi('chat.postMessage', {
    channel,
    thread_ts: root,
    text,
    username: author,
    icon_emoji: isAgent ? ':robot_face:' : ':bust_in_silhouette:',
  });
  return { threadTs: root, ts: res.ts };
}

/** Built-in MCP-shaped server so agents can read and write Slack through the same tool interface as remote MCP servers. */
export const slackServer = {
  id: 'slack',
  label: 'Slack',
  async listTools() {
    return [
      {
        name: 'channel_history',
        description: 'Read the latest messages in a Slack channel (defaults to the team channel).',
        inputSchema: { type: 'object', properties: { channel: { type: 'string' }, limit: { type: 'number' } } },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'read_thread',
        description: 'Read all replies in a Slack thread.',
        inputSchema: { type: 'object', properties: { channel: { type: 'string' }, thread_ts: { type: 'string' } }, required: ['thread_ts'] },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'list_channels',
        description: 'List public channels in the workspace.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'post_message',
        description: 'Post a message to a Slack channel or thread outside the team thread.',
        inputSchema: { type: 'object', properties: { channel: { type: 'string' }, text: { type: 'string' }, thread_ts: { type: 'string' } }, required: ['text'] },
        annotations: { readOnlyHint: false },
      },
    ];
  },
  async callTool(name, args = {}) {
    const channel = args.channel || slackConfig().channel;
    const text = (rows) => ({ content: [{ type: 'text', text: rows }] });
    const fmt = (msgs) => msgs.map((m) => `[${m.ts}] ${m.user ?? m.username ?? 'bot'}: ${m.text}`).join('\n') || '(no messages)';
    if (name === 'channel_history') {
      const d = await slackApi('conversations.history', { channel, limit: String(Math.min(Number(args.limit) || 20, 50)) });
      return text(fmt([...d.messages].reverse()));
    }
    if (name === 'read_thread') {
      const d = await slackApi('conversations.replies', { channel, ts: args.thread_ts, limit: '50' });
      return text(fmt(d.messages));
    }
    if (name === 'list_channels') {
      const d = await slackApi('conversations.list', { exclude_archived: 'true', limit: '100' });
      return text(d.channels.map((c) => `#${c.name} (${c.id})`).join('\n'));
    }
    if (name === 'post_message') {
      const d = await slackApi('chat.postMessage', { channel, text: args.text, ...(args.thread_ts ? { thread_ts: args.thread_ts } : {}) });
      return text(`Posted to ${channel} at ${d.ts}`);
    }
    return { isError: true, content: [{ type: 'text', text: `Unknown Slack tool "${name}"` }] };
  },
};
