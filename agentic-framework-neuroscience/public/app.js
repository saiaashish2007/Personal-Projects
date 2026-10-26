const PAIRS = ['A', 'B', 'C'];
const VIEWERS = [...PAIRS, 'observer'];
const CODE_KEY = 'triad-access-code';
const viewer = new URLSearchParams(location.search).get('as');
const app = document.getElementById('app');
const ui = { flagOpen: null, editing: {}, revising: {}, tab: 'drafts' };
let state = null;
let version = -1;
let config = { gated: false };
let presets = [];
let code = localStorage.getItem(CODE_KEY) || '';
let pollTimer = null;
let pollFailures = 0;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const $ = (id) => document.getElementById(id);

const ICONS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  spark: '<path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1Z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  memory: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16V9M12 16V5M17 16v-3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
const icon = (name, extra = '') => `<svg class="i" viewBox="0 0 24 24" ${extra}>${ICONS[name] ?? ''}</svg>`;
const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="6" r="2.4" fill="white"/><circle cx="6" cy="17" r="2.4" fill="white"/><circle cx="18" cy="17" r="2.4" fill="white"/><path d="M12 8.5v3.5M10 13.2l-2.6 2M14 13.2l2.6 2" opacity=".8"/></svg>';
const pulse = '<span class="pulse"><i></i><i></i><i></i></span>';

const MODE_BADGE = { human: 'planned', both: 'int', agent: 'dev' };
const CRIT_BADGE = { ephemeral: 'planned', operational: 'dev', consequential: 'mock', high_stakes: 'danger' };

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
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', 'x-access-code': code, ...(opts.headers ?? {}) },
  });
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
    setTimeout(poll, 400);
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
  const busy = state?.pairs?.some((p) => p.thinking);
  pollTimer = setTimeout(poll, document.hidden ? 5000 : busy ? 800 : 1500);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state) poll();
});

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3400);
}

// Replaces a region only when its markup changed, keeping focus, caret, and
// scroll position so live updates don't interrupt someone who is typing.
function setHTML(el, html, { stickBottom = false } = {}) {
  if (!el || el.__html === html) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  const active = document.activeElement;
  const key = active && el.contains(active) ? active.dataset.key : null;
  const sel = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  el.innerHTML = html;
  el.__html = html;
  if (key) {
    const again = el.querySelector(`[data-key="${key}"]`);
    if (again) {
      again.focus();
      if (sel && again.setSelectionRange) again.setSelectionRange(...sel);
    }
  }
  if (stickBottom && (nearBottom || !el.__scrolled)) {
    el.scrollTop = el.scrollHeight;
    el.__scrolled = true;
  }
}

// ---------- login / seat picker ----------

function renderLogin(error = '') {
  let seat = VIEWERS.includes(viewer) ? viewer : 'A';
  const seats = [
    ['A', 'Pair A', 'Human A with Atlas, the facilitator agent'],
    ['B', 'Pair B', 'Human B with Beacon, the analyst agent'],
    ['C', 'Pair C', 'Human C with Cipher, the critic agent'],
    ['observer', 'Observer', 'Researcher view of every pair, with metrics'],
  ];
  app.innerHTML = `
    <div class="login">
      <section class="login-left">
        <div class="brand"><div class="brand-mark">${LOGO}</div><div><div class="brand-name">Triad</div><span class="brand-sub">Human–AI collaboration console</span></div></div>
        <div>
          <h1 class="wordmark">Tri<span>ad</span></h1>
          <p class="lede">Three human–AI pairs solving one task together. The agents share a global memory, each pair keeps a private one, and every pair chooses for each task whether its human, its agent, or both take part.</p>
          ${networkSVG()}
          <div class="legend"><span><i class="h"></i>Human</span><span><i></i>AI agent</span><span><i class="m"></i>Shared global memory</span></div>
        </div>
        <div class="hint">Built on findings from “Human–AI Collaboration at Scale” (250,000 conversations).</div>
      </section>
      <section class="login-right">
        <form class="login-card" id="loginForm">
          <div class="eyebrow orange">Join the session</div>
          <h2>Choose your seat</h2>
          <div class="hint">Open each pair on that person's own screen. Pairs only ever see their own private chat and memory.</div>
          <div class="seat-list">
            ${seats
              .map(
                ([id, label, sub]) => `
              <button type="button" class="seat ${id === seat ? 'on' : ''}" data-seat="${id}">
                <div class="avatar ${id === 'observer' ? 'system' : ''}">${id === 'observer' ? icon('eye') : id}</div>
                <div><b>${label}</b><small>${sub}</small></div>
                <span class="radio"></span>
              </button>`
              )
              .join('')}
          </div>
          ${
            config.gated
              ? `<label class="field-label" for="code">Access code</label>
                 <input class="input" id="code" type="password" autocomplete="current-password" placeholder="Enter the access code you were given" value="${esc(code)}" />`
              : ''
          }
          <div class="login-error" id="loginError">${esc(error)}</div>
          <button class="btn primary" style="width:100%;margin-top:16px" type="submit">Enter workspace ${icon('send')}</button>
        </form>
      </section>
    </div>`;

  const form = $('loginForm');
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seat]');
    if (!b) return;
    seat = b.dataset.seat;
    form.querySelectorAll('.seat').forEach((s) => s.classList.toggle('on', s.dataset.seat === seat));
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (config.gated) {
      const typed = $('code').value.trim();
      const res = await fetch(`/api/state?as=${seat}&v=-1`, { headers: { 'x-access-code': typed } });
      if (res.status === 401) {
        $('loginError').textContent = 'That access code is not valid.';
        return;
      }
      localStorage.setItem(CODE_KEY, typed);
    }
    location.href = `/?as=${seat}`;
  });
}

