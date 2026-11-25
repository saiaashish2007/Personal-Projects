const PAIRS = ['A', 'B', 'C'];
const VIEWERS = [...PAIRS, 'observer'];
const CODE_KEY = 'triad-access-code';
const viewer = new URLSearchParams(location.search).get('as');
const app = document.getElementById('app');
const ui = {
  view: 'team',
  traces: new Set(),
  editing: null,
  revising: null,
  flagOpen: null,
  modal: null,
  settings: false,
  nav: false,
  drawer: false,
  connectors: null,
  probing: false,
  seen: {},
};
let state = null;
let version = -1;
let config = { gated: false };
let presets = [];
let code = localStorage.getItem(CODE_KEY) || '';
let pollTimer = null;
let pollFailures = 0;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const $ = (id) => document.getElementById(id);
const pair = (id) => state?.pairs.find((p) => p.id === id);
const first = (name = '') => name.split(' ')[0];
const initials = (name = '') => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const ICONS = {
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  board: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/>',
  memory: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0Z"/><path d="M12 18v4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16V9M12 16V5M17 16v-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1Z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  slack: '<rect x="3" y="10" width="8" height="3" rx="1.5"/><rect x="13" y="11" width="8" height="3" rx="1.5"/><rect x="10" y="3" width="3" height="8" rx="1.5"/><rect x="11" y="13" width="3" height="8" rx="1.5"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24">${ICONS[name] ?? ''}</svg>`;
const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#ce9e33" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="6" r="2.4" fill="#ce9e33"/><circle cx="6" cy="17" r="2.4" fill="#ce9e33"/><circle cx="18" cy="17" r="2.4" fill="#ce9e33"/><path d="M12 8.5v3.5M10 13.2l-2.6 2M14 13.2l2.6 2" opacity=".8"/></svg>';
const dots = '<span class="dots"><i></i><i></i><i></i></span>';

const MODE_HINT = {
  human: 'You work alone. Your agent sits this task out.',
  both: 'Your agent drafts; nothing reaches the team until you approve it.',
  agent: 'Your agent works for you and posts on its own.',
};
const CRIT_CLASS = { ephemeral: 'grey', operational: 'blue', consequential: 'amber', high_stakes: 'red' };
const STATUS_LABEL = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
const PROGRESS = (label) => (label === 'planning' ? 'Planner is thinking' : label === 'reviewer' ? 'Reviewer is checking' : `Worker: ${label}`);

init();

async function init() {
  try {
    config = await fetch('/api/config').then((r) => r.json());
  } catch {
    config = { gated: false };
  }
  if (!VIEWERS.includes(viewer) || (config.gated && !code)) return renderLogin();
  boot();
}

// ---------- plumbing ----------

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-access-code': code, ...(opts.headers ?? {}) } });
  if (res.status === 401) {
    localStorage.removeItem(CODE_KEY);
    code = '';
    clearTimeout(pollTimer);
    renderLogin('Your access code is missing or no longer valid.');
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function act(type, payload = {}) {
  try {
    await api('/api/action', { method: 'POST', body: JSON.stringify({ type, ...payload }) });
    poll();
    setTimeout(poll, 500);
    return true;
  } catch (err) {
    if (err.message !== 'unauthorized') toast(err.message);
    return false;
  }
}

async function poll() {
  clearTimeout(pollTimer);
  try {
    const r = await api(`/api/state?as=${viewer}&v=${version}`);
    pollFailures = 0;
    if (!r.unchanged) {
      state = r.view;
      version = r.version;
      render();
    }
  } catch (err) {
    if (err.message === 'unauthorized') return;
    if (++pollFailures === 3) toast('Connection problem. Retrying…');
  }
  const busy = state?.pairs?.some((p) => p.thinking) || state?.queued;
  pollTimer = setTimeout(poll, document.hidden ? 6000 : busy ? 1000 : 2000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state) poll();
});

window.addEventListener('resize', () => {
  const wide = window.innerWidth > 1180;
  const desktopNav = window.innerWidth > 760;
  if ((wide && ui.drawer) || (desktopNav && ui.nav)) {
    if (wide) ui.drawer = false;
    if (desktopNav) ui.nav = false;
    const shell = app.querySelector('.shell');
    if (shell) {
      shell.classList.toggle('nav-open', ui.nav);
      shell.classList.toggle('drawer-open', ui.drawer);
    }
  }
});

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3600);
}

// Replaces a region only when its markup changed, keeping focus, caret, and
// scroll position so live updates don't interrupt someone who is typing.
function setHTML(el, html, { stickBottom = false } = {}) {
  if (!el || el.__html === html) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  const active = document.activeElement;
  const key = active && el.contains(active) ? active.dataset.key : null;
  const sel = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const value = key && 'value' in active ? active.value : null;
  el.innerHTML = html;
  el.__html = html;
  if (key) {
    const again = el.querySelector(`[data-key="${key}"]`);
    if (again) {
      if (value != null) again.value = value;
      again.focus();
      if (sel && again.setSelectionRange) again.setSelectionRange(...sel);
    }
  }
  if (stickBottom && (nearBottom || !el.__scrolled)) {
    el.scrollTop = el.scrollHeight;
    el.__scrolled = true;
  }
}

