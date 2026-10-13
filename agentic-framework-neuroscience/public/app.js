const PAIRS = ['A', 'B', 'C'];
const viewer = new URLSearchParams(location.search).get('as');
const app = document.getElementById('app');
const ui = { flagOpen: null, editing: {}, revising: {}, modal: false };
let state = null;
let presets = [];

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const $ = (id) => document.getElementById(id);

if ([...PAIRS, 'observer'].includes(viewer)) boot();
else renderLanding();

// ---------- plumbing ----------

async function act(type, payload = {}) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// Replaces a region only when its markup changed, keeping focus, caret, and scroll
// position so live updates don't interrupt someone who is typing.
function setHTML(el, html, { stickBottom = false } = {}) {
  if (!el || el.__html === html) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const active = document.activeElement;
  const key = active && el.contains(active) ? active.dataset.key : null;
  const sel = key ? [active.selectionStart, active.selectionEnd] : null;
  el.innerHTML = html;
  el.__html = html;
  if (key) {
    const again = el.querySelector(`[data-key="${key}"]`);
    if (again) {
      again.focus();
      if (sel && again.setSelectionRange) again.setSelectionRange(...sel);
    }
  }
  if (stickBottom && nearBottom) el.scrollTop = el.scrollHeight;
}

function boot() {
  app.innerHTML = viewer === 'observer' ? observerShell() : pairShell(viewer);
  bindEvents();
  fetch('/api/presets').then((r) => r.json()).then((p) => (presets = p));
  const es = new EventSource(`/events?as=${viewer}`);
  es.onmessage = (e) => {
    state = JSON.parse(e.data);
    render();
  };
  es.onerror = () => toast('Connection lost. Retrying…');
}

// ---------- shells ----------

function header() {
  const links = [...PAIRS.map((p) => [p, `Pair ${p}`]), ['observer', 'Observer']]
    .map(([v, label]) => `<a href="/?as=${v}" class="${v === viewer ? 'on' : ''}">${label}</a>`)
    .join('');
  return `
    <header class="top">
      <div class="brand">Triad <span>· human–AI pairs</span></div>
      <div class="task-title" id="taskTitle"></div>
      <span id="llm"></span>
      <button id="newTask">New task</button>
      <nav class="viewer-switch">${links}</nav>
    </header>
    <div class="team" id="team"></div>`;
}

function memAdd(scope) {
  return `
    <div class="mem-add">
      <select id="${scope}MemType">
        <option value="fact">Fact</option><option value="decision">Decision</option>
        <option value="plan">Plan</option><option value="question">Question</option>
      </select>
      <input id="${scope}MemText" placeholder="${scope === 'global' ? 'Add to shared memory…' : 'Private note for your agent…'}" />
      <button data-act="addMem" data-scope="${scope}">Add</button>
    </div>`;
}

function pairShell(p) {
  return `
    ${header()}
    <div class="grid pair">
      <section class="panel">
        <h2>Group thread <span class="hint" id="groupHint"></span></h2>
        <div class="thread group" id="groupThread"></div>
        <div class="composer" id="groupComposer">
          <textarea id="groupInput" placeholder="Message all three pairs…  (Enter to send)"></textarea>
          <button class="primary" id="groupSend">Send</button>
        </div>
        <div class="locked" id="groupLocked" hidden></div>
      </section>

      <section class="panel p${p}">
        <h2>Your pair · ${p} <span class="hint" id="pairHint"></span></h2>
        <div class="body">
          <div id="modeCtl"></div>
          <label class="toggle"><input type="checkbox" id="teaching" /> Teaching mode: my agent explains its reasoning as it drafts</label>
          <div id="tipBox"></div>
          <div class="section-label">Drafts waiting for you</div>
          <div id="drafts"></div>
          <div class="section-label">Private chat with your agent</div>
          <div class="thread private" id="pairThread"></div>
          <div class="composer inline" id="pairComposer">
            <textarea id="pairInput" placeholder="Only your agent sees this…"></textarea>
            <button id="pairSend">Send</button>
          </div>
          <div class="section-label">Private pair memory</div>
          <div class="mem-group" id="notes"></div>
          ${memAdd('pair')}
        </div>
      </section>

      <section class="panel">
        <h2>Global memory <button id="round" title="Ask every joined agent whether it has something to add">Run agent round</button></h2>
        <div class="body">
          <div class="hint">Shared by all three agents and all humans. Every item shows where it came from.</div>
          <div id="globalMem"></div>
          ${memAdd('global')}
        </div>
      </section>
    </div>`;
}