function networkSVG() {
  const pairs = [
    { x: 240, y: 60, l: 'A' },
    { x: 80, y: 250, l: 'B' },
    { x: 400, y: 250, l: 'C' },
  ];
  const c = { x: 240, y: 180 };
  return `
    <svg class="network" viewBox="0 0 480 310" aria-hidden="true">
      <circle class="ring" cx="${c.x}" cy="${c.y}" r="58" stroke-width="1.5"/>
      <circle class="ring" cx="${c.x}" cy="${c.y}" r="86" stroke-width="1" opacity=".6"/>
      ${pairs.map((p) => `<line class="edge" x1="${c.x}" y1="${c.y}" x2="${p.x}" y2="${p.y}"/>`).join('')}
      <line class="edge" x1="${pairs[1].x}" y1="${pairs[1].y}" x2="${pairs[2].x}" y2="${pairs[2].y}" opacity=".5"/>
      <circle cx="${c.x}" cy="${c.y}" r="30" fill="#fff" stroke="#fe6e00" stroke-width="2.5"/>
      <text x="${c.x}" y="${c.y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#423d38">MEMORY</text>
      ${pairs
        .map(
          (p) => `
        <g>
          <circle cx="${p.x - 17}" cy="${p.y}" r="17" fill="#423d38"/>
          <text x="${p.x - 17}" y="${p.y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${p.l}</text>
          <circle cx="${p.x + 17}" cy="${p.y}" r="17" fill="url(#og)"/>
          <path d="M${p.x + 17} ${p.y - 8}l2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2Z" fill="#fff"/>
        </g>`
        )
        .join('')}
      <defs><linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fe6e00"/><stop offset="1" stop-color="#ffb74d"/></linearGradient></defs>
    </svg>`;
}

// ---------- workspace shells ----------