// Small, safe markdown: escapes first, then headings, lists, bold, italics, code, links.
function md(text = '') {
  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<i>$2</i>')
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  for (const raw of esc(text).split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      if (!list) out.push((list = []));
      list.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    list = null;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) out.push(`<h${Math.min(h[1].length + 2, 6)}>${inline(h[2])}</h${Math.min(h[1].length + 2, 6)}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  return out.map((x) => (Array.isArray(x) ? `<ul>${x.join('')}</ul>` : x)).join('');
}

// ---------- login / seat picker ----------

function renderLogin(error = '') {
  let seat = VIEWERS.includes(viewer) ? viewer : 'A';
  const seats = [
    ['A', 'Maya Chen', 'Product Manager · agent Atlas'],
    ['B', 'Dev Patel', 'Software Engineer · agent Beacon'],
    ['C', 'Sam Rivera', 'Product Designer · agent Cipher'],
    ['observer', 'Observer', 'Researcher view of every teammate, with metrics'],
  ];
  app.innerHTML = `
    <div class="login">
      <section class="login-left">
        <div class="brand"><div class="brand-mark">${LOGO}</div><div><div class="brand-name">Triad</div><span class="brand-sub">Human–AI teamwork</span></div></div>
        <div>
          <h1 class="wordmark">Every teammate<br/>gets an <span>agent.</span></h1>
          <p class="lede">A team works in one channel. Each person has a personal AI agent that remembers their private notes, does real work on the shared board, and coordinates with the other agents. Each person decides, per task, how much their agent does on its own.</p>
          <ul class="login-points">
            <li>${icon('brain')} Each agent runs a Planner, a Worker, and a Reviewer on every turn</li>
            <li>${icon('memory')} Private memory per person, plus shared team memory and a task board</li>
            <li>${icon('plug')} Connects to Slack, GitHub, Linear, Notion, and more through MCP</li>
          </ul>
        </div>
        <div class="hint">Grounded in “Human–AI Collaboration at Scale” (250,000 conversations).</div>
      </section>
      <section class="login-right">
        <form class="login-card" id="loginForm">
          <div class="eyebrow">Join the workspace</div>
          <h2>Who are you?</h2>
          <div class="hint">Open each seat on that person's own screen. A seat only sees its own private DM and memory.</div>
          <div class="seat-list">
            ${seats
              .map(
                ([id, label, sub]) => `
              <button type="button" class="seat ${id === seat ? 'on' : ''}" data-seat="${id}">
                <div class="avatar a-${id}">${id === 'observer' ? icon('eye') : initials(label)}</div>
                <div><b>${label}</b><small>${sub}</small></div>
                <span class="radio"></span>
              </button>`
              )
              .join('')}
          </div>
          ${config.gated ? `<label class="sr" for="who">Seat</label><input class="sr" id="who" name="username" autocomplete="username" value="Pair ${esc(seat)}" /><label class="field-label" for="code">Access code</label><input class="input" id="code" type="password" autocomplete="current-password" placeholder="Access code" value="${esc(code)}" />` : ''}
          <div class="login-error" id="loginError">${esc(error)}</div>
          <button class="btn primary wide" type="submit">Enter workspace ${icon('send')}</button>
        </form>
      </section>
    </div>`;
  const form = $('loginForm');
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seat]');
    if (!b) return;
    seat = b.dataset.seat;
    form.querySelectorAll('.seat').forEach((s) => s.classList.toggle('on', s === b));
    const who = $('who');
    if (who) who.value = seat === 'observer' ? 'Observer' : `Pair ${seat}`;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (config.gated) {
      code = $('code').value.trim();
      const ok = await fetch(`/api/state?as=${seat}`, { headers: { 'x-access-code': code } }).then((r) => r.status !== 401);
      if (!ok) return ($('loginError').textContent = 'That access code is not right.');
      localStorage.setItem(CODE_KEY, code);
    }
    location.search = `?as=${seat}`;
  });
}

// ---------- app shell ----------

async function boot() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main">
        <div id="banner"></div>
        <header class="topbar" id="topbar"></header>
        <div class="content" id="content"></div>
      </main>
      <aside class="panel" id="panel"></aside>
      <button class="scrim" type="button" data-act="dismiss" aria-label="Close menu"></button>
    </div>
    <div id="modal"></div>`;
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('keydown', onKey);
  presets = await api('/api/presets').catch(() => []);
  poll();
}

function waitingCount() {
  if (!state || !PAIRS.includes(viewer)) return 0;
  const drafts = state.mine?.drafts?.length ?? 0;
  const approvals = (state.approvals ?? []).filter((a) => a.status === 'pending').length;
  const signoffs = (state.board ?? []).flatMap((t) => (t.artifacts ?? []).filter((x) => x.status === 'needs_signoff')).length;
  return drafts + approvals + signoffs;
}

function render() {
  if (!state) return;
  if (!PAIRS.includes(viewer) && ui.view === 'dm') ui.view = 'team';
  const shell = app.querySelector('.shell');
  if (shell) {
    shell.classList.toggle('nav-open', ui.nav);
    shell.classList.toggle('drawer-open', ui.drawer);
  }
  setHTML(
    $('banner'),
    config.storage === 'memory'
      ? `<div class="storage-banner">${icon('alert')} This session lives in this tab only. Other seats will not see the same board.</div>`
      : ''
  );
  setHTML($('sidebar'), sidebarHTML());
  setHTML($('topbar'), topbarHTML());
  renderContent();
  setHTML($('panel'), viewer === 'observer' ? observerPanelHTML() : panelHTML());
  setHTML($('modal'), modalHTML());
  for (const [k, n] of Object.entries(counts())) if (ui.view === k) ui.seen[k] = n;
}

function counts() {
  return { team: state.group.length, agents: state.agentThread.length, dm: state.mine?.thread.length ?? 0 };
}

function unread(view) {
  const n = counts()[view];
  return n != null && ui.seen[view] != null && n > ui.seen[view] && ui.view !== view ? n - ui.seen[view] : 0;
}

function sidebarHTML() {
  const me = pair(viewer);
  const item = (view, ic, label, extra = '') => {
    const u = unread(view);
    return `<button class="nav ${ui.view === view ? 'on' : ''}" data-act="view" data-view="${view}">${ic}<span>${label}</span>${u ? `<em class="badge">${u}</em>` : ''}${extra}</button>`;
  };
  const llm = state.llm;
  return `
    <div class="ws">
      <div class="brand-mark sm">${LOGO}</div>
      <div><div class="ws-name">${esc(state.workspace.name)}</div><div class="ws-sub">${state.workspace.slack ? `${icon('slack')} mirrored to Slack` : 'Triad workspace'}</div></div>
    </div>
    ${
      me
        ? `<div class="me"><div class="avatar a-${me.id}">${initials(me.humanName)}</div><div><b>${esc(me.humanName)}</b><small>${esc(me.title)}</small></div></div>`
        : `<div class="me"><div class="avatar a-observer">${icon('eye')}</div><div><b>Observer</b><small>Research view</small></div></div>`
    }
    <div class="nav-group">
      <div class="nav-title">Channels</div>
      ${item('team', icon('hash'), esc(state.workspace.channel))}
      ${item('agents', icon('bot'), 'agent-sync')}
    </div>
    ${
      me
        ? `<div class="nav-group"><div class="nav-title">Direct messages</div>
           ${item('dm', `<span class="avatar xs bot a-${me.id}">${icon('bot')}</span>`, `${esc(me.agentName)} <small>your agent</small>`, me.thinking ? dots : '')}</div>`
        : ''
    }
    <div class="nav-group">
      <div class="nav-title">Workspace</div>
      ${item('board', icon('board'), `Board <small>${state.board.length || ''}</small>`)}
      ${item('memory', icon('memory'), 'Memory')}
      ${item('connectors', icon('plug'), 'Connectors')}
      ${viewer === 'observer' ? item('research', icon('chart'), 'Research') : ''}
    </div>
    <div class="side-foot">
      <div class="llm ${llm.provider === 'offline' ? 'off' : ''}" title="Model calls today">
        <i></i><span>${llm.provider === 'offline' ? 'Offline agents' : esc(llm.model)}</span>
        ${llm.provider === 'offline' ? '' : `<small>${llm.callsToday}/${llm.dailyCap}</small>`}
      </div>
      <div class="foot-row">
        <a class="ghost" href="/api/export" data-act="export" title="Export session data">${icon('download')}</a>
        ${viewer === 'observer' ? `<button class="ghost" data-act="reset" title="Reset session">${icon('reset')}</button>` : ''}
        <button class="ghost" data-act="logout" title="Switch seat">${icon('logout')}</button>
      </div>
    </div>`;
}

function topbarHTML() {
  const t = state.task;
  const titles = {
    team: `${icon('hash')} ${esc(state.workspace.channel)}`,
    agents: `${icon('bot')} agent-sync`,
    dm: `${icon('lock')} ${esc(pair(viewer)?.agentName ?? '')}`,
    board: `${icon('board')} Board`,
    memory: `${icon('memory')} Memory`,
    connectors: `${icon('plug')} Connectors`,
    research: `${icon('chart')} Research`,
  };
  return `
    <div class="tb-left">
      <button type="button" class="ghost only-narrow" data-act="nav" title="Channels">${icon('menu')}</button>
      <div class="tb-copy">
        <h1>${titles[ui.view]}</h1>
        ${t ? `<div class="tb-task"><span class="pill ${CRIT_CLASS[t.criticality]}">${esc(state.criticality[t.criticality].label)}</span><span title="${esc(t.title)}">${esc(t.title)}</span></div>` : '<div class="tb-task muted">No task yet</div>'}
      </div>
    </div>
    <div class="tb-right">
      <div class="members">
        ${state.pairs
          .map(
            (p) => `<div class="member" title="${esc(p.humanName)} · ${esc(state.modes[p.mode].label)}${p.thinking ? ` · ${esc(p.agentName)} ${PROGRESS(p.thinking.label)}` : ''}">
              <div class="avatar sm a-${p.id} ${p.mode === 'agent' ? 'away' : ''}">${initials(p.humanName)}</div>
              ${p.mode !== 'human' ? `<div class="avatar xs bot a-${p.id} ${p.thinking ? 'busy' : ''}">${icon('bot')}</div>` : ''}
            </div>`
          )
          .join('')}
      </div>
      ${t ? `<button class="btn" data-act="round" title="Ask every agent to move the work forward">${icon('play')} Run agents</button>` : ''}
      <button class="btn primary" data-act="modal" data-modal="task">${icon('plus')} New task</button>
      <button type="button" class="ghost only-drawer" data-act="drawer" title="Your agent">${icon('panel')}${waitingCount() ? `<em class="badge">${waitingCount()}</em>` : ''}</button>
    </div>`;
}

// ---------- main views ----------

function renderContent() {
  const el = $('content');
  const view = ui.view;
  if (el.dataset.view !== view) {
    el.dataset.view = view;
    el.__html = null;
    el.innerHTML = ['team', 'dm', 'agents'].includes(view) ? '<div class="feed" id="feed"></div><div id="composer"></div>' : '<div class="page" id="page"></div>';
  }
  if (view === 'team') {
    setHTML($('feed'), state.task ? teamFeedHTML() : emptyTaskHTML(), { stickBottom: true });
    setHTML($('composer'), composerHTML('group'));
  } else if (view === 'dm') {
    setHTML($('feed'), dmFeedHTML(), { stickBottom: true });
    setHTML($('composer'), composerHTML('pair'));
  } else if (view === 'agents') {
    setHTML($('feed'), agentFeedHTML(), { stickBottom: true });
    setHTML($('composer'), '<div class="composer-note">Agents coordinate here with team.message_agent: handoffs, questions, and work in progress. Humans read along.</div>');
  } else if (view === 'board') setHTML($('page'), boardHTML());
  else if (view === 'memory') setHTML($('page'), memoryHTML());
  else if (view === 'connectors') setHTML($('page'), connectorsHTML());
  else if (view === 'research') setHTML($('page'), researchHTML());
}

function emptyTaskHTML() {
  return `<div class="empty-hero">
    <div class="brand-mark lg">${LOGO}</div>
    <h2>Start a team task</h2>
    <p>Pick a scenario. Each teammate gets private information that only their agent knows, so the best result needs the agents to split the work and share what matters.</p>
    <button class="btn primary" data-act="modal" data-modal="task">${icon('plus')} New task</button>
  </div>`;
}

function avatarFor(m) {
  if (m.kind === 'system') return `<div class="avatar sys">${LOGO}</div>`;
  const p = pair(m.pairId);
  return m.kind === 'agent' ? `<div class="avatar bot a-${m.pairId}">${icon('bot')}</div>` : `<div class="avatar a-${m.pairId}">${initials(p?.humanName)}</div>`;
}

function traceFor(pairId, traceId) {
  if (!traceId) return null;
  const pool = viewer === 'observer' ? state.all?.[pairId]?.traces : pairId === viewer ? state.mine?.traces : null;
  return pool?.find((t) => t.id === traceId) ?? null;
}

function messageHTML(m, { flaggable = false } = {}) {
  if (m.kind === 'system') return `<div class="sysline">${esc(m.text)} <time>${time(m.ts)}</time></div>`;
  const p = pair(m.pairId);
  const name = m.kind === 'agent' ? `${esc(p?.agentName)} <span class="tag bot">AI</span> <small>for ${esc(first(p?.humanName))}</small>` : esc(p?.humanName);
  const tags = [
    m.viaDraft === 'direct' ? `<span class="tag ok">${icon('check')} approved by ${esc(first(p?.humanName))}</span>` : '',
    m.viaDraft === 'adapt' ? `<span class="tag ok">${icon('edit')} edited by ${esc(first(p?.humanName))}</span>` : '',
    m.kind === 'agent' && !m.viaDraft && m.channel === 'group' ? '<span class="tag warn">posted on its own</span>' : '',
    m.clarifying ? '<span class="tag info">question</span>' : '',
    m.source === 'slack' ? `<span class="tag">${icon('slack')} Slack</span>` : '',
  ].join('');
  const trace = traceFor(m.pairId, m.traceId);
  const open = ui.traces.has(m.id);
  return `
    <div class="msg ${m.kind}" id="m-${m.id}">
      ${avatarFor(m)}
      <div class="msg-body">
        <div class="msg-head"><b>${name}</b><time>${time(m.ts)}</time>${tags}</div>
        <div class="md">${md(m.text)}</div>
        ${
          m.kind === 'agent' && (trace || m.rationale)
            ? `<button class="why" data-act="trace" data-id="${m.id}">${icon('brain')} ${open ? 'Hide' : 'Show'} reasoning${trace ? ` · ${trace.steps.length} step${trace.steps.length === 1 ? '' : 's'}` : ''}</button>
               ${open ? (trace ? traceHTML(trace) : `<div class="trace"><div class="tr-row"><b>Rationale</b><span>${esc(m.rationale)}</span></div></div>`) : ''}`
            : ''
        }
      </div>
      ${
        flaggable
          ? `<div class="msg-tools">
               <button class="ghost" data-act="flag" data-id="${m.id}" title="Something went wrong here">${icon('flag')}</button>
               ${ui.flagOpen === m.id ? `<div class="flag-pop"><span>Who caused the problem?</span><button data-act="friction" data-id="${m.id}" data-src="me">Me</button><button data-act="friction" data-id="${m.id}" data-src="agent">The agent</button><button data-act="friction" data-id="${m.id}" data-src="both">Both</button></div>` : ''}
             </div>`
          : ''
      }
    </div>`;
}

function traceHTML(t) {
  const step = (s, i) => `
    <li><div class="st-head"><span class="crew w">Worker</span><code>${esc(s.tool)}</code>${s.afterReview ? '<span class="tag">after review</span>' : ''}</div>
      ${s.thought ? `<div class="st-thought">${esc(s.thought)}</div>` : ''}
      <details><summary>Input and result</summary><pre>${esc(JSON.stringify(s.args, null, 2))}</pre><pre>${esc(s.observation)}</pre></details></li>`;
  return `<div class="trace">
    <div class="tr-row"><span class="crew p">Planner</span><span>${t.plan.length ? t.plan.map(esc).join(' → ') : 'Decided without a multi-step plan'}${t.motivation != null ? ` <small>(relevance ${Number(t.motivation).toFixed(2)})</small>` : ''}</span></div>
    ${t.steps.length ? `<ol class="steps">${t.steps.map(step).join('')}</ol>` : ''}
    ${t.review ? `<div class="tr-row"><span class="crew r">Reviewer</span><span>${t.review.verdict === 'revise' ? `Sent it back: ${esc(t.review.issues.join('; '))}${t.review.revised ? '. The Worker revised it.' : ''}` : t.review.issues?.length ? esc(t.review.issues.join('; ')) : 'Approved'}</span></div>` : ''}
    <div class="tr-meta">${t.offline ? 'Offline heuristic' : `${t.calls} model call${t.calls === 1 ? '' : 's'}`} · ${(t.ms / 1000).toFixed(1)}s${t.error ? ` · <span class="err">${esc(t.error)}</span>` : ''}</div>
  </div>`;
}

function thinkingHTML(ids) {
  return state.pairs
    .filter((p) => ids.includes(p.id) && p.thinking)
    .map((p) => `<div class="msg typing"><div class="avatar bot a-${p.id}">${icon('bot')}</div><div class="msg-body"><div class="msg-head"><b>${esc(p.agentName)}</b></div><div class="typing-line">${dots} ${esc(PROGRESS(p.thinking.label))}</div></div></div>`)
    .join('');
}

function dayDivider(list, i) {
  const d = new Date(list[i].ts).toDateString();
  return i === 0 || new Date(list[i - 1].ts).toDateString() !== d ? `<div class="day"><span>${new Date(list[i].ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>` : '';
}

function teamFeedHTML() {
  const t = state.task;
  const flaggable = PAIRS.includes(viewer);
  const intro = `<div class="channel-intro">
      <h2>${icon('hash')} ${esc(state.workspace.channel)}</h2>
      <p><b>${esc(t.title)}</b></p>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
      ${t.subtasks?.length ? `<p class="muted">Suggested split: ${t.subtasks.map(esc).join(' · ')}</p>` : ''}
    </div>`;
  const msgs = state.group.map((m, i) => dayDivider(state.group, i) + messageHTML(m, { flaggable })).join('');
  return intro + msgs + thinkingHTML(state.pairs.filter((p) => p.mode === 'agent').map((p) => p.id));
}

function dmFeedHTML() {
  const me = pair(viewer);
  const intro = `<div class="channel-intro">
      <div class="avatar lg bot a-${me.id}">${icon('bot')}</div>
      <h2>${esc(me.agentName)}</h2>
      <p>Your personal agent. Only you can see this conversation. What you tell it is saved to your private memory, and it uses that memory when it works for you in #${esc(state.workspace.channel)}.</p>
      <p class="muted">Try: “Work on my task”, “Remember that legal wants the address in the footer”, or “What did Beacon send you?”</p>
    </div>`;
  const thread = state.mine.thread;
  return intro + thread.map((m, i) => dayDivider(thread, i) + messageHTML(m, { flaggable: m.kind === 'agent' })).join('') + thinkingHTML([viewer]);
}

function agentFeedHTML() {
  if (!state.agentThread.length) {
    return `<div class="channel-intro"><h2>${icon('bot')} agent-sync</h2><p>Messages between agents show up here: who takes which task, questions about each other's notes, and work handed over. Run the agents on a task to see them coordinate.</p></div>`;
  }
  return (
    `<div class="channel-intro"><h2>${icon('bot')} agent-sync</h2><p>Agent-to-agent coordination for this task.</p></div>` +
    state.agentThread
      .map(
        (m, i) => `${dayDivider(state.agentThread, i)}<div class="msg agent">
        <div class="avatar bot a-${m.from}">${icon('bot')}</div>
        <div class="msg-body"><div class="msg-head"><b>${esc(pair(m.from)?.agentName)}</b><span class="arrow">→</span><b>${esc(pair(m.to)?.agentName)}</b><time>${time(m.ts)}</time></div><div class="md">${md(m.text)}</div></div>
      </div>`
      )
      .join('') +
    thinkingHTML(PAIRS)
  );
}

function composerHTML(channel) {
  if (!state.task) return '';
  const me = pair(viewer);
  if (!me) return '<div class="composer-note">Observers read along. Pick a teammate seat to take part.</div>';
  if (channel === 'group' && me.mode === 'agent') {
    return `<div class="composer-note">${icon('bot')} You chose <b>Agent only</b>, so ${esc(me.agentName)} speaks for you here. Switch modes in the right panel to post yourself.</div>`;
  }
  if (channel === 'pair' && me.mode === 'human') {
    return `<div class="composer-note">${icon('lock')} You chose <b>Human only</b>, so ${esc(me.agentName)} sits this task out. Switch modes to work with it.</div>`;
  }
  const ph = channel === 'group' ? `Message #${state.workspace.channel}` : `Message ${me.agentName}`;
  return `<form class="composer" data-form="post" data-channel="${channel}">
    <textarea data-key="compose-${channel}" name="text" rows="1" placeholder="${esc(ph)}"></textarea>
    <button class="send" type="submit" title="Send">${icon('send')}</button>
  </form>`;
}

// ---------- board ----------

function boardHTML() {
  if (!state.task) return emptyTaskHTML();
  const cols = ['todo', 'doing', 'blocked', 'done'];
  const card = (t) => {
    const owner = t.owner ? pair(t.owner) : null;
    const pending = t.artifacts.some((a) => a.status === 'needs_signoff');
    return `<button class="card" data-act="modal" data-modal="task-detail" data-id="${t.id}">
      <div class="card-title">${esc(t.title)}</div>
      ${t.detail ? `<div class="card-detail">${esc(t.detail.slice(0, 120))}</div>` : ''}
      <div class="card-foot">
        ${owner ? `<span class="owner"><span class="avatar xs a-${owner.id}">${initials(owner.humanName)}</span>${esc(first(owner.humanName))}</span>` : '<span class="owner muted">Unassigned</span>'}
        ${t.artifacts.length ? `<span class="tag ${pending ? 'warn' : 'ok'}">${icon('check')} ${t.artifacts.length} deliverable${t.artifacts.length > 1 ? 's' : ''}${pending ? ' · needs sign-off' : ''}</span>` : ''}
      </div>
    </button>`;
  };
  return `
    <div class="page-head"><div><h2>Team board</h2><p>Agents create, claim, and finish tasks here with the team tools. Click a card to read its deliverables.</p></div></div>
    ${
      state.board.length
        ? `<div class="kanban">${cols
            .map((c) => {
              const items = state.board.filter((t) => t.status === c);
              return `<section class="col"><header><span class="dot s-${c}"></span>${STATUS_LABEL[c]}<small>${items.length}</small></header>${items.map(card).join('') || '<div class="col-empty">Nothing here</div>'}</section>`;
            })
            .join('')}</div>`
        : `<div class="empty-card">${icon('board')}<div><b>The board is empty.</b><p>Ask in #${esc(state.workspace.channel)} for the agents to split the work, or press <b>Run agents</b>.</p></div></div>`
    }`;
}

// ---------- memory ----------

function memoryHTML() {
  const typeTag = (type) => `<span class="tag t-${type}">${type}</span>`;
  const src = (s) => {
    if (!s) return 'system';
    const p = pair(s.pairId);
    if (s.kind === 'human') return esc(p?.humanName ?? 'human');
    if (s.kind === 'agent') return `${esc(p?.agentName ?? 'agent')}${s.humanApproved ? ` · approved by ${esc(first(p?.humanName))}` : ''}`;
    return 'system';
  };
  const canEditTeam = PAIRS.includes(viewer) && pair(viewer).mode !== 'agent';
  const team = state.global
    .map(
      (i) => `<li class="mem">
      ${typeTag(i.type)}<div class="mem-text">${esc(i.text)}<small>from ${src(i.source)}${i.signedOffBy ? ` · signed off by ${esc(first(pair(i.signedOffBy)?.humanName))}` : ''}</small></div>
      ${i.status === 'needs_signoff' ? (canEditTeam ? `<button class="btn sm warn" data-act="signoff" data-id="${i.id}">Sign off</button>` : '<span class="tag warn">needs sign-off</span>') : ''}
      ${canEditTeam ? `<button class="ghost" data-act="rm-mem" data-scope="global" data-id="${i.id}" title="Remove">${icon('x')}</button>` : ''}
    </li>`
    )
    .join('');
  const notes = state.mine?.notes ?? [];
  const privateList = notes
    .slice()
    .reverse()
    .map(
      (n) => `<li class="mem ${n.type}">
      ${typeTag(n.type)}<div class="mem-text">${esc(n.text)}<small>${n.source?.kind === 'system' ? 'task brief' : n.source?.kind === 'human' ? 'you' : esc(pair(viewer)?.agentName)} · ${time(n.ts)}${n.shared ? ' · shared with team' : ''}</small></div>
      ${!n.shared && n.type !== 'worklog' ? `<button class="ghost" data-act="share" data-id="${n.id}" title="Share with the team">${icon('share')}</button>` : ''}
      <button class="ghost" data-act="rm-mem" data-scope="pair" data-id="${n.id}" title="Remove">${icon('x')}</button>
    </li>`
    )
    .join('');
  const addForm = (scope, types) => `<form class="add-mem" data-form="memory" data-scope="${scope}">
      <select name="type">${types.map((t) => `<option>${t}</option>`).join('')}</select>
      <input class="input" name="text" data-key="mem-${scope}" placeholder="${scope === 'global' ? 'Add something the whole team should know' : 'Add a private note for your agent'}" />
      <button class="btn" type="submit">Add</button>
    </form>`;
  return `
    <div class="page-head"><div><h2>Memory</h2><p>Team memory is shared by every agent. Private memory belongs to one teammate and their agent: their notes, their thoughts from the DM, and the agent's work log.</p></div></div>
    <div class="mem-grid">
      <section class="box">
        <header><h3>${icon('memory')} Team memory</h3><small>${state.global.length} items</small></header>
        ${canEditTeam ? addForm('global', ['fact', 'decision', 'plan', 'question']) : ''}
        <ul class="mem-list">${team || '<li class="muted pad">Nothing yet. Agents add facts here as they work, and you can share private notes.</li>'}</ul>
      </section>
      ${
        PAIRS.includes(viewer)
          ? `<section class="box private">
              <header><h3>${icon('lock')} Your private memory</h3><small>only you and ${esc(pair(viewer).agentName)}</small></header>
              ${addForm('pair', ['fact', 'thought', 'todo'])}
              <ul class="mem-list">${privateList || '<li class="muted pad">No private notes yet.</li>'}</ul>
            </section>`
          : `<section class="box"><header><h3>${icon('lock')} Private memories</h3></header>${PAIRS.map((id) => `<div class="obs-mem"><b>${esc(pair(id).humanName)}</b><ul class="mem-list">${(state.all?.[id]?.notes ?? []).slice(-8).reverse().map((n) => `<li class="mem">${typeTag(n.type)}<div class="mem-text">${esc(n.text)}</div></li>`).join('') || '<li class="muted pad">Empty</li>'}</ul></div>`).join('')}</section>`
      }
    </div>`;
}

// ---------- connectors ----------

function connectorsHTML() {
  if (!ui.connectors) {
    loadConnectors();
    return '<div class="muted pad">Loading connectors…</div>';
  }
  const statusTag = { ready: '<span class="tag ok">Connected</span>', not_configured: '<span class="tag">Not configured</span>', local_only: '<span class="tag warn">Local only</span>' };
  return `
    <div class="page-head">
      <div><h2>Connectors</h2><p>Agents reach other platforms through the Model Context Protocol (MCP). Read tools run freely. Write tools follow the approval rules: they run on their own only in Agent only mode on low-stakes tasks, and otherwise wait for a human.</p></div>
      <button class="btn" data-act="probe" ${ui.probing ? 'disabled' : ''}>${icon('refresh')} ${ui.probing ? 'Testing…' : 'Test connections'}</button>
    </div>
    <div class="conn-grid">
      ${ui.connectors
        .map(
          (c) => `<section class="box conn">
          <header><h3>${esc(c.label)}</h3>${statusTag[c.status] ?? ''}</header>
          <p>${esc(c.why ?? '')}</p>
          <div class="conn-meta"><span class="tag">${c.transport}</span>${c.env?.length ? c.env.map((e) => `<code>${esc(e)}</code>`).join('') : ''}</div>
          ${c.probe ? (c.probe.ok ? `<div class="probe ok">${icon('check')} ${c.probe.tools} tools available</div>` : `<div class="probe err">${icon('alert')} ${esc(c.probe.error)}</div>`) : ''}
          ${c.tools?.length ? `<details><summary>Tools</summary><ul class="tool-list">${c.tools.map((t) => `<li><code>${esc(t.name)}</code>${t.readOnly ? '' : '<span class="tag warn">write</span>'}<small>${esc(t.description)}</small></li>`).join('')}</ul></details>` : ''}
          ${c.status !== 'ready' && c.setup ? `<details><summary>How to connect</summary><div class="md">${md(c.setup)}</div></details>` : ''}
        </section>`
        )
        .join('')}
    </div>
    <div class="box note">${icon('help')}<div><b>Add any MCP server</b><p>Set <code>MCP_SERVERS</code> to a JSON list such as <code>[{"id":"jira","url":"https://…/mcp","headers":{"Authorization":"Bearer \${JIRA_TOKEN}"}}]</code>, or add <code>mcp.config.json</code> next to <code>server.js</code>. Servers that run as a local command work on your machine but not on Vercel.</p></div></div>`;
}

async function loadConnectors(probe = false) {
  try {
    ui.probing = probe;
    if (probe) renderContent();
    const r = await api(`/api/connectors${probe ? '?probe=1' : ''}`);
    ui.connectors = r.connectors;
  } catch (err) {
    if (err.message !== 'unauthorized') toast(err.message);
    ui.connectors = ui.connectors ?? [];
  }
  ui.probing = false;
  renderContent();
}

// ---------- research (observer) ----------

function researchHTML() {
  const a = state.analytics;
  const bar = (label, n, max) => `<div class="bar"><span>${label}</span><i style="width:${max ? (100 * n) / max : 0}%"></i><b>${n}</b></div>`;
  const cards = PAIRS.map((id) => {
    const p = pair(id);
    const s = a[id];
    const e = s.engagement;
    const max = Math.max(1, ...Object.values(e));
    return `<section class="box">
      <header><h3><span class="avatar xs a-${id}">${initials(p.humanName)}</span> ${esc(p.humanName)}</h3><span class="pill ${p.mode === 'agent' ? 'blue' : p.mode === 'both' ? 'purple' : 'grey'}">${esc(state.modes[p.mode].label)}</span></header>
      <div class="kpis">
        <div><b>${s.agency ?? '—'}</b><small>agency level</small></div>
        <div><b>${s.humanShare == null ? '—' : `${Math.round(s.humanShare * 100)}%`}</b><small>human share</small></div>
        <div><b>${s.deliverables}</b><small>deliverables</small></div>
        <div><b>${s.agentDms}</b><small>agent DMs</small></div>
        <div><b>${s.toolCalls}</b><small>tool calls</small></div>
        <div><b>${s.revisedByReviewer}</b><small>reviewer sent back</small></div>
      </div>
      <div class="sub">Engagement with drafts</div>
      ${bar('Sent as-is', e.direct, max)}${bar('Edited', e.adapt, max)}${bar('Asked why', e.understand, max)}${bar('Asked to revise', e.critique, max)}${bar('Discarded', e.reject, max)}
      <div class="sub">Friction ${s.friction} · recoveries: repair ${s.recoveries.repair}, reformulate ${s.recoveries.reformulate}, disambiguate ${s.recoveries.disambiguate}</div>
    </section>`;
  }).join('');
  const traces = PAIRS.flatMap((id) => (state.all?.[id]?.traces ?? []).map((t) => ({ ...t, pairId: id })))
    .sort((x, y) => y.ts - x.ts)
    .slice(0, 12)
    .map(
      (t) => `<details class="tr-item"><summary><span class="avatar xs bot a-${t.pairId}">${icon('bot')}</span><b>${esc(pair(t.pairId).agentName)}</b> <span class="tag">${t.trigger.kind}</span> ${esc((t.trigger.text || '').slice(0, 70))}<time>${time(t.ts)}</time></summary>${traceHTML(t)}</details>`
    )
    .join('');
  const modes = (state.modeHistory ?? []).slice(-10).reverse().map((m) => `<li>${time(m.ts)} · ${esc(pair(m.pairId).humanName)}: ${state.modes[m.from].label} → ${state.modes[m.to].label}</li>`).join('');
  return `
    <div class="page-head"><div><h2>Research view</h2><p>Agency levels follow the Human Agency Scale (H1 = the agent does it all, H5 = the human does it all). Engagement follows how each person treats their agent's drafts.</p></div></div>
    <div class="research-grid">${cards}</div>
    <div class="mem-grid">
      <section class="box"><header><h3>${icon('brain')} Latest agent turns</h3></header>${traces || '<div class="muted pad">No agent turns yet.</div>'}</section>
      <section class="box"><header><h3>Mode changes</h3></header><ul class="plain">${modes || '<li class="muted">None yet</li>'}</ul>
      ${state.llmError ? `<div class="probe err">${icon('alert')} Last model error: ${esc(state.llmError.message)}</div>` : ''}</section>
    </div>`;
}

// ---------- right panel ----------

function effectLine(e) {
  const owner = (id) => (id ? esc(first(pair(id)?.humanName)) : 'nobody');
  switch (e.type) {
    case 'create_task':
      return `${icon('board')} Create task <b>${esc(e.title)}</b> → ${owner(e.owner)}`;
    case 'update_task':
      return `${icon('board')} ${e.owner ? `Claim task` : `Mark task ${esc(e.status)}`} <small>${esc(state.board.find((t) => t.id === e.taskId)?.title ?? '')}</small>`;
    case 'submit_work':
      return `${icon('check')} Submit <b>${esc(e.title)}</b><details><summary>Preview</summary><div class="md">${md(e.content)}</div></details>`;
    case 'remember':
      return `${icon('memory')} Add to team memory: ${esc(e.text)}`;
    case 'message_agent':
      return `${icon('bot')} Message ${esc(pair(e.to)?.agentName)}: ${esc(e.text.slice(0, 140))}`;
    case 'external_action':
      return `${icon('plug')} Run <code>${esc(e.tool)}</code><details><summary>Arguments</summary><pre>${esc(JSON.stringify(e.args, null, 2))}</pre></details>`;
    default:
      return esc(e.type);
  }
}

function panelHTML() {
  const me = pair(viewer);
  const mine = state.mine;
  const modeSel = `<div class="seg">${Object.entries(state.modes)
    .map(([k, m]) => `<button class="${me.mode === k ? 'on' : ''}" data-act="mode" data-mode="${k}">${m.label}</button>`)
    .join('')}</div><p class="hint">${MODE_HINT[me.mode]}</p>`;

  const drafts = mine.drafts
    .map((d) => {
      const editing = ui.editing === d.id;
      const revising = ui.revising === d.id;
      return `<div class="draft">
        <div class="draft-head">${icon('bot')} ${esc(me.agentName)} drafted${d.text ? ' a reply' : ' actions'}<time>${time(d.ts)}</time></div>
        ${editing ? `<textarea class="input" data-key="edit-${d.id}" id="edit-${d.id}" rows="5">${esc(d.text)}</textarea>` : d.text ? `<div class="md draft-text">${md(d.text)}</div>` : ''}
        ${d.effects?.length ? `<div class="effects"><div class="sub">If you approve, ${esc(me.agentName)} will also:</div><ul>${d.effects.map((e) => `<li>${effectLine(e)}</li>`).join('')}</ul></div>` : ''}
        ${revising ? `<form data-form="revise" data-id="${d.id}"><input class="input" name="feedback" data-key="rev-${d.id}" placeholder="What should change?" /><div class="row"><button class="btn sm primary" type="submit">Send back</button><button class="btn sm" type="button" data-act="cancel">Cancel</button></div></form>` : ''}
        ${
          !revising
            ? `<div class="row">
                ${editing ? `<button class="btn sm primary" data-act="send-edit" data-id="${d.id}">Send edited</button><button class="btn sm" data-act="cancel">Cancel</button>` : `<button class="btn sm primary" data-act="approve" data-id="${d.id}">${icon('check')} Approve</button>${d.text ? `<button class="btn sm" data-act="edit" data-id="${d.id}">${icon('edit')} Edit</button>` : ''}`}
                ${editing ? '' : `<button class="btn sm" data-act="explain" data-id="${d.id}">Why?</button><button class="btn sm" data-act="revise" data-id="${d.id}">Revise</button><button class="btn sm ghost-danger" data-act="reject" data-id="${d.id}">Discard</button>`}
              </div>`
            : ''
        }
      </div>`;
    })
    .join('');

  const pendingApprovals = state.approvals.filter((a) => a.status === 'pending');
  const approvals = pendingApprovals
    .map(
      (a) => `<div class="draft approval">
      <div class="draft-head">${icon('plug')} ${esc(pair(a.pairId)?.agentName)} wants to run <code>${esc(a.tool)}</code></div>
      <pre>${esc(JSON.stringify(a.args, null, 2))}</pre>
      ${me.mode === 'agent' ? '<p class="hint">Switch to a mode where you take part to approve.</p>' : `<div class="row"><button class="btn sm primary" data-act="action" data-id="${a.id}" data-decision="approve">Approve</button><button class="btn sm ghost-danger" data-act="action" data-id="${a.id}" data-decision="reject">Reject</button></div>`}
    </div>`
    )
    .join('');

  const signoffs = state.board.flatMap((t) => t.artifacts.filter((x) => x.status === 'needs_signoff').map((x) => ({ ...x, task: t })));
  const signoffHTML = signoffs
    .map((x) => `<div class="draft approval"><div class="draft-head">${icon('alert')} Deliverable needs a human sign-off</div><b>${esc(x.title)}</b><div class="row"><button class="btn sm" data-act="modal" data-modal="task-detail" data-id="${x.task.id}">Read</button>${me.mode === 'agent' ? '' : `<button class="btn sm primary" data-act="signoff" data-id="${x.id}">Sign off</button>`}</div></div>`)
    .join('');

  const recent = mine.traces
    .slice(-6)
    .reverse()
    .map((t) => `<details class="tr-item"><summary><span class="tag">${t.trigger.kind}</span> ${t.effects.length ? `${t.effects.length} action${t.effects.length > 1 ? 's' : ''}` : t.spoke ? 'replied' : 'stayed quiet'}<time>${time(t.ts)}</time></summary>${traceHTML(t)}</details>`)
    .join('');

  const settings = ui.settings
    ? `<form class="settings" data-form="settings">
        <label>Your name<input class="input" name="humanName" value="${esc(me.humanName)}" /></label>
        <label>Role<input class="input" name="title" value="${esc(me.title)}" /></label>
        <label>Agent name<input class="input" name="agentName" value="${esc(me.agentName)}" /></label>
        <label class="check"><input type="checkbox" name="teaching" ${mine.userModel.teaching ? 'checked' : ''} /> Teaching mode: explain the reasoning behind every draft</label>
        <button class="btn sm primary" type="submit">Save</button>
      </form>`
    : '';

  return `
    <section class="p-sec agent-card">
      <div class="agent-id"><div class="avatar lg bot a-${me.id}">${icon('bot')}</div><div><b>${esc(me.agentName)}</b><small>${me.thinking ? `${dots} ${esc(PROGRESS(me.thinking.label))}` : me.mode === 'human' ? 'Sitting this task out' : 'Ready'}</small></div><button class="ghost" data-act="settings" title="Settings">${icon('gear')}</button></div>
      <div class="crew-row">${Object.values(state.crew).map((c) => `<span title="${esc(c.brief)}">${c.label}</span>`).join('')}</div>
      ${settings}
    </section>
    <section class="p-sec"><h4>How you work on this task</h4>${modeSel}</section>
    ${drafts ? `<section class="p-sec"><h4>Waiting for you <em class="badge">${mine.drafts.length}</em></h4>${drafts}</section>` : ''}
    ${approvals || signoffHTML ? `<section class="p-sec"><h4>Team approvals <em class="badge">${pendingApprovals.length + signoffs.length}</em></h4>${approvals}${signoffHTML}</section>` : ''}
    <section class="p-sec"><h4>${icon('brain')} Recent reasoning</h4>${recent || '<p class="hint">Each turn your agent plans, uses tools, and gets reviewed. The steps appear here.</p>'}</section>`;
}

function observerPanelHTML() {
  const approvals = state.approvals.slice(-8).reverse().map((a) => `<li><code>${esc(a.tool)}</code> <span class="tag ${a.status === 'done' ? 'ok' : a.status === 'pending' ? 'warn' : ''}">${a.status}</span><small>${esc(pair(a.pairId)?.agentName)}</small></li>`).join('');
  return `
    <section class="p-sec"><h4>Team</h4>
      ${state.pairs
        .map(
          (p) => `<div class="obs-row"><div class="avatar sm a-${p.id}">${initials(p.humanName)}</div><div><b>${esc(p.humanName)}</b><small>${esc(state.modes[p.mode].label)} · ${esc(p.agentName)} ${p.thinking ? `${dots} ${esc(PROGRESS(p.thinking.label))}` : ''}</small></div>
          <em class="badge">${state.all?.[p.id]?.drafts.length ?? 0}</em></div>`
        )
        .join('')}
      <p class="hint">Badges show pending drafts per teammate.</p>
    </section>
    <section class="p-sec"><h4>Outside-platform actions</h4><ul class="plain">${approvals || '<li class="muted">None yet</li>'}</ul></section>
    <section class="p-sec"><h4>Queue</h4><p class="hint">${state.queued ? `${state.queued} job${state.queued > 1 ? 's' : ''} waiting` : 'Idle'}</p></section>`;
}

// ---------- modals ----------

function modalHTML() {
  if (!ui.modal) return '';
  if (ui.modal.type === 'task') {
    return `<div class="overlay" data-act="close"><div class="dialog" role="dialog">
      <header><h3>New team task</h3><button class="ghost" data-act="close">${icon('x')}</button></header>
      <div class="presets">${presets
        .map((p) => `<button class="preset" data-act="preset" data-key="${p.key}"><div class="row-between"><span class="pill ${CRIT_CLASS[p.criticality]}">${esc(state?.criticality?.[p.criticality]?.label ?? p.criticality)}</span><small>#${esc(p.channel)}</small></div><b>${esc(p.title)}</b><p>${esc(p.description)}</p></button>`)
        .join('')}</div>
      <details class="custom"><summary>Or write your own task</summary>
        <form data-form="task" class="stack">
          <input class="input" name="title" placeholder="Title" required />
          <textarea class="input" name="description" rows="3" placeholder="What does done look like?"></textarea>
          <textarea class="input" name="subtasks" rows="3" placeholder="Optional subtasks, one per line"></textarea>
          <div class="row"><select class="input" name="criticality">${Object.entries(state?.criticality ?? {}).map(([k, c]) => `<option value="${k}" ${k === 'operational' ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
          <input class="input" name="channel" placeholder="channel name" value="team" /></div>
          <button class="btn primary" type="submit">Create task</button>
        </form>
      </details>
    </div></div>`;
  }
  if (ui.modal.type === 'task-detail') {
    const t = state.board.find((x) => x.id === ui.modal.id);
    if (!t) return '';
    const canSign = PAIRS.includes(viewer) && pair(viewer).mode !== 'agent';
    const who = (by) => (by?.pairId ? `${esc(by.kind === 'agent' ? pair(by.pairId)?.agentName : pair(by.pairId)?.humanName)}` : 'system');
    return `<div class="overlay" data-act="close"><div class="dialog wide" role="dialog">
      <header><div><h3>${esc(t.title)}</h3><small>${STATUS_LABEL[t.status]} · ${t.owner ? `owner ${esc(pair(t.owner)?.humanName)}` : 'unassigned'}</small></div><button class="ghost" data-act="close">${icon('x')}</button></header>
      ${t.detail ? `<p>${esc(t.detail)}</p>` : ''}
      ${
        t.artifacts.length
          ? t.artifacts
              .map(
                (a) => `<article class="artifact"><header><b>${esc(a.title)}</b><small>by ${who(a.by)}${a.by?.humanApproved ? ' · approved by their human' : ''}</small>
                ${a.status === 'needs_signoff' ? (canSign ? `<button class="btn sm warn" data-act="signoff" data-id="${a.id}">Sign off</button>` : '<span class="tag warn">needs sign-off</span>') : a.signedOffBy ? `<span class="tag ok">signed off by ${esc(first(pair(a.signedOffBy)?.humanName))}</span>` : ''}</header>
                <div class="md">${md(a.content)}</div></article>`
              )
              .join('')
          : '<p class="muted">No deliverable yet.</p>'
      }
      <div class="sub">History</div>
      <ul class="plain log">${t.log.map((l) => `<li>${time(l.ts)} · ${who(l.by)}: ${esc(l.text.replace(/(assigned to |owner → )([ABC])\b/g, (_, pre, id) => pre + first(pair(id)?.humanName)))}</li>`).join('')}</ul>
    </div></div>`;
  }
  return '';
}

// ---------- events ----------

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (ui.flagOpen && !e.target.closest('.flag-pop')) {
      ui.flagOpen = null;
      render();
    }
    return;
  }
  const { act: a, id } = el.dataset;
  if (a === 'close' && e.target !== el && !e.target.closest('button[data-act="close"]')) return;
  if (a === 'export') {
    e.preventDefault();
    return exportData();
  }
  const handlers = {
    view: () => {
      ui.view = el.dataset.view;
      ui.nav = false;
    },
    nav: () => {
      ui.nav = !ui.nav;
      ui.drawer = false;
    },
    drawer: () => {
      ui.drawer = !ui.drawer;
      ui.nav = false;
    },
    dismiss: () => {
      ui.nav = false;
      ui.drawer = false;
    },
    trace: () => (ui.traces.has(id) ? ui.traces.delete(id) : ui.traces.add(id)),
    flag: () => (ui.flagOpen = ui.flagOpen === id ? null : id),
    friction: () => {
      ui.flagOpen = null;
      act('flagFriction', { pairId: viewer, messageId: id, source: el.dataset.src });
      toast('Thanks. Your agent will ask what went wrong in your DM.');
    },
    mode: () => act('setMode', { pairId: viewer, mode: el.dataset.mode }),
    approve: () => act('reviewDraft', { pairId: viewer, draftId: id, action: 'approve' }),
    edit: () => (ui.editing = id),
    'send-edit': () => {
      const text = $(`edit-${id}`)?.value ?? '';
      ui.editing = null;
      act('reviewDraft', { pairId: viewer, draftId: id, action: 'edit', text });
    },
    explain: () => {
      act('reviewDraft', { pairId: viewer, draftId: id, action: 'explain' });
      toast('Your agent will explain in your DM.');
    },
    revise: () => (ui.revising = id),
    reject: () => act('reviewDraft', { pairId: viewer, draftId: id, action: 'reject' }),
    cancel: () => {
      ui.editing = null;
      ui.revising = null;
    },
    action: () => act('decideAction', { pairId: viewer, approvalId: id, decision: el.dataset.decision }),
    signoff: () => act('signOff', { pairId: viewer, itemId: id }),
    share: () => act('shareNote', { pairId: viewer, noteId: id }),
    'rm-mem': () => act('removeMemory', { pairId: viewer, scope: el.dataset.scope, itemId: id }),
    round: () => {
      act('runRound');
      toast('Agents are taking a turn.');
    },
    modal: () => (ui.modal = { type: el.dataset.modal, id }),
    close: () => (ui.modal = null),
    preset: async () => {
      ui.modal = null;
      if (await act('createTask', { preset: el.dataset.key })) ui.view = 'team';
    },
    settings: () => (ui.settings = !ui.settings),
    probe: () => loadConnectors(true),
    reset: () => confirm('Reset the whole session for everyone?') && act('reset'),
    logout: () => {
      location.search = '';
    },
  };
  handlers[a]?.();
  render();
}