function observerShell() {
  return `
    ${header()}
    <div class="grid observer">
      <section class="panel">
        <h2>Group thread</h2>
        <div class="thread group" id="groupThread"></div>
      </section>
      <div style="display:grid;gap:14px;align-content:start">
        <section class="panel">
          <h2>Global memory <span><button id="round">Run agent round</button> <a href="/api/export"><button>Export session</button></a> <button class="danger" id="reset">Reset</button></span></h2>
          <div class="body"><div id="globalMem"></div></div>
        </section>
        <section class="panel">
          <h2>Collaboration metrics</h2>
          <div class="body" id="analytics"></div>
        </section>
      </div>
    </div>
    <div class="grid three">
      ${PAIRS.map(
        (p) => `
        <section class="panel p${p}">
          <h2>Pair ${p} · private</h2>
          <div class="body">
            <div id="modeCtl${p}"></div>
            <div class="section-label">Pending drafts</div><div id="drafts${p}"></div>
            <div class="section-label">Private thread</div><div class="thread private" id="pairThread${p}"></div>
            <div class="section-label">Private memory</div><div class="mem-group" id="notes${p}"></div>
          </div>
        </section>`
      ).join('')}
    </div>`;
}

// ---------- render ----------

function render() {
  if (!state) return;
  const pairs = Object.fromEntries(state.pairs.map((p) => [p.id, p]));
  const task = state.task;

  setHTML(
    $('taskTitle'),
    task
      ? `<strong title="${esc(task.description)}">${esc(task.title)}</strong><span class="badge crit-${task.criticality}">${state.criticality[task.criticality].label}</span>`
      : '<span class="hint">No task yet. Click “New task”.</span>'
  );
  setHTML($('llm'), `<span class="badge" title="${esc(state.llm.model)}">${state.llm.provider === 'offline' ? 'Offline demo agents' : `${esc(state.llm.provider)} · ${esc(state.llm.model)}`}</span>`);
  setHTML($('team'), state.pairs.map((p) => teamCard(p)).join(''));
  setHTML($('groupThread'), state.group.length ? state.group.map((m) => msgHTML(m, { flaggable: viewer !== 'observer' })).join('') : '<div class="empty">The group thread is empty.</div>', { stickBottom: true });
  setHTML($('globalMem'), globalMemHTML(pairs));

  if (viewer === 'observer') {
    for (const p of PAIRS) {
      const priv = state.all[p];
      setHTML($(`modeCtl${p}`), modeCtl(pairs[p]));
      setHTML($(`drafts${p}`), priv.drafts.length ? priv.drafts.map((d) => `<div class="draft"><div class="text">${esc(d.text)}</div></div>`).join('') : '<div class="hint">None.</div>');
      setHTML($(`pairThread${p}`), priv.thread.length ? priv.thread.map((m) => msgHTML(m, {})).join('') : '<div class="empty">No private messages.</div>', { stickBottom: true });
      setHTML($(`notes${p}`), notesHTML(priv.notes, false));
    }
    setHTML($('analytics'), analyticsHTML(pairs));
    return;
  }

  const me = pairs[viewer];
  const mine = state.mine;
  const crit = task ? state.criticality[task.criticality] : null;

  $('groupComposer').hidden = me.mode === 'agent' || !task;
  $('groupLocked').hidden = !$('groupComposer').hidden;
  setHTML(
    $('groupLocked'),
    !task ? 'Start a task to begin.' : 'Your pair is in <b>Agent only</b> mode: your agent speaks for the pair. Switch modes to post yourself.'
  );
  setHTML($('groupHint'), me.mode === 'both' ? 'your agent drafts privately; you decide what gets sent' : '');
  setHTML($('pairHint'), me.thinking ? '<span class="thinking"><i></i><i></i><i></i> agent thinking</span>' : '');
  setHTML($('modeCtl'), modeCtl(me));
  $('teaching').checked = mine.userModel.teaching;
  $('pairComposer').style.display = me.mode === 'human' ? 'none' : 'flex';

  const openFriction = mine.frictions.find((f) => !f.recovery);
  const tips = [];
  if (openFriction) {
    tips.push(
      '<b>Friction flagged.</b> In the 250k-conversation study, adding evidence or correcting the specific error (repair) and asking targeted questions recovered far more often than rewording the same request.'
    );
  }
  if (crit && crit.rank >= 2) tips.push(`<b>${crit.label} task.</b> Decisions written by agents without a human go to sign-off before they count.`);
  setHTML($('tipBox'), tips.map((t) => `<div class="tip">${t}</div>`).join(''));

  setHTML(
    $('drafts'),
    me.mode !== 'both'
      ? `<div class="hint">${me.mode === 'agent' ? 'Agent only: your agent posts directly, with no drafts.' : 'Human only: your agent has not joined this task.'}</div>`
      : mine.drafts.length
        ? mine.drafts.map((d) => draftHTML(d)).join('')
        : '<div class="hint">No drafts right now. Your agent drafts a reply when it has something worth adding.</div>'
  );
  setHTML(
    $('pairThread'),
    mine.thread.length ? mine.thread.map((m) => msgHTML(m, { flaggable: m.kind === 'agent' })).join('') : '<div class="empty">Ask your agent something privately.</div>',
    { stickBottom: true }
  );
  setHTML($('notes'), notesHTML(mine.notes, true));
}

