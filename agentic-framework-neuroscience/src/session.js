import { CREW, CRITICALITY, SPEAK_THRESHOLD } from './agent.js';
import { GlobalMemory, PairMemory, newId } from './memory.js';
import { describeProvider } from './llm.js';
import { isTeamWrite } from './tools.js';
import { slackEnabled, slackConfig } from './slack.js';

export const PAIR_IDS = ['A', 'B', 'C'];
export const MODES = {
  human: { label: 'Human only', has: 'H5' },
  both: { label: 'Human + agent', has: 'H3–H4' },
  agent: { label: 'Agent only', has: 'H1–H2' },
};
const MAX_AGENT_CHAIN = 2;
const MAX_DM_DEPTH = 3;
const MAX_SOLO_POSTS = 2;
const THINKING_TTL_MS = 3 * 60 * 1000;
const MAX_EVENTS = 500;
const MAX_TRACES = 30;
const DAILY_LLM_CAP = Number(process.env.LLM_DAILY_CAP || 300);
const MAX_CALLS_PER_TURN = Number(process.env.MAX_CALLS_PER_TURN || 6);
const WORKSPACE = process.env.WORKSPACE_NAME || 'Northwind Labs';

const DEFAULT_PAIRS = {
  A: { humanName: 'Maya Chen', title: 'Product Manager', agentName: 'Atlas' },
  B: { humanName: 'Dev Patel', title: 'Software Engineer', agentName: 'Beacon' },
  C: { humanName: 'Sam Rivera', title: 'Product Designer', agentName: 'Cipher' },
};

export class SessionError extends Error {}

const empty = () => Object.fromEntries(PAIR_IDS.map((id) => [id, []]));
const firstName = (name) => name.split(' ')[0];

/**
 * All collaboration state for one team. A Session is rebuilt from a stored
 * snapshot on every request, so it is plain data plus pure mutations. Work
 * that needs an LLM or a network call is queued in `queue` (persisted with the
 * state) and drained by the runtime outside the state transaction.
 */
export class Session {
  constructor({ snapshot = null } = {}) {
    if (snapshot) this.load(snapshot);
    else this.reset();
  }

  // ---------- lifecycle ----------

  reset() {
    this.task = null;
    this.channel = 'team';
    this.pairs = Object.fromEntries(PAIR_IDS.map((id) => [id, { id, mode: 'both', ...DEFAULT_PAIRS[id] }]));
    this.group = [];
    this.pairThreads = empty();
    this.agentThread = [];
    this.drafts = empty();
    this.traces = empty();
    this.global = new GlobalMemory();
    this.pairMem = Object.fromEntries(PAIR_IDS.map((id) => [id, new PairMemory(id)]));
    this.approvals = [];
    this.frictions = [];
    this.modeHistory = [];
    this.events = [];
    this.thinking = {};
    this.usage = this.usage ?? { day: today(), calls: 0 };
    this.llmError = null;
    this.queue = [];
    this.lease = null;
    this.slack = { threadTs: null, seen: [], posted: {} };
    this.changed('reset');
  }

  load(s) {
    this.task = s.task ?? null;
    this.channel = s.channel ?? 'team';
    this.pairs = s.pairs;
    for (const id of PAIR_IDS) this.pairs[id] = { ...DEFAULT_PAIRS[id], ...this.pairs[id] };
    this.group = s.group ?? [];
    this.pairThreads = s.pairThreads ?? empty();
    this.agentThread = s.agentThread ?? [];
    this.drafts = s.drafts ?? empty();
    this.traces = s.traces ?? empty();
    this.global = new GlobalMemory(s.global);
    this.pairMem = Object.fromEntries(PAIR_IDS.map((id) => [id, new PairMemory(id, s.pairMem?.[id])]));
    this.approvals = s.approvals ?? [];
    this.frictions = s.frictions ?? [];
    this.modeHistory = s.modeHistory ?? [];
    this.events = s.events ?? [];
    this.thinking = s.thinking ?? {};
    this.usage = s.usage ?? { day: today(), calls: 0 };
    this.llmError = s.llmError ?? null;
    this.queue = s.queue ?? [];
    this.lease = s.lease ?? null;
    this.slack = s.slack ?? { threadTs: null, seen: [], posted: {} };
  }

  snapshot() {
    return {
      task: this.task,
      channel: this.channel,
      pairs: this.pairs,
      group: this.group,
      pairThreads: this.pairThreads,
      agentThread: this.agentThread,
      drafts: this.drafts,
      traces: this.traces,
      global: this.global.toJSON(),
      pairMem: Object.fromEntries(PAIR_IDS.map((id) => [id, this.pairMem[id].toJSON()])),
      approvals: this.approvals,
      frictions: this.frictions,
      modeHistory: this.modeHistory,
    };
  }

  toJSON() {
    return {
      ...this.snapshot(),
      events: this.events,
      thinking: this.thinking,
      usage: this.usage,
      llmError: this.llmError,
      queue: this.queue,
      lease: this.lease,
      slack: this.slack,
    };
  }