function boot() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar"></aside>
      <div class="content">
        <header class="topbar" id="topbar"></header>
        <main class="workspace">${viewer === 'observer' ? observerBody() : pairBody()}</main>
      </div>
    </div>`;
  bindEvents();
  api('/api/presets')
    .then((p) => {
      presets = p;
      render();
    })
    .catch(() => {});
  poll();
}

function pageHead(extraActions = '') {
  return `
    <section class="page-head">
      <div id="pageHead"></div>
      <div class="page-actions">
        ${extraActions}
        <button class="btn secondary" data-cmd="round" id="roundBtn">${icon('play')} Run agent round</button>
        <button class="btn primary" data-cmd="newTask">${icon('plus')} New task</button>
      </div>
    </section>
    <div id="noTask"></div>`;
}

function memAdd(scope) {
  return `
    <div class="mem-add">
      <select class="select" id="${scope}MemType">
        <option value="fact">Fact</option><option value="decision">Decision</option>
        <option value="plan">Plan</option><option value="question">Question</option>
      </select>
      <input class="input" id="${scope}MemText" placeholder="${scope === 'global' ? 'Add to shared memory…' : 'Private note for your agent…'}" />
      <button class="btn secondary sm" data-act="addMem" data-scope="${scope}" style="height:36px">${icon('plus')} Add</button>
    </div>`;
}

function pairBody() {
  return `
    ${pageHead()}
    <section class="team" id="team"></section>
    <section class="main-grid" id="mainGrid">
      <div class="card">
        <div class="card-head">
          <div class="card-icon">${icon('message')}</div>
          <div><h2>Group thread</h2><div class="sub" id="groupHint">All three pairs see this channel</div></div>
          <div class="tools" id="groupTools"></div>
        </div>
        <div class="thread group" id="groupThread"></div>
        <div class="composer" id="groupComposer">
          <textarea id="groupInput" rows="1" placeholder="Message all three pairs…  (Enter to send, Shift+Enter for a new line)"></textarea>
          <button class="btn primary sm" id="groupSend">${icon('send')} Send</button>
        </div>
        <div class="locked" id="groupLocked" hidden></div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <div class="card-icon">${icon('users')}</div>
            <div><h2>Your pair</h2><div class="sub" id="pairHint"></div></div>
          </div>
          <div class="pane-body">
            <div id="modeCtl"></div>
            <label class="toggle">
              <div><div class="t">Teaching mode</div><div class="d">Your agent explains its reasoning with every draft</div></div>
              <span class="switch"><input type="checkbox" id="teaching" /><span></span></span>
            </label>
            <div id="tipBox"></div>
          </div>
          <div class="tabs" id="pairTabs"></div>
          <div class="pane-body" id="tabDrafts"></div>
          <div class="pane-body" id="tabChat" hidden>
            <div class="thread private" id="pairThread"></div>
            <div class="composer inline" id="pairComposer">
              <textarea id="pairInput" rows="1" placeholder="Only your agent sees this…"></textarea>
              <button class="btn primary sm" id="pairSend">${icon('send')}</button>
            </div>
          </div>
          <div class="pane-body" id="tabNotes" hidden>
            <div id="notes"></div>
            ${memAdd('pair')}
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div class="card-icon">${icon('memory')}</div>
            <div><h2>Global memory</h2><div class="sub">Shared by every agent and human, with provenance</div></div>
          </div>
          <div class="card-body">
            <div class="mem-scroll" id="globalMem"></div>
            ${memAdd('global')}
          </div>
        </div>
      </div>
    </section>`;
}

function observerBody() {
  return `
    ${pageHead(`<button class="btn ghost" data-cmd="reset">${icon('reset')} Reset</button><button class="btn secondary" data-cmd="export">${icon('download')} Export JSON</button>`)}
    <section class="metrics" id="metrics"></section>
    <div id="llmNotice"></div>
    <section class="card">
      <div class="card-head">
        <div class="card-icon">${icon('chart')}</div>
        <div><h2>Collaboration metrics</h2><div class="sub">Estimated Human Agency Scale level, engagement with AI output, and friction per pair</div></div>
      </div>
      <div class="table-wrap" id="analytics"></div>
    </section>
    <section class="two-col">
      <div class="card">
        <div class="card-head"><div class="card-icon">${icon('message')}</div><div><h2>Group thread</h2><div class="sub">What every pair sees</div></div></div>
        <div class="thread group" id="groupThread"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-icon">${icon('memory')}</div><div><h2>Global memory</h2><div class="sub">Shared blackboard with provenance</div></div></div>
        <div class="card-body"><div class="mem-scroll" id="globalMem"></div></div>
      </div>
    </section>
    <div class="divider-label"><span class="eyebrow">Private channels</span></div>
    <section class="three-col">
      ${PAIRS.map(
        (p) => `
        <div class="card">
          <div class="card-head" id="privHead${p}"></div>
          <div class="pane-body">
            <div id="modeCtl${p}"></div>
            <div class="eyebrow">Pending drafts</div><div id="drafts${p}"></div>
            <div class="eyebrow">Private thread</div>
          </div>
          <div class="thread compact" id="pairThread${p}"></div>
          <div class="pane-body"><div class="eyebrow">Private memory</div><div id="notes${p}"></div></div>
        </div>`
      ).join('')}
    </section>`;
}

// ---------- render ----------

function render() {
  if (!state) return;
  const pairs = Object.fromEntries(state.pairs.map((p) => [p.id, p]));
  const task = state.task;

  setHTML($('sidebar'), sidebarHTML(pairs));
  setHTML($('topbar'), topbarHTML(pairs));
  setHTML($('pageHead'), pageHeadHTML(task));
  setHTML($('noTask'), task ? '' : startHTML());
  $('roundBtn').disabled = !task;
  setHTML(
    $('groupThread'),
    state.group.length ? state.group.map((m) => msgHTML(m, { flaggable: viewer !== 'observer', pairs })).join('') : emptyHTML('message', 'No messages yet', task ? 'Say hello to the other pairs, or run an agent round.' : 'Create a task to start the session.'),
    { stickBottom: true }
  );
  setHTML($('globalMem'), globalMemHTML(pairs));

  if (viewer === 'observer') return renderObserver(pairs);

  $('mainGrid').hidden = !task;
  setHTML($('team'), state.pairs.map((p) => teamCard(p)).join(''));

  const me = pairs[viewer];
  const mine = state.mine;
  const crit = task ? state.criticality[task.criticality] : null;

  $('groupComposer').hidden = me.mode === 'agent' || !task;
  $('groupLocked').hidden = !$('groupComposer').hidden;
  setHTML($('groupLocked'), `${icon('lock')}<span>${!task ? 'Start a task to begin.' : 'Your pair is in <b>Agent only</b> mode, so your agent speaks for the pair. Switch modes to post yourself.'}</span>`);
  setHTML($('groupHint'), me.mode === 'both' ? 'Your agent drafts privately. You decide what gets sent.' : 'All three pairs see this channel');
  setHTML($('groupTools'), `<span class="badge sm ${MODE_BADGE[me.mode]}"><span class="dot"></span>${esc(state.modes[me.mode].label)}</span>`);
  setHTML($('pairHint'), me.thinking ? `<span style="color:var(--primary-strong);display:inline-flex;gap:8px;align-items:center">${pulse} ${esc(me.agentName)} is thinking</span>` : `${esc(me.humanName)} + ${esc(me.agentName)} · ${esc(state.roles[me.role].label)}`);
  setHTML($('modeCtl'), modeCtl(me));
  $('teaching').checked = mine.userModel.teaching;
  $('pairComposer').style.display = me.mode === 'human' ? 'none' : 'flex';

  const tips = [];
  if (mine.frictions.find((f) => !f.recovery)) {
    tips.push(['orange', 'flag', '<b>Friction flagged.</b> In the 250k-conversation study, adding evidence or correcting the specific error recovered far more often than rewording the same request.']);
  }
  if (crit && crit.rank >= 2) tips.push(['warn', 'alert', `<b>${esc(crit.label)} task.</b> Decisions written by agents without a human go to sign-off before they count.`]);
  setHTML($('tipBox'), tips.map(([k, i, t]) => `<div class="notice ${k}">${icon(i)}<div>${t}</div></div>`).join(''));

  const pending = me.mode === 'both' ? mine.drafts.length : 0;
  const tabs = [
    ['drafts', 'Drafts', pending],
    ['chat', 'Private chat', mine.thread.length],
    ['notes', 'Private memory', mine.notes.length],
  ];
  setHTML(
    $('pairTabs'),
    tabs.map(([k, label, n]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${label}<span class="count ${k === 'drafts' && n ? 'hot' : ''}">${n}</span></button>`).join('')
  );
  $('tabDrafts').hidden = ui.tab !== 'drafts';
  $('tabChat').hidden = ui.tab !== 'chat';
  $('tabNotes').hidden = ui.tab !== 'notes';

  setHTML(
    $('tabDrafts'),
    me.mode !== 'both'
      ? emptyHTML(me.mode === 'agent' ? 'spark' : 'users', me.mode === 'agent' ? 'Agent only' : 'Human only', me.mode === 'agent' ? 'Your agent posts to the group directly, with no drafts.' : 'Your agent has not joined this task.')
      : mine.drafts.length
        ? mine.drafts.map((d) => draftHTML(d)).join('')
        : emptyHTML('spark', 'No drafts right now', `${esc(me.agentName)} drafts a reply here when it has something worth adding. You choose what reaches the group.`)
  );
  setHTML(
    $('pairThread'),
    mine.thread.length ? mine.thread.map((m) => msgHTML(m, { flaggable: m.kind === 'agent', pairs })).join('') : emptyHTML('lock', 'Private channel', 'Ask your agent something. Nobody else can see this thread.'),
    { stickBottom: true }
  );
  setHTML($('notes'), notesHTML(mine.notes, true));
}