function teamCard(p) {
  const a = state.analytics[p.id];
  const agency = a.agency ? `<span class="badge has" title="Estimated Human Agency Scale level from who authored this pair's group messages">${a.agency} · ${Math.round(a.humanShare * 100)}% human-authored</span>` : '<span class="badge">no contributions yet</span>';
  return `
    <div class="pair-card p${p.id} ${p.id === viewer ? 'me' : ''}">
      <div class="row"><span class="name">Pair ${p.id} · ${esc(p.humanName)} + ${esc(p.agentName)}</span>${p.thinking ? '<span class="thinking"><i></i><i></i><i></i></span>' : ''}</div>
      <div class="row"><span class="sub">${esc(state.roles[p.role].label)} agent · ${esc(state.modes[p.mode].label)}</span>${agency}</div>
    </div>`;
}

function modeCtl(p) {
  return `<div class="seg p${p.id}">${Object.entries(state.modes)
    .map(([k, m]) => `<button class="${p.mode === k ? 'on' : ''}" data-act="mode" data-pair="${p.id}" data-mode="${k}">${m.label}<small>HAS ${m.has}</small></button>`)
    .join('')}</div>`;
}

function msgHTML(m, { flaggable }) {
  if (m.kind === 'system') return `<div class="msg system"><div class="text">${esc(m.text)}</div></div>`;
  const tags = [];
  if (m.kind === 'agent') tags.push('<span class="tag agent">AI agent</span>');
  if (m.viaDraft === 'direct') tags.push('<span class="tag">sent as-is by human</span>');
  if (m.viaDraft === 'adapt') tags.push('<span class="tag">edited by human</span>');
  if (m.clarifying) tags.push('<span class="tag">clarifying question</span>');
  const frictions = viewer === 'observer' ? Object.values(state.all).flatMap((x) => x.frictions) : state.mine?.frictions ?? [];
  const f = frictions.find((x) => x.messageId === m.id);
  if (f) tags.push(`<span class="tag" style="color:var(--warn)">friction · ${f.source}${f.recovery ? ` → ${f.recovery}` : ''}</span>`);

  let flag = '';
  if (flaggable && !f) {
    flag =
      ui.flagOpen === m.id
        ? `<span class="flag-menu">caused by: <button class="ghost" data-act="flag" data-id="${m.id}" data-src="me">me</button><button class="ghost" data-act="flag" data-id="${m.id}" data-src="agent">the agent</button><button class="ghost" data-act="flag" data-id="${m.id}" data-src="both">both</button><button class="ghost" data-act="flagClose">×</button></span>`
        : `<button class="ghost" data-act="flagOpen" data-id="${m.id}" title="Mark a breakdown here">⚑ friction</button>`;
  }
  return `
    <div class="msg ${m.kind} p${m.pairId} ${m.clarifying ? 'clarify' : ''}">
      <div class="meta"><span class="who">${esc(m.authorLabel)}</span>${tags.join('')}<span>${time(m.ts)}</span>${flag}</div>
      <div class="text">${esc(m.text)}</div>
      ${m.rationale ? `<details><summary>Why the agent said this</summary>${esc(m.rationale)}</details>` : ''}
    </div>`;
}

