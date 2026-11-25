import { htmlToText } from './mcp/web.js';

/**
 * Turns an uploaded or Slack-attached file into text the agents can read.
 * Only the extracted text is kept (capped), never the original bytes, so a
 * file costs a bounded amount of session storage.
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_CHARS = 60_000;
export const MAX_FILES = 15;
export const READ_CHUNK = 6000;

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'log', 'ini', 'toml', 'env.example', 'sql', 'diff', 'patch',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh',
  'css', 'scss', 'vue', 'svelte', 'graphql', 'proto', 'tf', 'dockerfile', 'gradle', 'r', 'scala', 'lua', 'dart',
]);

const ext = (name) => {
  const lower = String(name ?? '').toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  return lower.includes('.') ? lower.split('.').pop() : '';
};

export function fileKind(name, mime = '') {
  const e = ext(name);
  if (e === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (e === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (e === 'html' || e === 'htm' || mime === 'text/html') return 'html';
  if (TEXT_EXT.has(e) || mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('javascript')) return 'text';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'image';
  return 'binary';
}

/** Extracts readable text. Returns { text, pages?, note? }; never throws for unsupported types. */
export async function extractText(buffer, { name, mime = '' } = {}) {
  const kind = fileKind(name, mime);
  if (kind === 'pdf') {
    const { getDocumentProxy, extractText: pdfText } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await pdfText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    const body = pages.map((p, i) => `--- page ${i + 1} ---\n${p.trim()}`).join('\n\n');
    return { kind, text: body, pages: totalPages, note: body.replace(/--- page \d+ ---/g, '').trim() ? '' : 'No selectable text (likely a scanned PDF).' };
  }
  if (kind === 'docx') {
    const mammoth = await import('mammoth');
    const { value } = await (mammoth.default ?? mammoth).extractRawText({ buffer: Buffer.from(buffer) });
    return { kind, text: value };
  }
  if (kind === 'html') return { kind, text: htmlToText(Buffer.from(buffer).toString('utf8')) };
  if (kind === 'text') return { kind, text: Buffer.from(buffer).toString('utf8') };
  return { kind, text: '', note: kind === 'image' ? 'Images are stored by name only; the agents cannot see image contents.' : 'Unsupported file type; only the name is available.' };
}

/** Builds the stored file record from raw bytes. */
export async function buildFile({ id, name, mime, buffer, by, source = 'app', url = null }) {
  if (buffer.length > MAX_FILE_BYTES) throw new Error(`File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  const { kind, text, pages, note } = await extractText(buffer, { name, mime });
  const clean = String(text ?? '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
  return {
    id,
    ts: Date.now(),
    name: String(name).slice(0, 160),
    mime: mime || null,
    kind,
    size: buffer.length,
    pages: pages ?? null,
    chars: clean.length,
    truncated: clean.length > MAX_FILE_CHARS,
    note: note || '',
    by,
    source,
    url,
    text: clean.slice(0, MAX_FILE_CHARS),
  };
}

/** One chunk of a file for the agent, with a pointer to the next chunk. */
export function readChunk(file, offset = 0) {
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const part = file.text.slice(start, start + READ_CHUNK);
  const end = start + part.length;
  const head = `${file.name} (${file.kind}${file.pages ? `, ${file.pages} pages` : ''}, ${file.chars} chars${file.truncated ? `, stored text cut at ${MAX_FILE_CHARS}` : ''}) chars ${start}-${end}`;
  if (!file.text) return `${head}\n${file.note || '(no text)'}`;
  const more = end < file.text.length ? `\n[more: call team.read_file again with offset ${end}]` : '\n[end of file]';
  return `${head}\n${part}${more}`;
}

export const fileSummary = (f) => `[${f.id}] ${f.name} (${f.kind}${f.pages ? `, ${f.pages}p` : ''}, ${f.chars} chars) shared by ${f.by}`;