function renderObserver(pairs) {
  const groupMsgs = state.group.filter((m) => m.kind !== 'system');
  const counts = PAIRS.map((p) => groupMsgs.filter((m) => m.pairId === p).length);
  const maxCount = Math.max(1, ...counts);
  const pendingDrafts = PAIRS.reduce((n, p) => n + state.all[p].drafts.length, 0);
  const frictions = PAIRS.flatMap((p) => state.all[p].frictions);
  const repaired = frictions.filter((f) => f.recovery === 'repair').length;
  const { callsToday, dailyCap, provider, model } = state.llm;
  const bars = (vals, max) => `<div class="bars">${vals.map((v) => `<span style="height:${Math.max(8, (v / max) * 100)}%" title="${v}"></span>`).join('')}</div>`;

  setHTML(
    $('metrics'),
    [
      ['Group messages', groupMsgs.length, `A ${counts[0]} · B ${counts[1]} · C ${counts[2]}`, bars(counts, maxCount)],
      ['Pending drafts', pendingDrafts, 'Waiting for a human decision', bars(PAIRS.map((p) => state.all[p].drafts.length), Math.max(1, pendingDrafts))],
      ['Friction flags', frictions.length, `${repaired} recovered by repair`, bars(PAIRS.map((p) => state.analytics[p].friction), Math.max(1, frictions.length))],
      ['Agent calls today', provider === 'offline' ? '—' : callsToday, provider === 'offline' ? 'Offline demo agents' : `of ${dailyCap} daily cap · ${model}`, provider === 'offline' ? '' : `<div class="meter" style="background:var(--surface-soft)"><span style="width:${Math.min(100, (callsToday / dailyCap) * 100)}%"></span></div>`],
    ]
      .map(([k, v, sub, extra]) => `<div class="card metric"><div class="eyebrow">${k}</div><div class="v">${v}</div><div class="sub">${esc(sub)}</div>${extra}</div>`)
      .join('')
  );

  const err = state.llmError && Date.now() - state.llmError.ts < 15 * 60 * 1000 ? state.llmError : null;
  setHTML($('llmNotice'), err ? `<div class="notice danger">${icon('alert')}<div><b>An agent call failed at ${time(err.ts)} and fell back to the offline agent.</b> ${esc(err.message)}</div></div>` : '');

  for (const p of PAIRS) {
    const priv = state.all[p];
    const pair = pairs[p];
    setHTML(
      $(`privHead${p}`),
      `<div class="duo-avatars"><div class="avatar sm">${p}</div><div class="avatar sm agent">${icon('spark')}</div></div>
       <div><h2>Pair ${p}</h2><div class="sub">${esc(pair.humanName)} + ${esc(pair.agentName)} · ${esc(state.roles[pair.role].label)}</div></div>
       <div class="tools">${pair.thinking ? `<span style="color:var(--primary-strong)">${pulse}</span>` : ''}<span class="badge sm ${MODE_BADGE[pair.mode]}">${esc(state.modes[pair.mode].label)}</span></div>`
    );
    setHTML($(`modeCtl${p}`), modeCtl(pair));
    setHTML(
      $(`drafts${p}`),
      priv.drafts.length ? priv.drafts.map((d) => `<div class="draft"><div class="draft-text">${esc(d.text)}</div></div>`).join('') : '<div class="hint">None.</div>'
    );
    setHTML($(`pairThread${p}`), priv.thread.length ? priv.thread.map((m) => msgHTML(m, { pairs })).join('') : emptyHTML('lock', 'No private messages', ''), { stickBottom: true });
    setHTML($(`notes${p}`), notesHTML(priv.notes, false));
  }
  setHTML($('analytics'), analyticsHTML(pairs));
}

function sidebarHTML(pairs) {
  const { provider, model, callsToday, dailyCap } = state.llm;
  const live = provider !== 'offline';
  const seat = (id, label, ic) => {
    const p = pairs[id];
    const meta = p ? (p.thinking ? pulse : `<span class="meta">${p.mode === 'both' ? 'H+AI' : p.mode === 'agent' ? 'AI' : 'H'}</span>`) : '';
    return `<a class="nav-item ${viewer === id ? 'active' : ''}" href="/?as=${id}" title="${label}">${icon(ic)}<span class="label">${label}</span>${meta}</a>`;
  };
  return `
    <div class="brand"><div class="brand-mark">${LOGO}</div><div class="brand-text"><div class="brand-name">Triad</div><span class="brand-sub">Collaboration console</span></div></div>
    <nav class="nav-section">
      <div class="nav-label">Seats</div>
      ${PAIRS.map((p) => seat(p, `Pair ${p}`, 'users')).join('')}
      ${seat('observer', 'Observer', 'eye')}
    </nav>
    <nav class="nav-section">
      <div class="nav-label">Session</div>
      <button class="nav-item" data-cmd="newTask" title="New task">${icon('plus')}<span class="label">New task</span></button>
      <button class="nav-item" data-cmd="round" title="Run agent round" ${state.task ? '' : 'disabled'}>${icon('play')}<span class="label">Run agent round</span></button>
      ${viewer === 'observer' ? `<button class="nav-item" data-cmd="export" title="Export JSON">${icon('download')}<span class="label">Export session</span></button>` : ''}
    </nav>
    <div class="sidebar-foot">
      <div class="engine">
        <div class="engine-row"><span class="nav-label" style="padding:0">Agent engine</span><span class="badge sm ${live ? 'prod' : 'mock'}"><span class="dot"></span>${live ? 'Live' : 'Offline demo'}</span></div>
        <div class="engine-model">${esc(provider)} · ${esc(model)}</div>
        ${live ? `<div class="meter"><span style="width:${Math.min(100, (callsToday / dailyCap) * 100)}%"></span></div><div class="meter-label"><span>Calls today</span><span>${callsToday} / ${dailyCap}</span></div>` : ''}
      </div>
      <button class="nav-item" data-cmd="signOut" title="Switch seat">${icon('logout')}<span class="label">Switch seat</span></button>
    </div>`;
}