function draftHTML(d) {
  let controls;
  if (ui.editing[d.id] !== undefined) {
    controls = `
      <textarea data-key="edit-${d.id}" data-edit="${d.id}">${esc(ui.editing[d.id])}</textarea>
      <div class="actions"><button class="primary" data-act="sendEdit" data-id="${d.id}">Send edited</button><button data-act="cancel" data-id="${d.id}">Cancel</button></div>`;
  } else if (ui.revising[d.id] !== undefined) {
    controls = `
      <input data-key="rev-${d.id}" data-revise="${d.id}" value="${esc(ui.revising[d.id])}" placeholder="What should change?" />
      <div class="actions"><button class="primary" data-act="sendRevise" data-id="${d.id}">Ask for revision</button><button data-act="cancel" data-id="${d.id}">Cancel</button></div>`;
  } else {
    controls = `
      <div class="actions">
        <button class="primary" data-act="review" data-action="approve" data-id="${d.id}" title="Direct use">Send as-is</button>
        <button data-act="startEdit" data-id="${d.id}" title="Adapt">Edit</button>
        <button data-act="review" data-action="explain" data-id="${d.id}" title="Understand">Explain why</button>
        <button data-act="startRevise" data-id="${d.id}" title="Critique">Revise…</button>
        <button class="ghost" data-act="review" data-action="reject" data-id="${d.id}" title="Reject">Discard</button>
      </div>`;
  }
  return `
    <div class="draft p${viewer}">
      <div class="msg"><div class="meta"><span class="tag agent">draft</span>${d.clarifying ? '<span class="tag">clarifying question</span>' : ''}<span>motivation ${d.motivation.toFixed(2)}</span></div></div>
      <div class="text">${esc(d.text)}</div>
      ${d.rationale ? `<details class="hint"><summary>Agent's reasoning</summary>${esc(d.rationale)}</details>` : ''}
      ${controls}
    </div>`;
}

function notesHTML(notes, editable) {
  if (!notes.length) return '<div class="hint">No private notes.</div>';
  return notes
    .map(
      (n) => `
      <div class="mem-item">
        <div><div class="t">${esc(n.text)}</div><div class="src"><span class="tag">${n.type}</span>${n.source?.kind ?? ''}${n.shared ? ' · shared to group ✓' : ''}</div></div>
        ${editable ? `<div class="btns">${n.shared ? '' : `<button class="ghost" data-act="share" data-id="${n.id}" title="Copy to global memory">Share</button>`}<button class="ghost" data-act="rmMem" data-scope="pair" data-id="${n.id}">×</button></div>` : '<span></span>'}
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
  if (!state.global.length) return '<div class="hint">Nothing shared yet.</div>';
  const canEdit = viewer !== 'observer' && pairs[viewer]?.mode !== 'agent';
  return MEM_SECTIONS.map(([type, label]) => {
    const items = state.global.filter((i) => i.type === type);
    if (!items.length) return '';
    return `
      <div class="mem-group">
        <div class="section-label">${label}</div>
        ${items
          .map((i) => {
            const s = i.source ?? {};
            const src = [
              s.pairId ? `Pair ${s.pairId}` : 'system',
              s.kind,
              s.kind === 'agent' ? (s.humanApproved ? 'approved by its human' : 'no human review') : '',
              s.from === 'pair-memory' ? 'shared from private notes' : '',
              i.signedOffBy ? `signed off by Pair ${i.signedOffBy}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const signoff = i.status === 'needs_signoff';
            return `
              <div class="mem-item ${signoff ? 'signoff' : ''}">
                <div><div class="t">${esc(i.text)}</div><div class="src p${s.pairId ?? ''}"><span class="dot"></span>${esc(src)}${signoff ? ' · <b style="color:var(--warn)">awaiting human sign-off</b>' : ''}</div></div>
                <div class="btns">
                  ${signoff && canEdit ? `<button data-act="signOff" data-id="${i.id}">Sign off</button>` : ''}
                  ${canEdit ? `<button class="ghost" data-act="rmMem" data-scope="global" data-id="${i.id}">×</button>` : ''}
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
        <td><span class="badge p${p}" style="color:var(--pc)">Pair ${p}</span><div class="hint">${esc(state.modes[pairs[p].mode].label)}</div></td>
        <td class="has">${a.agency ?? '—'}<div class="hint">${a.humanShare == null ? '' : `${Math.round(a.humanShare * 100)}% human`}</div></td>
        <td>${a.human} human · ${a.agentSolo} agent solo<div class="hint">${a.approved} drafts as-is · ${a.adapted} edited</div></td>
        <td>direct ${e.direct} · adapt ${e.adapt}<div class="hint">understand ${e.understand} · critique ${e.critique} · reject ${e.reject}</div></td>
        <td>${a.friction} flagged<div class="hint">repair ${r.repair} · reformulate ${r.reformulate} · ask ${r.disambiguate}</div></td>
      </tr>`;
  }).join('');
  return `
    <table class="stats">
      <thead><tr><th>Pair</th><th>Agency (est.)</th><th>Group contributions</th><th>Engagement with AI output</th><th>Friction</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="hint">Agency maps each pair's share of human-authored group messages onto the Human Agency Scale (edited drafts count half). Engagement modes and recovery types follow the categories in the Claude.ai study.</div>`;
}

