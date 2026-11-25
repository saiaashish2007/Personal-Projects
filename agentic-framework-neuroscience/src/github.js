/**
 * Built-in GitHub connector for code review. Reads work on public repos with no
 * token (60 requests/hour per IP); GITHUB_TOKEN raises the limit, unlocks private
 * repos, and is required for the write tools. Writes go through Triad's approval
 * policy like every other outside write.
 */

const API = 'https://api.github.com';
const MAX_DIFF_CHARS = 10_000;
const MAX_FILE_CHARS = 12_000;

const token = () => process.env.GITHUB_TOKEN || '';

export function parseRef(args = {}) {
  const fromUrl = String(args.url ?? '').match(/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/(\d+)/);
  if (fromUrl) return { repo: fromUrl[1], number: Number(fromUrl[2]) };
  const repo = String(args.repo ?? '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  return { repo, number: args.number != null ? Number(args.number) : null };
}

function needRepo(repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Pass repo as "owner/name" (or a PR url).');
}

async function gh(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  const headers = { accept, 'user-agent': 'TriadAgent/0.3', 'x-github-api-version': '2022-11-28' };
  if (token()) headers.authorization = `Bearer ${token()}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    if (res.status === 403 && /rate limit/i.test(msg)) throw new Error('GitHub rate limit hit. Set GITHUB_TOKEN for more requests.');
    if (res.status === 404) throw new Error(`Not found on GitHub (${path}). Private repos need GITHUB_TOKEN.`);
    throw new Error(`GitHub ${res.status}: ${msg.slice(0, 200)}`);
  }
  return accept.includes('diff') ? res.text() : res.json();
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const TOOLS = [
  {
    name: 'list_pull_requests',
    description: 'List open (or closed/all) pull requests in a repo.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] } }, required: ['repo'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_pull_request',
    description: 'PR overview: title, author, description, branches, size, checks, and the list of changed files.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, number: { type: 'number' }, url: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_pr_diff',
    description: 'The PR diff as per-file patches (optionally one file). Use this to review the actual changes.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, number: { type: 'number' }, url: { type: 'string' }, path: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_file',
    description: 'Read a file from the repo at a branch, tag, or commit (defaults to the default branch). Use it for surrounding code the diff does not show.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' }, ref: { type: 'string' } }, required: ['repo', 'path'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_pr_comments',
    description: 'Existing review comments and discussion on a PR, so you do not repeat them.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, number: { type: 'number' }, url: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_pr_review',
    description: 'Post a review on a PR: a summary plus optional line comments [{path, line, body}]. event: COMMENT, REQUEST_CHANGES, or APPROVE.',
    inputSchema: {
      type: 'object',
      properties: { repo: { type: 'string' }, number: { type: 'number' }, url: { type: 'string' }, body: { type: 'string' }, event: { type: 'string', enum: ['COMMENT', 'REQUEST_CHANGES', 'APPROVE'] }, comments: { type: 'array' } },
      required: ['body'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a PR or issue conversation.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, number: { type: 'number' }, url: { type: 'string' }, body: { type: 'string' } }, required: ['body'] },
    annotations: { readOnlyHint: false },
  },
];

async function prFiles(repo, number) {
  const files = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

async function call(name, args = {}) {
  const { repo, number } = parseRef(args);
  needRepo(repo);
  const needNumber = () => {
    if (!Number.isInteger(number) || number <= 0) throw new Error('Pass the PR number (or a PR url).');
  };

  if (name === 'list_pull_requests') {
    const prs = await gh(`/repos/${repo}/pulls?state=${args.state ?? 'open'}&per_page=20`);
    return prs.map((p) => `#${p.number} ${p.title} — ${p.user?.login}, ${p.draft ? 'draft, ' : ''}${p.head?.ref} → ${p.base?.ref}, updated ${p.updated_at?.slice(0, 10)}`).join('\n') || '(no pull requests)';
  }

  if (name === 'get_pull_request') {
    needNumber();
    const [pr, files] = await Promise.all([gh(`/repos/${repo}/pulls/${number}`), prFiles(repo, number)]);
    let checks = '';
    try {
      const st = await gh(`/repos/${repo}/commits/${pr.head.sha}/status`);
      checks = st.total_count ? `${st.state} (${st.statuses.map((s) => `${s.context}: ${s.state}`).slice(0, 6).join(', ')})` : 'no status checks';
    } catch {
      checks = 'unknown';
    }
    return [
      `#${pr.number} ${pr.title}`,
      `Author: ${pr.user?.login} · State: ${pr.state}${pr.merged ? ' (merged)' : ''}${pr.draft ? ' · draft' : ''}`,
      `Branches: ${pr.head?.label} → ${pr.base?.label} · head ${pr.head?.sha?.slice(0, 7)}`,
      `Size: +${pr.additions} −${pr.deletions} across ${pr.changed_files} files · ${pr.commits} commits · Checks: ${checks}`,
      `Mergeable: ${pr.mergeable ?? 'unknown'} · URL: ${pr.html_url}`,
      '',
      'Description:',
      (pr.body ?? '(none)').slice(0, 2500),
      '',
      'Changed files:',
      ...files.map((f) => `- ${f.filename} (${f.status}, +${f.additions} −${f.deletions})`),
    ].join('\n');
  }

  if (name === 'get_pr_diff') {
    needNumber();
    let files = await prFiles(repo, number);
    if (args.path) files = files.filter((f) => f.filename === args.path || f.filename.endsWith(`/${args.path}`));
    if (!files.length) return args.path ? `No changed file matches "${args.path}".` : '(no file changes)';
    let out = '';
    const skipped = [];
    for (const f of files) {
      const block = `### ${f.filename} (${f.status}, +${f.additions} −${f.deletions})\n${f.patch ? f.patch : '(binary or too large for an inline patch)'}\n\n`;
      if (out.length + block.length > MAX_DIFF_CHARS) {
        skipped.push(f.filename);
        continue;
      }
      out += block;
    }
    if (skipped.length) out += `[Not shown to stay within limits: ${skipped.join(', ')}. Call get_pr_diff with path to read one.]`;
    return out.trim();
  }

  if (name === 'get_file') {
    const path = String(args.path ?? '').replace(/^\//, '');
    if (!path) throw new Error('Pass the file path.');
    const ref = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
    const f = await gh(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${ref}`);
    if (Array.isArray(f)) return `${path} is a directory:\n${f.map((e) => `- ${e.name}${e.type === 'dir' ? '/' : ''}`).join('\n')}`;
    const body = Buffer.from(f.content ?? '', 'base64').toString('utf8');
    const numbered = body.split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');
    return `${path}${args.ref ? ` @ ${args.ref}` : ''} (${f.size} bytes)\n${numbered.slice(0, MAX_FILE_CHARS)}${numbered.length > MAX_FILE_CHARS ? '\n[truncated]' : ''}`;
  }

  if (name === 'list_pr_comments') {
    needNumber();
    const [reviews, issueComments] = await Promise.all([gh(`/repos/${repo}/pulls/${number}/comments?per_page=50`), gh(`/repos/${repo}/issues/${number}/comments?per_page=50`)]);
    const lines = [
      ...reviews.map((c) => `- ${c.user?.login} on ${c.path}:${c.line ?? c.original_line ?? '?'}: ${c.body.slice(0, 300)}`),
      ...issueComments.map((c) => `- ${c.user?.login}: ${c.body.slice(0, 300)}`),
    ];
    return lines.join('\n') || '(no comments yet)';
  }

  if (name === 'create_pr_review' || name === 'add_comment') {
    if (!token()) throw new Error('Posting to GitHub needs GITHUB_TOKEN.');
    needNumber();
    const body = String(args.body ?? '').trim();
    if (!body) throw new Error('The review body is empty.');
    if (name === 'add_comment') {
      const c = await gh(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: { body } });
      return `Commented on ${repo}#${number}: ${c.html_url}`;
    }
    const comments = Array.isArray(args.comments)
      ? args.comments.filter((c) => c?.path && c?.body && Number(c.line) > 0).map((c) => ({ path: c.path, line: Number(c.line), side: 'RIGHT', body: String(c.body) }))
      : [];
    const event = ['COMMENT', 'REQUEST_CHANGES', 'APPROVE'].includes(args.event) ? args.event : 'COMMENT';
    const r = await gh(`/repos/${repo}/pulls/${number}/reviews`, { method: 'POST', body: { body, event, comments } });
    return `Posted a ${event} review on ${repo}#${number} with ${comments.length} line comment(s): ${r.html_url}`;
  }

  throw new Error(`Unknown GitHub tool "${name}".`);
}

export const githubServer = {
  id: 'github',
  label: 'GitHub',
  async listTools() {
    return TOOLS;
  },
  async callTool(name, args = {}) {
    try {
      return text(await call(name, args));
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  },
};