function topbarHTML(pairs) {
  const thinking = state.pairs.filter((p) => p.thinking);
  const me = pairs[viewer];
  return `
    <div class="crumbs"><span>Workspace</span><span class="sep">/</span><strong>${viewer === 'observer' ? 'Observer' : `Pair ${viewer}`}</strong>${state.task ? `<span class="sep">/</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(state.task.title)}</span>` : ''}</div>
    <div class="topbar-right">
      ${thinking.map((p) => `<span class="thinking-chip">${pulse} ${esc(p.agentName)} thinking</span>`).join('')}
      <div class="seat-chip">
        <div class="avatar sm ${viewer === 'observer' ? 'system' : ''}">${viewer === 'observer' ? icon('eye') : viewer}</div>
        <span class="label">${viewer === 'observer' ? 'Researcher' : esc(me.humanName)}</span>
      </div>
    </div>`;
}

function pageHeadHTML(task) {
  if (!task) {
    return `<div class="eyebrow orange">${viewer === 'observer' ? 'Observer' : `Pair ${viewer}`}</div><h1 class="title">No active task</h1><p class="page-desc">Pick a preset or write your own task. Each pair can choose for every task whether its human, its agent, or both take part.</p>`;
  }
  const crit = state.criticality[task.criticality];
  return `
    <div class="row"><span class="eyebrow orange">Active task</span><span class="badge sm ${CRIT_BADGE[task.criticality]}"><span class="dot"></span>${esc(crit.label)}</span></div>
    <h1 class="title">${esc(task.title)}</h1>
    ${task.description ? `<p class="page-desc">${esc(task.description)}</p>` : ''}
    ${task.subtasks?.length ? `<div class="chips">${task.subtasks.map((s, i) => `<span class="chip"><b>${i + 1}</b>${esc(s)}</span>`).join('')}</div>` : ''}`;
}

function startHTML() {
  const list = presets.length ? presets : [];
  return `
    <section class="card start-card">
      <div>
        <div class="card-icon" style="width:40px;height:40px">${icon('target')}</div>
        <h2>Start a session</h2>
        <p class="muted">Presets come with private briefs for each pair. The hidden-profile task only has a good answer if pairs move what they know from private to global memory.</p>
        <button class="btn primary" data-cmd="newTask" style="margin-top:8px">${icon('plus')} Write a custom task</button>
      </div>
      <div class="preset-grid">
        ${list
          .map(
            (p) => `
          <button class="preset" data-act="preset" data-key="${p.key}">
            <span class="badge sm ${CRIT_BADGE[p.criticality]}"><span class="dot"></span>${esc(state.criticality[p.criticality]?.label ?? p.criticality)}</span>
            <b>${esc(p.title)}</b>
            <span class="d">${esc(p.description ?? '')}</span>
          </button>`
          )
          .join('')}
      </div>
    </section>`;
}

function emptyHTML(ic, title, text) {
  return `<div class="empty"><div class="card-icon">${icon(ic)}</div><b>${esc(title)}</b>${text}</div>`;
}

function teamCard(p) {
  const a = state.analytics[p.id];
  const posts = a.human + a.agentSolo + a.approved + a.adapted;
  return `
    <div class="card pair-card ${p.id === viewer ? 'me' : ''}">
      <div class="top">
        <div class="duo">
          <div class="duo-avatars"><div class="avatar">${p.id}</div><div class="avatar agent">${icon('spark')}</div></div>
          <div><div class="duo-names">${esc(p.humanName)} + ${esc(p.agentName)}</div><div class="duo-role">Pair ${p.id} · ${esc(state.roles[p.role].label)} agent${p.id === viewer ? ' · <b style="color:var(--primary-strong)">You</b>' : ''}</div></div>
        </div>
        ${p.thinking ? `<span style="color:var(--primary-strong)">${pulse}</span>` : ''}
      </div>
      <div class="pair-stats">
        <div class="stat"><div class="k">Mode</div><div class="v"><span class="badge sm ${MODE_BADGE[p.mode]}">${esc(state.modes[p.mode].label)}</span></div></div>
        <div class="stat"><div class="k">Agency</div><div class="v">${a.agency ?? '—'} <small>${a.humanShare == null ? '' : `${Math.round(a.humanShare * 100)}% human`}</small></div></div>
        <div class="stat"><div class="k">Posts</div><div class="v">${posts} <small>${a.approved + a.adapted ? `· ${a.approved + a.adapted} via drafts` : ''}</small></div></div>
      </div>
    </div>`;
}

function modeCtl(p) {
  return `<div class="seg">${Object.entries(state.modes)
    .map(([k, m]) => `<button class="${p.mode === k ? 'on' : ''}" data-act="mode" data-pair="${p.id}" data-mode="${k}" title="Human Agency Scale ${m.has}">${m.label}<small>HAS ${m.has}</small></button>`)
    .join('')}</div>`;
}