async function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  if (kind === 'post') {
    const ta = form.querySelector('textarea');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    if (!(await act('post', { pairId: viewer, channel: form.dataset.channel, text }))) ta.value = text;
  } else if (kind === 'memory') {
    if (!data.text?.trim()) return;
    if (await act('addMemory', { pairId: viewer, scope: form.dataset.scope, type: data.type, text: data.text })) form.reset();
  } else if (kind === 'revise') {
    ui.revising = null;
    act('reviewDraft', { pairId: viewer, draftId: form.dataset.id, action: 'revise', feedback: data.feedback });
  } else if (kind === 'settings') {
    ui.settings = false;
    act('setPairConfig', { pairId: viewer, humanName: data.humanName, title: data.title, agentName: data.agentName, teaching: form.querySelector('[name="teaching"]').checked });
  } else if (kind === 'task') {
    ui.modal = null;
    ui.view = 'team';
    act('createTask', { title: data.title, description: data.description, criticality: data.criticality, channel: data.channel, subtasks: (data.subtasks || '').split('\n') });
  }
  render();
}

function onKey(e) {
  if (e.key === 'Escape' && (ui.modal || ui.nav || ui.drawer)) {
    ui.modal = null;
    ui.nav = false;
    ui.drawer = false;
    render();
  }
  const ta = e.target.closest('.composer textarea');
  if (ta && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    ta.form.requestSubmit();
  }
}

app.addEventListener('input', (e) => {
  const ta = e.target.closest('.composer textarea');
  if (ta) {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }
});

async function exportData() {
  try {
    const data = await api('/api/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `triad-session-${Date.now()}.json` });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (err.message !== 'unauthorized') toast(err.message);
  }
}