// ---------- events ----------

function bindEvents() {
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    const pairId = viewer === 'observer' ? d.pair : viewer;

    if (b.id === 'newTask') return openTaskModal();
    if (b.id === 'round') return act('runRound');
    if (b.id === 'reset') return confirm('Reset everything?') && act('reset');
    if (b.id === 'groupSend') return sendFrom('groupInput', 'group');
    if (b.id === 'pairSend') return sendFrom('pairInput', 'pair');

    switch (d.act) {
      case 'mode':
        return act('setMode', { pairId: d.pair, mode: d.mode });
      case 'flagOpen':
        ui.flagOpen = d.id;
        return rerender();
      case 'flagClose':
        ui.flagOpen = null;
        return rerender();
      case 'flag':
        ui.flagOpen = null;
        return act('flagFriction', { pairId, messageId: d.id, source: d.src });
      case 'review':
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
        return rerender();
      case 'sendEdit': {
        const text = ui.editing[d.id];
        if (await act('reviewDraft', { pairId, draftId: d.id, action: 'edit', text })) delete ui.editing[d.id];
        return rerender();
      }
      case 'sendRevise': {
        const feedback = ui.revising[d.id];
        if (await act('reviewDraft', { pairId, draftId: d.id, action: 'revise', feedback })) delete ui.revising[d.id];
        return rerender();
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

function rerender(focusKey) {
  render();
  if (focusKey) document.querySelector(`[data-key="${focusKey}"]`)?.focus();
}

async function sendFrom(inputId, channel) {
  const input = $(inputId);
  const text = input.value.trim();
  if (!text) return;
  if (await act('post', { pairId: viewer, channel, text })) input.value = '';
}

// ---------- new task modal ----------

function openTaskModal() {
  const crit = state?.criticality ?? {};
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>Start a new task</h3>
      <div class="hint">Starting a task clears the threads, drafts, and memory. Each pair keeps its mode, and its agent keeps its model of the partner.</div>
      <div class="section-label">Presets</div>
      <div class="presets">${presets
        .map((p) => `<button class="preset" data-preset="${p.key}"><span>${esc(p.title)}</span><span class="badge crit-${p.criticality}">${esc(crit[p.criticality]?.label ?? p.criticality)}</span></button>`)
        .join('')}</div>
      <div class="section-label">Or write your own</div>
      <div class="form-row">
        <input id="tTitle" placeholder="Task title" />
        <select id="tCrit">${Object.entries(crit).map(([k, c]) => `<option value="${k}" ${k === 'operational' ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
      </div>
      <textarea id="tDesc" placeholder="Description and what a finished result looks like"></textarea>
      <textarea id="tSub" placeholder="Subtasks, one per line (optional)"></textarea>
      <div class="section-label">Private briefs (each pair's agent sees only its own)</div>
      <div class="brief-grid">${PAIRS.map((p) => `<textarea id="tBrief${p}" placeholder="Pair ${p} private facts, one per line"></textarea>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="tCancel">Cancel</button>
        <button class="primary" id="tCreate">Create task</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', async (e) => {
    if (e.target === bg || e.target.id === 'tCancel') return close();
    const preset = e.target.closest('[data-preset]')?.dataset.preset;
    if (preset && (await act('createTask', { preset }))) return close();
    if (e.target.id === 'tCreate') {
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

// ---------- landing ----------

function renderLanding() {
  app.innerHTML = `
    <div class="landing">
      <div>
        <h1>Triad</h1>
        <p class="hint" style="font-size:15px">Three human–AI pairs working on one task. All three agents share a global memory, and each pair also keeps a private memory. For every task, each pair chooses whether its human, its agent, or both take part.</p>
      </div>
      <div class="choices">
        ${PAIRS.map((p) => `<a class="p${p}" href="/?as=${p}"><b>Join as Pair ${p}</b><span class="hint">Open on the human's own screen</span></a>`).join('')}
        <a href="/?as=observer"><b>Observer</b><span class="hint">Researcher view: every pair, plus metrics</span></a>
      </div>
      <p class="hint">Tip: open the three pair links in three browser windows (or on three machines on the same network) to run a session.</p>
    </div>`;
}