function msgHTML(m, { flaggable = false, pairs }) {
  if (m.kind === 'system') return `<div class="sys"><span>${esc(m.text)}</span></div>`;
  const name = m.authorLabel.split(' (')[0];
  const tags = [];
  if (m.kind === 'agent') tags.push(`<span class="badge sm orange">AI agent</span>`);
  if (m.viaDraft === 'direct') tags.push('<span class="badge sm prod">Approved as-is</span>');
  if (m.viaDraft === 'adapt') tags.push('<span class="badge sm int">Edited by human</span>');
  if (m.clarifying) tags.push('<span class="badge sm dev">Clarifying question</span>');
  const frictions = viewer === 'observer' ? Object.values(state.all).flatMap((x) => x.frictions) : (state.mine?.frictions ?? []);
  const f = frictions.find((x) => x.messageId === m.id);
  if (f) tags.push(`<span class="badge sm mock">Friction · ${esc(f.source)}${f.recovery ? ` → ${esc(f.recovery)}` : ''}</span>`);

  let actions = '';
  if (flaggable && !f) {
    actions =
      ui.flagOpen === m.id
        ? `<div class="msg-actions open"><span class="hint" style="font-size:12px">Caused by</span>
             <button class="btn xs secondary" data-act="flag" data-id="${m.id}" data-src="me">Me</button>
             <button class="btn xs secondary" data-act="flag" data-id="${m.id}" data-src="agent">Agent</button>
             <button class="btn xs secondary" data-act="flag" data-id="${m.id}" data-src="both">Both</button>
             <button class="btn xs ghost" data-act="flagClose">${icon('x')}</button></div>`
        : `<div class="msg-actions"><button class="btn xs ghost" data-act="flagOpen" data-id="${m.id}" title="Mark a breakdown here">${icon('flag')} Flag friction</button></div>`;
  }
  const mineAgent = m.kind === 'agent' && m.pairId === viewer;
  return `
    <div class="msg ${mineAgent ? 'mine-agent' : ''}">
      ${m.kind === 'agent' ? `<div class="avatar agent">${icon('spark')}</div>` : `<div class="avatar">${esc(m.pairId ?? '?')}</div>`}
      <div style="min-width:0">
        <div class="msg-meta"><span class="who">${esc(name)}</span><span class="pair-tag">Pair ${esc(m.pairId)}</span>${tags.join('')}<span class="time">${time(m.ts)}</span>${actions}</div>
        <div class="msg-text">${esc(m.text)}</div>
        ${m.rationale ? `<details class="why"><summary>Why the agent said this</summary><div class="body">${esc(m.rationale)}</div></details>` : ''}
      </div>
    </div>`;
}

