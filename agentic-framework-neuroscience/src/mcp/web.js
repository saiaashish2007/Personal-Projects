import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 300_000;
const MAX_CHARS = 6000;

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Not a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs are allowed.');
  const addrs = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error('That host is not publicly reachable.');
  return url;
}

export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Built-in, read-only web reader so agents can research during a task. */
export const webServer = {
  id: 'web',
  label: 'Web reader',
  async listTools() {
    return [
      {
        name: 'fetch_url',
        description: 'Fetch a public web page and return its readable text (first ~6,000 characters).',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        annotations: { readOnlyHint: true },
      },
    ];
  },
  async callTool(name, args = {}) {
    if (name !== 'fetch_url') return { isError: true, content: [{ type: 'text', text: `Unknown tool "${name}"` }] };
    const url = await assertPublicUrl(args.url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual', headers: { 'user-agent': 'TriadAgent/0.3 (+research prototype)' } });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        return { content: [{ type: 'text', text: `Redirects to ${next}. Call fetch_url again with that URL if needed.` }] };
      }
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = res.headers.get('content-type') ?? '';
      const text = type.includes('html') ? htmlToText(raw) : raw;
      return { content: [{ type: 'text', text: `HTTP ${res.status} ${url.href}\n${text.slice(0, MAX_CHARS)}` }] };
    } finally {
      clearTimeout(timer);
    }
  },
};