  changed(eventType, data = {}) {
    this.events.push({ ts: Date.now(), type: eventType, ...data });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  // ---------- job queue ----------

  schedule(job) {
    this.queue.push({ id: newId('job'), ...job, taskId: this.task?.id ?? null });
  }

  /** Claims the right to drain the queue. Only one drainer runs at a time. */
  acquireLease(id, ms) {
    const now = Date.now();
    if (this.lease && this.lease.until > now && this.lease.id !== id) return false;
    this.lease = { id, until: now + ms };
    return true;
  }

  releaseLease(id) {
    if (this.lease?.id === id) this.lease = null;
  }

  leaseActive() {
    return Boolean(this.lease && this.lease.until > Date.now());
  }

  /** Pops the next runnable job and prepares it. Returns null when the queue is empty or the lease was lost. */
  nextJob(leaseId, ms) {
    if (this.lease?.id !== leaseId) return null;
    this.lease.until = Date.now() + ms;
    while (this.queue.length) {
      const job = this.queue.shift();
      if (job.kind === 'slack_out') {
        const msg = this.group.find((m) => m.id === job.messageId);
        if (!msg || this.slack.posted[msg.id]) continue;
        return { job, payload: { text: msg.text, author: msg.authorLabel, isAgent: msg.kind === 'agent', threadTs: this.slack.threadTs, taskTitle: this.task?.title } };
      }
      if (job.kind === 'run_action') {
        const approval = this.approvals.find((a) => a.id === job.approvalId);
        if (!approval || approval.status !== 'approved') continue;
        approval.status = 'running';
        return { job, approval: { id: approval.id, tool: approval.tool, args: approval.args } };
      }
      if (job.taskId !== (this.task?.id ?? null)) continue;
      const planned = this.prepareJob(job);
      if (planned.length) return { job, planned };
    }
    return null;
  }

  // ---------- task + configuration ----------

  createTask({ title, description = '', criticality = 'operational', subtasks = [], privateBriefs = {}, channel }) {
    if (!title?.trim()) throw new SessionError('Task needs a title.');
    if (!CRITICALITY[criticality]) throw new SessionError(`Unknown criticality "${criticality}".`);
    this.task = {
      id: newId('t'),
      title: title.trim(),
      description: description.trim(),
      criticality,
      subtasks: subtasks.map((s) => s.trim()).filter(Boolean),
      createdAt: Date.now(),
    };
    this.channel = (channel || 'team').replace(/^#/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'team';
    this.group = [];
    this.pairThreads = empty();
    this.agentThread = [];
    this.drafts = empty();
    this.traces = empty();
    this.global = new GlobalMemory();
    this.approvals = [];
    this.frictions = [];
    this.queue = this.queue.filter((j) => j.kind === 'slack_out');
    this.thinking = {};
    this.slack = { ...this.slack, threadTs: null, posted: {} };
    for (const id of PAIR_IDS) {
      // The user model persists across tasks; task-specific notes do not.
      this.pairMem[id].notes = [];
      const brief = privateBriefs[id];
      if (brief) {
        for (const line of brief.split('\n').map((l) => l.trim()).filter(Boolean)) {
          this.pairMem[id].addNote({ text: line, source: { kind: 'system' } });
        }
      }
    }
    this.systemMessage(`New task: "${this.task.title}" (${CRITICALITY[criticality].label}). Each teammate chooses Human only, Human + agent, or Agent only.`);
    this.changed('task_created', { task: this.task });
    return this.task;
  }

  setMode(pairId, mode) {
    this.requirePair(pairId);
    if (!MODES[mode]) throw new SessionError(`Unknown mode "${mode}".`);
    const prev = this.pairs[pairId].mode;
    if (prev === mode) return;
    this.pairs[pairId].mode = mode;
    if (mode === 'human') {
      for (const d of this.drafts[pairId]) if (d.status === 'pending') d.status = 'discarded';
    }
    this.modeHistory.push({ ts: Date.now(), pairId, from: prev, to: mode, taskId: this.task?.id });
    this.systemMessage(`${this.pairs[pairId].humanName} switched to ${MODES[mode].label}.`, { mirror: false });
    this.changed('mode_changed', { pairId, from: prev, to: mode });
  }

  setPairConfig(pairId, { humanName, agentName, title, teaching }) {
    this.requirePair(pairId);
    const p = this.pairs[pairId];
    if (humanName?.trim()) p.humanName = humanName.trim().slice(0, 40);
    if (agentName?.trim()) p.agentName = agentName.trim().slice(0, 40);
    if (title?.trim()) p.title = title.trim().slice(0, 60);
    if (typeof teaching === 'boolean') this.pairMem[pairId].userModel.teaching = teaching;
    this.changed('pair_config', { pairId, humanName, agentName, title, teaching });
  }

  // ---------- messages ----------

  post({ pairId, channel, text, source = 'app' }) {
    this.requirePair(pairId);
    this.requireTask();
    text = text?.trim();
    if (!text) throw new SessionError('Message is empty.');
    const mode = this.pairs[pairId].mode;

    if (channel === 'group') {
      if (mode === 'agent') throw new SessionError('You are in Agent only mode. Switch to Human only or Human + agent to post.');
      const msg = this.addMessage({ channel: 'group', pairId, kind: 'human', text, source });
      this.detectRecovery(pairId, msg);
      this.changed('human_post', { pairId, channel, messageId: msg.id, source });
      this.schedule({ kind: 'group', depth: 0, trigger: { kind: 'group', text, pairId, fromAgent: false, messageId: msg.id, authorLabel: msg.authorLabel } });
      return msg;
    }

    if (channel === 'pair') {
      if (mode === 'human') throw new SessionError('Your agent has not joined this task (Human only). Switch modes to talk to it.');
      const msg = this.addMessage({ channel: pairId, pairId, kind: 'human', text });
      // The teammate's own thoughts become part of their private memory.
      this.pairMem[pairId].addNote({ text, type: 'thought', source: { kind: 'human', pairId } });
      this.detectRecovery(pairId, msg);
      this.changed('human_post', { pairId, channel, messageId: msg.id });
      this.schedule({ kind: 'private', pairId, trigger: { kind: 'private', text } });
      return msg;
    }

    throw new SessionError(`Unknown channel "${channel}".`);
  }

  label(pairId, kind) {
    const p = this.pairs[pairId];
    return kind === 'human' ? p.humanName : `${p.agentName} (${firstName(p.humanName)}'s agent)`;
  }

  addMessage({ channel, pairId = null, kind, text, rationale = '', viaDraft = null, clarifying = false, source = 'app', traceId = null, mirror = true }) {
    const authorLabel = kind === 'system' ? 'System' : this.label(pairId, kind);
    const msg = { id: newId('m'), ts: Date.now(), channel, pairId, kind, authorLabel, text, rationale, viaDraft, clarifying, source, traceId };
    if (channel === 'group') {
      this.group.push(msg);
      if (mirror && source !== 'slack' && slackEnabled()) this.schedule({ kind: 'slack_out', messageId: msg.id });
    } else this.pairThreads[channel].push(msg);
    return msg;
  }

  systemMessage(text, { mirror = true } = {}) {
    return this.addMessage({ channel: 'group', kind: 'system', text, mirror });
  }

  sendAgentDm(from, to, text, depth) {
    this.addAgentMessage(from, to, text);
    if (depth <= MAX_DM_DEPTH && this.pairs[to].mode !== 'human') {
      this.schedule({ kind: 'agent_dm', to, depth, trigger: { kind: 'agent_dm', from, fromLabel: this.pairs[from].humanName, text } });
    }
  }

  addAgentMessage(from, to, text) {
    const msg = { id: newId('am'), ts: Date.now(), from, to, text: String(text).slice(0, 2000), authorLabel: this.label(from, 'agent'), toLabel: this.label(to, 'agent') };
    this.agentThread.push(msg);
    if (this.agentThread.length > 300) this.agentThread.splice(0, this.agentThread.length - 300);
    return msg;
  }

  // ---------- agent turns ----------

  activeAgentPairs() {
    return PAIR_IDS.filter((id) => this.pairs[id].mode !== 'human');
  }

  /** Decides which agents should think for a job and builds their context. */
  prepareJob(job) {
    let ids = [];
    const extra = {};
    if (job.kind === 'group') {
      if (!this.task) return [];
      ids = this.activeAgentPairs().filter((id) => !(job.trigger.fromAgent && job.trigger.pairId === id));
    } else if (['private', 'revise'].includes(job.kind)) {
      if (this.pairs[job.pairId].mode === 'human') return [];
      ids = [job.pairId];
      if (job.draftId) extra.lastDraft = this.drafts[job.pairId].find((d) => d.id === job.draftId) ?? null;
    } else if (job.kind === 'agent_dm') {
      if (this.pairs[job.to].mode === 'human') return [];
      ids = [job.to];
    }
    if (!ids.length) return [];

    const live = describeProvider().provider !== 'offline';
    if (this.usage.day !== today()) this.usage = { day: today(), calls: 0 };
    return ids.map((id) => {
      this.thinking[id] = { since: Date.now(), label: 'planning' };
      const p = this.pairs[id];
      return {
        pairId: id,
        agent: { pairId: id, name: p.agentName, humanName: p.humanName, focus: p.title },
        ctx: { ...this.buildCtx(id, job.trigger, extra), offline: !live || this.usage.calls >= DAILY_LLM_CAP },
      };
    });
  }

  setProgress(pairId, label) {
    if (this.thinking[pairId]) this.thinking[pairId].label = label;
  }

  /** Writes the agents' outputs back into the (fresh) state. */
  applyJob(job, outs) {
    for (const id of Object.keys(outs)) delete this.thinking[id];
    for (const out of Object.values(outs)) if (!out.trace?.offline) this.usage.calls += out.trace?.calls ?? 0;
    const errored = Object.values(outs).find((o) => o.error);
    if (errored) this.llmError = { ts: Date.now(), message: errored.error };
    if (job.taskId !== (this.task?.id ?? null)) return;

    if (job.kind === 'group') {
      const solo = Object.entries(outs)
        .filter(([id, out]) => this.pairs[id].mode === 'agent' && out.speak && out.motivation >= SPEAK_THRESHOLD)
        .sort((a, b) => b[1].motivation - a[1].motivation)
        .slice(0, MAX_SOLO_POSTS)
        .map(([id]) => id);
      const scores = {};
      let posted = null;
      for (const [id, out] of Object.entries(outs)) {
        scores[id] = Number(out.motivation.toFixed(2));
        const msg = this.applyOutput(id, out, job, { allowPost: solo.includes(id) });
        posted = posted ?? msg;
      }
      this.changed('agent_turn', { trigger: job.trigger.kind, depth: job.depth, scores, posted: posted?.pairId ?? null });
      if (posted && job.depth + 1 < MAX_AGENT_CHAIN) {
        this.schedule({ kind: 'group', depth: job.depth + 1, trigger: { kind: 'group', text: posted.text, pairId: posted.pairId, fromAgent: true, messageId: posted.id, authorLabel: posted.authorLabel } });
      }
      return;
    }
    for (const [id, out] of Object.entries(outs)) this.applyOutput(id, out, job, { allowPost: true });
  }

  /** Routes one agent's turn: private effects now, team effects now or via a draft depending on mode. */
  applyOutput(pairId, out, job, { allowPost }) {
    const mode = this.pairs[pairId].mode;
    const kind = job.trigger.kind;
    const traceId = this.recordTrace(pairId, job, out);
    const privateTurn = ['private', 'explain', 'friction'].includes(kind);
    const depth = (job.kind === 'agent_dm' ? job.depth ?? 0 : 0) + 1;
    let teamEffects = (out.effects ?? []).filter(isTeamWrite);
    // Handoffs that point at drafted board changes wait for the same approval.
    const holdDms = mode === 'both' && teamEffects.length > 0;
    if (holdDms) teamEffects = [...teamEffects, ...(out.effects ?? []).filter((e) => e.type === 'message_agent').map((e) => ({ ...e, depth }))];

    for (const e of out.effects ?? []) {
      if (e.type === 'remember' && e.scope === 'private') this.pairMem[pairId].addNote({ text: e.text, type: e.memType === 'thought' ? 'thought' : 'fact', source: { kind: 'agent', pairId } });
      if (e.type === 'ask_human') this.addMessage({ channel: pairId, pairId, kind: 'agent', text: e.text, clarifying: true, traceId });
      if (e.type === 'external_done') this.pairMem[pairId].addNote({ text: `Ran ${e.tool}: ${e.result}`, type: 'worklog', source: { kind: 'agent', pairId } });
      if (e.type === 'message_agent' && !holdDms) this.sendAgentDm(pairId, e.to, e.text, depth);
    }

    const tools = (out.trace?.steps ?? []).map((s) => s.tool);
    if (tools.length) {
      this.pairMem[pairId].addNote({ text: `${kind} turn: used ${[...new Set(tools)].join(', ')}${out.message ? ` → "${out.message.slice(0, 90)}"` : ''}`, type: 'worklog', source: { kind: 'agent', pairId } });
    }

    let posted = null;
    if (privateTurn) {
      if (out.message) this.addMessage({ channel: pairId, pairId, kind: 'agent', text: out.message, rationale: out.rationale, clarifying: out.clarifying, traceId });
      if (teamEffects.length) {
        if (mode === 'both') this.createDraft(pairId, { ...out, message: '' }, job.trigger, teamEffects, traceId);
        else this.applyTeamEffects(pairId, teamEffects, { humanApproved: false });
      }
    } else if (mode === 'both') {
      if ((out.speak && out.message) || teamEffects.length) this.createDraft(pairId, out.speak ? out : { ...out, message: '' }, job.trigger, teamEffects, traceId);
    } else {
      this.applyTeamEffects(pairId, teamEffects, { humanApproved: false });
      if (allowPost && out.speak && out.message) {
        posted = this.addMessage({ channel: 'group', pairId, kind: 'agent', text: out.message, rationale: out.rationale, clarifying: out.clarifying, traceId });
      }
    }

    if (job.kind === 'revise') this.changed('draft_revised', { pairId, from: job.draftId });
    this.changed('agent_output', { pairId, kind, effects: (out.effects ?? []).map((e) => e.type), posted: Boolean(posted), offline: Boolean(out.trace?.offline) });
    return posted;
  }

  recordTrace(pairId, job, out) {
    const t = out.trace ?? {};
    const trace = {
      id: newId('tr'),
      ts: Date.now(),
      trigger: { kind: job.trigger.kind, text: (job.trigger.text ?? '').slice(0, 200), from: job.trigger.from ?? job.trigger.pairId ?? null },
      plan: t.plan ?? [],
      steps: t.steps ?? [],
      review: t.review ?? null,
      motivation: out.motivation,
      calls: t.calls ?? 0,
      ms: t.ms ?? 0,
      offline: Boolean(t.offline),
      spoke: Boolean(out.speak && out.message),
      effects: (out.effects ?? []).map((e) => ({ type: e.type, tool: e.tool, title: e.title, to: e.to })),
      error: out.error ?? null,
    };
    this.traces[pairId].push(trace);
    if (this.traces[pairId].length > MAX_TRACES) this.traces[pairId].splice(0, this.traces[pairId].length - MAX_TRACES);
    return trace.id;
  }

  applyTeamEffects(pairId, effects, { humanApproved }) {
    const rank = CRITICALITY[this.task?.criticality]?.rank ?? 0;
    const by = { kind: 'agent', pairId, humanApproved };
    for (const e of effects) {
      if (e.type === 'create_task' && !this.global.task(e.id)) {
        this.global.addTask({ id: e.id, title: e.title, detail: e.detail, owner: e.owner, source: by });
      } else if (e.type === 'update_task') {
        this.global.updateTask(e.taskId, { status: e.status, owner: e.owner, note: e.note, by });
      } else if (e.type === 'submit_work') {
        const status = rank >= 2 && !humanApproved ? 'needs_signoff' : 'active';
        if (this.global.addArtifact(e.taskId, { title: e.title, content: e.content, by, status })) {
          this.global.updateTask(e.taskId, { status: 'done', by });
        }
      } else if (e.type === 'remember') {
        this.applyMemory(pairId, [{ scope: 'global', type: e.memType, text: e.text }], { humanApproved });
      } else if (e.type === 'message_agent') {
        this.sendAgentDm(pairId, e.to, e.text, e.depth ?? 1);
      } else if (e.type === 'external_action') {
        const approval = { id: newId('ap'), ts: Date.now(), pairId, tool: e.tool, args: e.args, status: humanApproved ? 'approved' : 'pending', decidedBy: humanApproved ? pairId : null, result: null };
        this.approvals.push(approval);
        if (humanApproved) this.schedule({ kind: 'run_action', approvalId: approval.id });
      }
    }
    if (effects.length) this.changed('team_effects', { pairId, types: effects.map((e) => e.type), humanApproved });
  }

  createDraft(pairId, out, trigger, effects = [], traceId = null) {
    for (const d of this.drafts[pairId]) if (d.status === 'pending') d.status = 'superseded';
    const draft = {
      id: newId('d'),
      ts: Date.now(),
      text: out.message ?? '',
      rationale: out.rationale ?? '',
      clarifying: Boolean(out.clarifying),
      effects,
      motivation: out.motivation,
      inReplyTo: trigger.messageId ?? null,
      traceId,
      status: 'pending',
    };
    this.drafts[pairId].push(draft);
    if (this.pairMem[pairId].userModel.teaching && out.rationale) {
      this.addMessage({ channel: pairId, pairId, kind: 'agent', text: `How I got to this draft: ${out.rationale}`, traceId });
    }
    return draft;
  }

  reviewDraft({ pairId, draftId, action, text, feedback }) {
    this.requirePair(pairId);
    const draft = this.drafts[pairId].find((d) => d.id === draftId);
    if (!draft) throw new SessionError('Draft not found.');
    if (draft.status !== 'pending') throw new SessionError(`Draft is already ${draft.status}.`);
    const um = this.pairMem[pairId].userModel;

    if (action === 'approve' || action === 'edit') {
      const edited = action === 'edit' && text?.trim() && text.trim() !== draft.text;
      draft.status = edited ? 'edited' : 'approved';
      um.engagement[edited ? 'adapt' : 'direct'] += 1;
      this.applyTeamEffects(pairId, draft.effects ?? [], { humanApproved: true });
      const body = edited ? text.trim() : draft.text;
      let msg = null;
      if (body) {
        msg = this.addMessage({ channel: 'group', pairId, kind: 'agent', text: body, rationale: draft.rationale, viaDraft: edited ? 'adapt' : 'direct', clarifying: draft.clarifying, traceId: draft.traceId });
        this.schedule({ kind: 'group', depth: 1, trigger: { kind: 'group', text: msg.text, pairId, fromAgent: true, messageId: msg.id, authorLabel: msg.authorLabel } });
      }
      this.changed('draft_reviewed', { pairId, draftId, action: draft.status, effects: (draft.effects ?? []).length });
      return msg;
    }

    if (action === 'explain') {
      um.engagement.understand += 1;
      this.changed('draft_reviewed', { pairId, draftId, action: 'explain' });
      this.schedule({ kind: 'private', pairId, draftId, trigger: { kind: 'explain', text: draft.text || describeEffects(draft.effects) } });
      return null;
    }

    if (action === 'revise') {
      if (!feedback?.trim()) throw new SessionError('Tell the agent what to change.');
      um.engagement.critique += 1;
      draft.status = 'revised';
      this.addMessage({ channel: pairId, pairId, kind: 'human', text: `Revise: ${feedback.trim()}` });
      this.changed('draft_reviewed', { pairId, draftId, action: 'revise' });
      this.schedule({ kind: 'revise', pairId, draftId, trigger: { kind: 'revise', text: draft.text || describeEffects(draft.effects), feedback: feedback.trim(), messageId: draft.inReplyTo } });
      return null;
    }

    if (action === 'reject') {
      um.engagement.reject += 1;
      draft.status = 'rejected';
      this.changed('draft_reviewed', { pairId, draftId, action: 'reject' });
      return null;
    }

    throw new SessionError(`Unknown review action "${action}".`);
  }

  runRound() {
    this.requireTask();
    const last = [...this.group].reverse().find((m) => m.kind !== 'system');
    this.schedule({ kind: 'group', depth: 0, trigger: { kind: 'round', text: last?.text ?? this.task.title, pairId: null, fromAgent: false } });
  }

  isThinking(id) {
    return Boolean(this.thinking[id]) && Date.now() - this.thinking[id].since < THINKING_TTL_MS;
  }

  buildCtx(pairId, trigger, extra = {}) {
    const pair = this.pairs[pairId];
    const rank = CRITICALITY[this.task?.criticality]?.rank ?? 1;
    const named = (trigger.text ?? '').toLowerCase();
    const mentioned = named.includes(pair.agentName.toLowerCase()) || named.includes(`@${firstName(pair.humanName).toLowerCase()}`);
    const notes = this.pairMem[pairId].notes;
    return {
      task: this.task,
      channel: this.channel,
      mode: pair.mode,
      teaching: this.pairMem[pairId].userModel.teaching,
      trigger,
      lastDraft: extra.lastDraft ?? null,
      criticalityRank: rank,
      budget: MAX_CALLS_PER_TURN,
      mustRespond: ['private', 'explain', 'revise', 'friction', 'agent_dm'].includes(trigger.kind) || mentioned,
      teamLine: PAIR_IDS.map((id) => `${id} = ${this.pairs[id].humanName} (${this.pairs[id].title}; agent ${this.pairs[id].agentName})${id === pairId ? ' ← you' : ''}`).join('; '),
      teamSummary: PAIR_IDS.map((id) => `${this.pairs[id].humanName}: ${MODES[this.pairs[id].mode].label}`).join('; '),
      groupThread: this.group.slice(-20),
      pairThread: this.pairThreads[pairId].slice(-10),
      agentThread: this.agentThread.filter((m) => m.from === pairId || m.to === pairId).slice(-12).map((m) => ({ ...m, authorLabel: `${m.authorLabel} → ${m.toLabel}` })),
      globalMemory: this.global.toPrompt(),
      boardText: this.global.boardPrompt(),
      pairMemory: this.pairMem[pairId].toPrompt(),
      workspace: {
        pairId,
        pairIds: PAIR_IDS,
        board: this.global.tasks,
        memory: this.global.active(),
        notes: notes.filter((n) => n.type !== 'worklog'),
        mode: pair.mode,
        criticality: this.task?.criticality,
      },
      privateFacts: notes.filter((n) => !n.shared && n.type === 'fact').map((n) => n.text),
      teamFacts: this.global.active().filter((i) => i.type === 'fact').map((i) => i.text),
      activeIds: this.activeAgentPairs(),
      allIds: PAIR_IDS,
      groupCount: this.group.filter((m) => m.kind !== 'system').length,
    };
  }

  // ---------- memory ----------

  applyMemory(pairId, updates = [], { humanApproved }) {
    const highStakes = (CRITICALITY[this.task?.criticality]?.rank ?? 0) >= 2;
    for (const u of updates) {
      if (u.scope === 'pair') {
        this.pairMem[pairId].addNote({ text: u.text, type: u.type ?? 'fact', source: { kind: 'agent', pairId } });
        continue;
      }
      const needsSignoff = u.type === 'decision' && highStakes && !humanApproved;
      this.global.add({ type: u.type, text: u.text, source: { kind: 'agent', pairId, humanApproved }, status: needsSignoff ? 'needs_signoff' : 'active' });
    }
  }

  addMemory({ pairId, scope, type, text }) {
    this.requirePair(pairId);
    text = text?.trim();
    if (!text) throw new SessionError('Memory item is empty.');
    if (scope === 'pair') {
      const note = this.pairMem[pairId].addNote({ text, type, source: { kind: 'human', pairId } });
      this.changed('memory_added', { pairId, scope, id: note.id });
      return note;
    }
    if (this.pairs[pairId].mode === 'agent') throw new SessionError('Only a participating human can write to team memory directly.');
    const item = this.global.add({ type, text, source: { kind: 'human', pairId } });
    this.changed('memory_added', { pairId, scope: 'global', id: item.id });
    return item;
  }

  shareNote({ pairId, noteId }) {
    this.requirePair(pairId);
    const note = this.pairMem[pairId].getNote(noteId);
    if (!note) throw new SessionError('Note not found.');
    if (note.shared) throw new SessionError('Already shared.');
    note.shared = true;
    const item = this.global.add({ type: note.type === 'thought' ? 'fact' : note.type === 'worklog' ? 'fact' : note.type, text: note.text, source: { kind: 'human', pairId, from: 'pair-memory' } });
    this.changed('note_shared', { pairId, noteId, globalId: item.id });
    return item;
  }

  requirePresentHuman(pairId) {
    this.requirePair(pairId);
    if (this.pairs[pairId].mode === 'agent') throw new SessionError('Sign-off needs a participating human.');
  }

  signOff({ pairId, itemId }) {
    this.requirePresentHuman(pairId);
    const item = this.global.get(itemId);
    if (item) {
      item.status = 'active';
      item.signedOffBy = pairId;
      this.changed('signed_off', { pairId, itemId });
      return;
    }
    const found = this.global.artifact(itemId);
    if (!found) throw new SessionError('Item not found.');
    found.artifact.status = 'active';
    found.artifact.signedOffBy = pairId;
    this.changed('signed_off', { pairId, itemId, artifact: true });
  }

  decideAction({ pairId, approvalId, decision }) {
    this.requirePresentHuman(pairId);
    const a = this.approvals.find((x) => x.id === approvalId);
    if (!a) throw new SessionError('Approval request not found.');
    if (a.status !== 'pending') throw new SessionError(`Already ${a.status}.`);
    a.decidedBy = pairId;
    if (decision === 'approve') {
      a.status = 'approved';
      this.schedule({ kind: 'run_action', approvalId: a.id });
    } else a.status = 'rejected';
    this.changed('action_decided', { pairId, approvalId, decision });
  }

  applyActionResult(approvalId, { ok, text }) {
    const a = this.approvals.find((x) => x.id === approvalId);
    if (!a) return;
    a.status = ok ? 'done' : 'failed';
    a.result = String(text).slice(0, 1200);
    this.pairMem[a.pairId].addNote({ text: `${ok ? 'Ran' : 'Failed'} ${a.tool}: ${a.result.slice(0, 300)}`, type: 'worklog', source: { kind: 'agent', pairId: a.pairId } });
    this.systemMessage(`${this.pairs[a.pairId].agentName} ${ok ? 'ran' : 'could not run'} ${a.tool} (approved by ${this.pairs[a.decidedBy]?.humanName ?? 'a teammate'}).`, { mirror: false });
    this.changed('action_result', { approvalId, ok });
  }

  removeMemory({ pairId, scope, itemId }) {
    this.requirePair(pairId);
    if (scope === 'pair') this.pairMem[pairId].removeNote(itemId);
    else {
      if (this.pairs[pairId].mode === 'agent') throw new SessionError('Only a participating human can edit team memory.');
      this.global.remove(itemId);
    }
    this.changed('memory_removed', { pairId, scope, itemId });
  }

  // ---------- Slack ----------

  applySlackResult(messageId, { threadTs, ts }) {
    this.slack.threadTs = threadTs;
    this.slack.posted[messageId] = ts;
  }

  /** A message from the mirrored Slack thread, posted by a mapped Slack user. */
  ingestSlack({ eventId, user, text, threadTs }) {
    if (this.slack.seen.includes(eventId)) return { ignored: 'duplicate' };
    this.slack.seen.push(eventId);
    if (this.slack.seen.length > 200) this.slack.seen.splice(0, this.slack.seen.length - 200);
    const pairId = slackConfig().userMap[user];
    if (!pairId || !PAIR_IDS.includes(pairId)) return { ignored: 'unmapped user' };
    if (!this.task) return { ignored: 'no task' };
    if (this.slack.threadTs && threadTs !== this.slack.threadTs) return { ignored: 'other thread' };
    if (this.pairs[pairId].mode === 'agent') return { ignored: 'agent only mode' };
    const msg = this.post({ pairId, channel: 'group', text, source: 'slack' });
    return { posted: msg.id };
  }

  // ---------- friction ----------

  flagFriction({ pairId, messageId, source }) {
    this.requirePair(pairId);
    const sources = { me: 'user', agent: 'model', both: 'compound' };
    if (!sources[source]) throw new SessionError('Pick who caused the friction.');
    const friction = { id: newId('f'), ts: Date.now(), pairId, messageId, source: sources[source], recovery: null };
    this.frictions.push(friction);
    this.pairMem[pairId].userModel.friction += 1;
    this.changed('friction_flagged', friction);
    if (this.pairs[pairId].mode !== 'human') {
      this.schedule({ kind: 'private', pairId, trigger: { kind: 'friction', text: this.findMessage(messageId)?.text ?? '' } });
    }
    return friction;
  }

  // Classifies the human's next move after friction: asking (disambiguate), adding
  // new information (repair), or rewording the same request (reformulate).
  detectRecovery(pairId, msg) {
    const open = [...this.frictions].reverse().find((f) => f.pairId === pairId && !f.recovery && Date.now() - f.ts < 15 * 60 * 1000);
    if (!open) return;
    const thread = msg.channel === 'group' ? this.group : this.pairThreads[msg.channel];
    const prev = [...thread].reverse().find((m) => m.id !== msg.id && m.kind === 'human' && m.pairId === pairId);
    let type;
    if (msg.text.trim().endsWith('?')) type = 'disambiguate';
    else if (!prev) type = 'repair';
    else {
      const prevWords = new Set(prev.text.toLowerCase().split(/\W+/).filter(Boolean));
      const words = msg.text.toLowerCase().split(/\W+/).filter(Boolean);
      const novel = words.filter((w) => !prevWords.has(w)).length / Math.max(words.length, 1);
      type = novel >= 0.5 || msg.text.length > prev.text.length * 1.3 ? 'repair' : 'reformulate';
    }
    open.recovery = type;
    this.pairMem[pairId].userModel.recoveries[type] += 1;
    this.changed('friction_recovery', { frictionId: open.id, pairId, recovery: type });
  }

  findMessage(id) {
    return this.group.find((m) => m.id === id) ?? PAIR_IDS.flatMap((p) => this.pairThreads[p]).find((m) => m.id === id);
  }

  // ---------- analytics + views ----------

  contributionCounts() {
    const c = Object.fromEntries(PAIR_IDS.map((id) => [id, 0]));
    for (const m of this.group) if (m.pairId) c[m.pairId] += 1;
    return c;
  }

  analytics() {
    return Object.fromEntries(
      PAIR_IDS.map((id) => {
        const msgs = this.group.filter((m) => m.pairId === id);
        const human = msgs.filter((m) => m.kind === 'human').length;
        const agentSolo = msgs.filter((m) => m.kind === 'agent' && !m.viaDraft).length;
        const approved = msgs.filter((m) => m.viaDraft === 'direct').length;
        const adapted = msgs.filter((m) => m.viaDraft === 'adapt').length;
        const total = human + agentSolo + approved + adapted;
        const share = total ? (human + 0.5 * adapted) / total : null;
        const um = this.pairMem[id].userModel;
        const traces = this.traces[id];
        return [
          id,
          {
            human,
            agentSolo,
            approved,
            adapted,
            humanShare: share,
            agency: agencyLevel(share),
            engagement: um.engagement,
            friction: um.friction,
            recoveries: um.recoveries,
            agentDms: this.agentThread.filter((m) => m.from === id).length,
            toolCalls: traces.reduce((n, t) => n + t.steps.length, 0),
            llmCalls: traces.reduce((n, t) => n + t.calls, 0),
            revisedByReviewer: traces.filter((t) => t.review?.verdict === 'revise').length,
            tasksOwned: this.global.tasks.filter((t) => t.owner === id).length,
            deliverables: this.global.tasks.flatMap((t) => t.artifacts).filter((a) => a.by?.pairId === id).length,
          },
        ];
      })
    );
  }

  pairPrivate(id) {
    return {
      pairId: id,
      thread: this.pairThreads[id],
      drafts: this.drafts[id].filter((d) => d.status === 'pending'),
      notes: this.pairMem[id].notes,
      userModel: this.pairMem[id].userModel,
      traces: this.traces[id],
      frictions: this.frictions.filter((f) => f.pairId === id),
    };
  }

  view(viewer) {
    const base = {
      viewer,
      workspace: { name: WORKSPACE, channel: this.channel, slack: slackEnabled() ? { threadTs: this.slack.threadTs } : null },
      llm: { ...describeProvider(), callsToday: this.usage.day === today() ? this.usage.calls : 0, dailyCap: DAILY_LLM_CAP },
      task: this.task,
      crew: CREW,
      criticality: CRITICALITY,
      modes: MODES,
      pairs: PAIR_IDS.map((id) => ({ ...this.pairs[id], thinking: this.isThinking(id) ? this.thinking[id] : null })),
      group: this.group,
      agentThread: this.agentThread,
      board: this.global.tasks,
      global: this.global.active(),
      approvals: this.approvals.slice(-40),
      analytics: this.analytics(),
      queued: this.queue.length,
    };
    if (PAIR_IDS.includes(viewer)) base.mine = this.pairPrivate(viewer);
    if (viewer === 'observer') {
      base.all = Object.fromEntries(PAIR_IDS.map((id) => [id, this.pairPrivate(id)]));
      base.modeHistory = this.modeHistory;
      base.llmError = this.llmError;
    }
    return base;
  }

  exportData() {
    return { exportedAt: new Date().toISOString(), llm: describeProvider(), ...this.snapshot(), analytics: this.analytics(), events: this.events };
  }

  requirePair(pairId) {
    if (!PAIR_IDS.includes(pairId)) throw new SessionError(`Unknown teammate "${pairId}".`);
  }

  requireTask() {
    if (!this.task) throw new SessionError('Create a task first.');
  }
}

function describeEffects(effects = []) {
  return effects.map((e) => (e.type === 'submit_work' ? `submit "${e.title}"` : e.type === 'create_task' ? `create task "${e.title}"` : e.tool ?? e.type)).join(', ');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function agencyLevel(share) {
  if (share == null) return null;
  if (share < 0.1) return 'H1';
  if (share < 0.3) return 'H2';
  if (share < 0.6) return 'H3';
  if (share < 0.9) return 'H4';
  return 'H5';
}