function draftHTML(d) {
  let controls;
  if (ui.editing[d.id] !== undefined) {
    controls = `
      <textarea class="textarea" data-key="edit-${d.id}" data-edit="${d.id}">${esc(ui.editing[d.id])}</textarea>
      <div class="draft-actions"><button class="btn primary sm" data-act="sendEdit" data-id="${d.id}">${icon('send')} Send edited</button><button class="btn ghost sm" data-act="cancel" data-id="${d.id}">Cancel</button></div>`;
  } else if (ui.revising[d.id] !== undefined) {
    controls = `
      <input class="input" data-key="rev-${d.id}" data-revise="${d.id}" value="${esc(ui.revising[d.id])}" placeholder="What should change?" />
      <div class="draft-actions"><button class="btn primary sm" data-act="sendRevise" data-id="${d.id}">${icon('refresh')} Ask for revision</button><button class="btn ghost sm" data-act="cancel" data-id="${d.id}">Cancel</button></div>`;
  } else {
    controls = `
      <div class="draft-actions">
        <button class="btn primary sm" data-act="review" data-action="approve" data-id="${d.id}" title="Direct use">${icon('check')} Send as-is</button>
        <button class="btn secondary sm" data-act="startEdit" data-id="${d.id}" title="Adapt">${icon('edit')} Edit</button>
        <button class="btn secondary sm" data-act="review" data-action="explain" data-id="${d.id}" title="Understand">${icon('help')} Explain</button>
        <button class="btn secondary sm" data-act="startRevise" data-id="${d.id}" title="Critique">${icon('refresh')} Revise</button>
        <button class="btn danger-ghost sm" data-act="review" data-action="reject" data-id="${d.id}" title="Reject">Discard</button>
      </div>`;
  }
  return `
    <div class="draft">
      <div class="draft-head">
        <span class="badge sm orange">${icon('spark', 'style="width:12px;height:12px"')} Draft for you</span>
        ${d.clarifying ? '<span class="badge sm dev">Clarifying question</span>' : ''}
        <span class="score" title="How strongly the agent wanted to speak">Motivation <span class="score-bar"><span style="width:${Math.round(d.motivation * 100)}%"></span></span>${d.motivation.toFixed(2)}</span>
      </div>
      <div class="draft-text">${esc(d.text)}</div>
      ${d.rationale ? `<details class="why"><summary>Agent's reasoning</summary><div class="body">${esc(d.rationale)}</div></details>` : ''}
      ${controls}
    </div>`;
}

const TYPE_BADGE = { decision: 'prod', plan: 'dev', fact: 'planned', question: 'int' };

function notesHTML(notes, editable) {
  if (!notes.length) return '<div class="hint">No private notes yet.</div>';
  return notes
    .map(
      (n) => `
      <div class="mem-item">
        <div>
          <div class="t">${esc(n.text)}</div>
          <div class="src"><span class="badge sm ${TYPE_BADGE[n.type] ?? 'planned'}">${esc(n.type)}</span>${esc(n.source?.kind ?? '')}${n.shared ? ` · <span style="color:var(--prod-fg)">${icon('check', 'style="width:12px;height:12px"')} shared to group</span>` : ''}</div>
        </div>
        ${
          editable
            ? `<div class="btns">${n.shared ? '' : `<button class="btn xs ghost" data-act="share" data-id="${n.id}" title="Copy to global memory">${icon('share')} Share</button>`}<button class="btn xs ghost" data-act="rmMem" data-scope="pair" data-id="${n.id}" title="Remove">${icon('x')}</button></div>`
            : '<span></span>'
        }
      </div>`
    )
    .join('');
}

const MEM_SECTIONS = [
  ['decision', 'Decisions'],
  ['plan', 'Plan'],
  ['fact', 'Facts'],
  ['question', 'Open questions'],
];

function globalMemHTML(pairs) {
  if (!state.global.length) return emptyHTML('memory', 'Nothing shared yet', 'Facts, plans, decisions, and open questions appear here with their source.');
  const canEdit = viewer !== 'observer' && pairs[viewer]?.mode !== 'agent';
  return MEM_SECTIONS.map(([type, label]) => {
    const items = state.global.filter((i) => i.type === type);
    if (!items.length) return '';
    return `
      <div class="mem-section">
        <div class="mem-section-head"><span class="eyebrow">${label}</span><span class="count">${items.length}</span></div>
        ${items
          .map((i) => {
            const s = i.source ?? {};
            const bits = [
              s.pairId ? `Pair ${s.pairId}` : 'System',
              s.kind === 'agent' ? (s.humanApproved ? 'agent · human-approved' : 'agent · no human review') : s.kind,
              s.from === 'pair-memory' ? 'shared from private notes' : '',
              i.signedOffBy ? `signed off by Pair ${i.signedOffBy}` : '',
            ].filter(Boolean);
            const signoff = i.status === 'needs_signoff';
            return `
              <div class="mem-item ${signoff ? 'signoff' : ''}">
                <div>
                  <div class="t">${esc(i.text)}</div>
                  <div class="src">${s.kind === 'agent' ? `<div class="avatar sm agent" style="width:18px;height:18px">${icon('spark', 'style="width:10px;height:10px"')}</div>` : ''}${esc(bits.join(' · '))}${signoff ? ' <span class="badge sm mock">Awaiting sign-off</span>' : ''}</div>
                </div>
                <div class="btns">
                  ${signoff && canEdit ? `<button class="btn xs primary" data-act="signOff" data-id="${i.id}">${icon('check')} Sign off</button>` : ''}
                  ${canEdit ? `<button class="btn xs ghost" data-act="rmMem" data-scope="global" data-id="${i.id}" title="Remove">${icon('x')}</button>` : ''}
                </div>
              </div>`;
          })
          .join('')}
      </div>`;
  }).join('');
}

function analyticsHTML(pairs) {
  const rows = PAIRS.map((p) => {
    const a = state.analytics[p];
    const e = a.engagement;
    const r = a.recoveries;
    return `
      <tr>
        <td><strong>Pair ${p}</strong><div class="sub">${esc(pairs[p].humanName)} + ${esc(pairs[p].agentName)}</div></td>
        <td><span class="badge sm ${MODE_BADGE[pairs[p].mode]}">${esc(state.modes[pairs[p].mode].label)}</span></td>
        <td><strong>${a.agency ?? '—'}</strong><div class="sub">${a.humanShare == null ? 'no contributions' : `${Math.round(a.humanShare * 100)}% human-authored`}</div></td>
        <td><strong>${a.human}</strong> human · <strong>${a.agentSolo}</strong> agent solo<div class="sub">${a.approved} drafts as-is · ${a.adapted} edited</div></td>
        <td>direct ${e.direct} · adapt ${e.adapt}<div class="sub">understand ${e.understand} · critique ${e.critique} · reject ${e.reject}</div></td>
        <td><strong>${a.friction}</strong> flagged<div class="sub">repair ${r.repair} · reformulate ${r.reformulate} · ask ${r.disambiguate}</div></td>
      </tr>`;
  }).join('');
  return `
    <table class="data">
      <thead><tr><th>Pair</th><th>Mode</th><th>Agency (est.)</th><th>Group contributions</th><th>Engagement with AI output</th><th>Friction</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="hint" style="padding:12px 16px 16px">Agency maps each pair's share of human-authored group messages onto the Human Agency Scale (edited drafts count half). Engagement modes and recovery types follow the categories in the Claude.ai study.</div>`;
}

// ---------- events ----------

function bindEvents() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-cmd]');
    if (!b || !app.contains(b)) return;
    const d = b.dataset;
    const pairId = viewer === 'observer' ? d.pair : viewer;

    if (d.cmd) {
      if (d.cmd === 'newTask') return openTaskModal();
      if (d.cmd === 'round') return act('runRound');
      if (d.cmd === 'export') return exportSession();
      if (d.cmd === 'reset') return confirm('Reset the whole session? This clears every thread and memory.') && act('reset');
      if (d.cmd === 'signOut') {
        location.href = '/';
        return;
      }
    }
    if (b.id === 'groupSend') return sendFrom('groupInput', 'group');
    if (b.id === 'pairSend') return sendFrom('pairInput', 'pair');

    switch (d.act) {
      case 'tab':
        ui.tab = d.tab;
        return render();
      case 'preset':
        return act('createTask', { preset: d.key });
      case 'mode':
        return act('setMode', { pairId: d.pair, mode: d.mode });
      case 'flagOpen':
        ui.flagOpen = d.id;
        return render();
      case 'flagClose':
        ui.flagOpen = null;
        return render();
      case 'flag':
        ui.flagOpen = null;
        return act('flagFriction', { pairId, messageId: d.id, source: d.src });
      case 'review':
        if (d.action === 'explain') ui.tab = 'chat';
        return act('reviewDraft', { pairId, draftId: d.id, action: d.action });
      case 'startEdit':
        ui.editing[d.id] = state.mine.drafts.find((x) => x.id === d.id)?.text ?? '';
        return rerender(`edit-${d.id}`);
      case 'startRevise':
        ui.revising[d.id] = '';
        return rerender(`rev-${d.id}`);
      case 'cancel':
        delete ui.editing[d.id];
        delete ui.revising[d.id];
        return render();
      case 'sendEdit': {
        if (await act('reviewDraft', { pairId, draftId: d.id, action: 'edit', text: ui.editing[d.id] })) delete ui.editing[d.id];
        return render();
      }
      case 'sendRevise': {
        if (await act('reviewDraft', { pairId, draftId: d.id, action: 'revise', feedback: ui.revising[d.id] })) delete ui.revising[d.id];
        return render();
      }
      case 'addMem': {
        const scope = d.scope;
        const input = $(`${scope}MemText`);
        if (await act('addMemory', { pairId, scope, type: $(`${scope}MemType`).value, text: input.value })) input.value = '';
        return;
      }
      case 'share':
        return act('shareNote', { pairId, noteId: d.id });
      case 'signOff':
        return act('signOff', { pairId, itemId: d.id });
      case 'rmMem':
        return act('removeMemory', { pairId, scope: d.scope, itemId: d.id });
    }
  });

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.edit) ui.editing[t.dataset.edit] = t.value;
    if (t.dataset.revise) ui.revising[t.dataset.revise] = t.value;
    if (t.id === 'groupInput' || t.id === 'pairInput') autoGrow(t);
  });

  app.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.target.id === 'groupInput') {
      e.preventDefault();
      sendFrom('groupInput', 'group');
    } else if (e.target.id === 'pairInput') {
      e.preventDefault();
      sendFrom('pairInput', 'pair');
    } else if (e.target.id === 'globalMemText' || e.target.id === 'pairMemText') {
      e.preventDefault();
      e.target.parentElement.querySelector('button').click();
    }
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'teaching') act('setPairConfig', { pairId: viewer, teaching: e.target.checked });
  });
}

function autoGrow(t) {
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
}

function rerender(focusKey) {
  render();
  if (focusKey) document.querySelector(`[data-key="${focusKey}"]`)?.focus();
}

async function sendFrom(inputId, channel) {
  const input = $(inputId);
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autoGrow(input);
  if (!(await act('post', { pairId: viewer, channel, text }))) input.value = text;
}

async function exportSession() {
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

// ---------- new task modal ----------

function openTaskModal() {
  const crit = state?.criticality ?? {};
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <div class="card-head">
        <div class="card-icon">${icon('target')}</div>
        <div><h2 id="mTitle">Start a new task</h2><div class="sub">Clears threads, drafts, and memory. Pairs keep their mode, and agents keep their model of their partner.</div></div>
        <div class="tools"><button class="btn ghost sm" id="tCancelX" aria-label="Close">${icon('x')}</button></div>
      </div>
      <div class="modal-body">
        <div>
          <div class="divider-label" style="margin-bottom:12px"><span class="eyebrow">Presets</span></div>
          <div class="preset-grid">${presets
            .map(
              (p) => `<button class="preset" data-preset="${p.key}">
                <span class="badge sm ${CRIT_BADGE[p.criticality]}"><span class="dot"></span>${esc(crit[p.criticality]?.label ?? p.criticality)}</span>
                <b>${esc(p.title)}</b><span class="d">${esc(p.description ?? '')}</span></button>`
            )
            .join('')}</div>
        </div>
        <div class="divider-label"><span class="eyebrow">Or write your own</span></div>
        <div class="form-grid">
          <div><label class="field-label" for="tTitle">Title</label><input class="input" id="tTitle" placeholder="What should the triad accomplish?" /></div>
          <div><label class="field-label" for="tCrit">Criticality</label><select class="select" id="tCrit">${Object.entries(crit)
            .map(([k, c]) => `<option value="${k}" ${k === 'operational' ? 'selected' : ''}>${c.label}</option>`)
            .join('')}</select></div>
        </div>
        <div><label class="field-label" for="tDesc">Description</label><textarea class="textarea" id="tDesc" placeholder="Describe the task and what a finished result looks like"></textarea></div>
        <div><label class="field-label" for="tSub">Subtasks</label><textarea class="textarea" id="tSub" placeholder="One per line (optional)"></textarea></div>
        <div>
          <label class="field-label">Private briefs</label>
          <div class="hint" style="margin-bottom:8px">Each pair's agent only ever sees its own brief.</div>
          <div class="brief-grid">${PAIRS.map((p) => `<textarea class="textarea" id="tBrief${p}" placeholder="Pair ${p} private facts, one per line"></textarea>`).join('')}</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="tCancel">Cancel</button>
        <button class="btn primary" id="tCreate">${icon('plus')} Create task</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  const onKey = (e) => e.key === 'Escape' && (close(), document.removeEventListener('keydown', onKey));
  document.addEventListener('keydown', onKey);
  setTimeout(() => $('tTitle')?.focus(), 50);
  bg.addEventListener('click', async (e) => {
    if (e.target === bg || e.target.closest('#tCancel, #tCancelX')) return close();
    const preset = e.target.closest('[data-preset]')?.dataset.preset;
    if (preset && (await act('createTask', { preset }))) return close();
    if (e.target.closest('#tCreate')) {
      const ok = await act('createTask', {
        title: $('tTitle').value,
        description: $('tDesc').value,
        criticality: $('tCrit').value,
        subtasks: $('tSub').value.split('\n'),
        privateBriefs: Object.fromEntries(PAIRS.map((p) => [p, $(`tBrief${p}`).value])),
      });
      if (ok) close();
    }
  });
}
