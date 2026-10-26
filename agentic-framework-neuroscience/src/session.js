import { ROLES, CRITICALITY, SPEAK_THRESHOLD } from './agent.js';
import { GlobalMemory, PairMemory, newId } from './memory.js';
import { describeProvider } from './llm.js';

export const PAIR_IDS = ['A', 'B', 'C'];
export const MODES = {
  human: { label: 'Human only', has: 'H5' },
  agent: { label: 'Agent only', has: 'H1–H2' },
  both: { label: 'Human + agent', has: 'H3–H4' },
};
const MAX_AGENT_CHAIN = 2;
const THINKING_TTL_MS = 90 * 1000;
const MAX_EVENTS = 400;
const DAILY_LLM_CAP = Number(process.env.LLM_DAILY_CAP || 150);

const DEFAULT_PAIRS = {
  A: { humanName: 'Human A', agentName: 'Atlas', role: 'facilitator' },
  B: { humanName: 'Human B', agentName: 'Beacon', role: 'analyst' },
  C: { humanName: 'Human C', agentName: 'Cipher', role: 'critic' },
};

export class SessionError extends Error {}

/**
 * All collaboration state for one triad. A Session is rebuilt from a stored
 * snapshot on every request, so it must stay plain data plus pure mutations.
 * Anything that needs an LLM call is queued as a job (see prepareJob/applyJob)
 * and executed by the runtime outside the state transaction.
 */
export class Session {
  constructor({ snapshot = null } = {}) {
    this.jobs = [];
    if (snapshot) this.load(snapshot);
    else this.reset();
  }

  // ---------- lifecycle ----------

  reset() {
    this.task = null;
    this.pairs = Object.fromEntries(PAIR_IDS.map((id) => [id, { id, mode: 'both', ...DEFAULT_PAIRS[id] }]));
    this.group = [];
    this.pairThreads = { A: [], B: [], C: [] };
    this.drafts = { A: [], B: [], C: [] };
    this.global = new GlobalMemory();
    this.pairMem = Object.fromEntries(PAIR_IDS.map((id) => [id, new PairMemory(id)]));
    this.frictions = [];
    this.modeHistory = [];
    this.events = [];
    this.thinking = {};
    this.usage = this.usage ?? { day: today(), calls: 0 };
    this.llmError = null;
    this.jobs = [];
    this.changed('reset');
  }

  load(s) {
    this.task = s.task ?? null;
    this.pairs = s.pairs;
    this.group = s.group ?? [];
    this.pairThreads = s.pairThreads ?? { A: [], B: [], C: [] };
    this.drafts = s.drafts ?? { A: [], B: [], C: [] };
    this.global = new GlobalMemory(s.global);
    this.pairMem = Object.fromEntries(PAIR_IDS.map((id) => [id, new PairMemory(id, s.pairMem?.[id])]));
    this.frictions = s.frictions ?? [];
    this.modeHistory = s.modeHistory ?? [];
    this.events = s.events ?? [];
    this.thinking = s.thinking ?? {};
    this.usage = s.usage ?? { day: today(), calls: 0 };
    this.llmError = s.llmError ?? null;
  }

  snapshot() {
    return {
      task: this.task,
      pairs: this.pairs,
      group: this.group,
      pairThreads: this.pairThreads,
      drafts: this.drafts,
      global: this.global.toJSON(),
      pairMem: Object.fromEntries(PAIR_IDS.map((id) => [id, this.pairMem[id].toJSON()])),
      frictions: this.frictions,
      modeHistory: this.modeHistory,
    };
  }

  toJSON() {
    return { ...this.snapshot(), events: this.events, thinking: this.thinking, usage: this.usage, llmError: this.llmError };
  }

  changed(eventType, data = {}) {
    this.events.push({ ts: Date.now(), type: eventType, ...data });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  schedule(job) {
    this.jobs.push({ ...job, taskId: this.task?.id ?? null });
  }

  takeJobs() {
    const jobs = this.jobs;
    this.jobs = [];
    return jobs;
  }

  // ---------- task + configuration ----------

  createTask({ title, description = '', criticality = 'operational', subtasks = [], privateBriefs = {} }) {
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
    this.group = [];
    this.pairThreads = { A: [], B: [], C: [] };
    this.drafts = { A: [], B: [], C: [] };
    this.global = new GlobalMemory();
    this.frictions = [];
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
    this.systemMessage(`New task: "${this.task.title}" (${CRITICALITY[criticality].label}). Each pair can choose Human only, Agent only, or Human + agent.`);
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
    this.systemMessage(`Pair ${pairId} is now ${MODES[mode].label}.`);
    this.changed('mode_changed', { pairId, from: prev, to: mode });
  }

  setPairConfig(pairId, { humanName, agentName, role, teaching }) {
    this.requirePair(pairId);
    const p = this.pairs[pairId];
    if (humanName?.trim()) p.humanName = humanName.trim().slice(0, 40);
    if (agentName?.trim()) p.agentName = agentName.trim().slice(0, 40);
    if (role) {
      if (!ROLES[role]) throw new SessionError(`Unknown role "${role}".`);
      p.role = role;
    }
    if (typeof teaching === 'boolean') this.pairMem[pairId].userModel.teaching = teaching;
    this.changed('pair_config', { pairId, humanName, agentName, role, teaching });
  }

  // ---------- messages ----------

  post({ pairId, channel, text }) {
    this.requirePair(pairId);
    this.requireTask();
    text = text?.trim();
    if (!text) throw new SessionError('Message is empty.');
    const mode = this.pairs[pairId].mode;

    if (channel === 'group') {
      if (mode === 'agent') throw new SessionError('Your pair is in Agent only mode. Switch to Human only or Human + agent to post.');
      const msg = this.addMessage({ channel: 'group', pairId, kind: 'human', text });
      this.detectRecovery(pairId, msg);
      this.changed('human_post', { pairId, channel, messageId: msg.id });
      this.schedule({ kind: 'group', depth: 0, trigger: { kind: 'group', text, pairId, fromAgent: false, messageId: msg.id } });
      return msg;
    }

    if (channel === 'pair') {
      if (mode === 'human') throw new SessionError('Your agent has not joined this task (Human only). Switch modes to talk to it.');
      const msg = this.addMessage({ channel: pairId, pairId, kind: 'human', text });
      this.detectRecovery(pairId, msg);
      this.changed('human_post', { pairId, channel, messageId: msg.id });
      this.schedule({ kind: 'private', pairId, trigger: { kind: 'private', text } });
      return msg;
    }

    throw new SessionError(`Unknown channel "${channel}".`);
  }

  addMessage({ channel, pairId = null, kind, text, rationale = '', viaDraft = null, clarifying = false }) {
    const p = pairId ? this.pairs[pairId] : null;
    const authorLabel =
      kind === 'system' ? 'System' : kind === 'human' ? `${p.humanName} (Pair ${pairId})` : `${p.agentName} (Pair ${pairId} agent)`;
    const msg = { id: newId('m'), ts: Date.now(), channel, pairId, kind, authorLabel, text, rationale, viaDraft, clarifying };
    if (channel === 'group') this.group.push(msg);
    else this.pairThreads[channel].push(msg);
    return msg;
  }

  systemMessage(text) {
    return this.addMessage({ channel: 'group', kind: 'system', text });
  }

  // ---------- agent turns ----------

  activeAgentPairs() {
    return PAIR_IDS.filter((id) => this.pairs[id].mode !== 'human');
  }

  /**
   * Phase 1 of a job: decide which agents should think and build their prompts.
   * Marks them as thinking and reserves LLM budget; returns plain data only.
   */
  prepareJob(job) {
    if (job.taskId !== (this.task?.id ?? null)) return [];
    let ids = [];
    let extra = {};
    if (job.kind === 'group') {
      if (!this.task) return [];
      ids = this.activeAgentPairs().filter((id) => !(job.trigger.fromAgent && job.trigger.pairId === id));
    } else if (job.kind === 'private' || job.kind === 'revise') {
      if (this.pairs[job.pairId].mode === 'human') return [];
      ids = [job.pairId];
      if (job.draftId) extra.lastDraft = this.drafts[job.pairId].find((d) => d.id === job.draftId) ?? null;
    }
    if (!ids.length) return [];

    const now = Date.now();
    const live = describeProvider().provider !== 'offline';
    if (this.usage.day !== today()) this.usage = { day: today(), calls: 0 };
    return ids.map((id) => {
      this.thinking[id] = now;
      let offline = !live;
      if (live) {
        if (this.usage.calls < DAILY_LLM_CAP) this.usage.calls += 1;
        else offline = true;
      }
      const p = this.pairs[id];
      return {
        pairId: id,
        agent: { pairId: id, name: p.agentName, role: p.role },
        ctx: { ...this.buildCtx(id, job.trigger, extra), offline },
      };
    });
  }

  /** Phase 2 of a job: write the agents' outputs back into the (fresh) state. */
  applyJob(job, outs) {
    for (const id of Object.keys(outs)) delete this.thinking[id];
    const errored = Object.values(outs).find((o) => o.error);
    if (errored) this.llmError = { ts: Date.now(), message: errored.error };
    if (job.taskId !== (this.task?.id ?? null)) return;
    if (job.kind === 'group') return this.applyGroupTurn(job, outs);
    if (job.kind === 'private') return this.applyPrivateTurn(job.pairId, job.trigger, outs[job.pairId]);
    if (job.kind === 'revise') {
      const out = outs[job.pairId];
      if (out?.message) this.createDraft(job.pairId, { ...out, motivation: 1 }, { messageId: job.inReplyTo });
      this.changed('draft_revised', { pairId: job.pairId, from: job.draftId });
    }
  }

  applyGroupTurn(job, outs) {
    const { trigger, depth } = job;
    const results = Object.entries(outs).map(([id, out]) => ({ id, out }));

    const willing = results.filter(({ out }) => out.speak && out.message && out.motivation >= SPEAK_THRESHOLD);

    // Paired agents never speak to the group directly: they hand a draft to their human.
    for (const { id, out } of willing.filter(({ id }) => this.pairs[id].mode === 'both')) {
      this.createDraft(id, out, trigger);
    }

    // Among solo agents, only the most motivated one takes the floor per turn.
    const solo = willing.filter(({ id }) => this.pairs[id].mode === 'agent').sort((a, b) => b.out.motivation - a.out.motivation)[0];
    let posted = null;
    if (solo) {
      posted = this.addMessage({
        channel: 'group',
        pairId: solo.id,
        kind: 'agent',
        text: solo.out.message,
        rationale: solo.out.rationale,
        clarifying: solo.out.clarifying,
      });
      this.applyMemory(solo.id, solo.out.memory, { humanApproved: false });
    }

    this.changed('agent_turn', {
      trigger: trigger.kind,
      depth,
      scores: Object.fromEntries(results.map(({ id, out }) => [id, Number(out.motivation.toFixed(2))])),
      posted: posted?.pairId ?? null,
    });

    if (posted && depth + 1 < MAX_AGENT_CHAIN) {
      this.schedule({
        kind: 'group',
        depth: depth + 1,
        trigger: { kind: 'group', text: posted.text, pairId: posted.pairId, fromAgent: true, messageId: posted.id },
      });
    }
  }

  applyPrivateTurn(pairId, trigger, out) {
    if (!out || this.pairs[pairId].mode === 'human') return;
    if (out.message) {
      this.addMessage({ channel: pairId, pairId, kind: 'agent', text: out.message, rationale: out.rationale, clarifying: out.clarifying });
    }
    // Private conversation only ever writes to private memory.
    for (const m of out.memory) {
      this.pairMem[pairId].addNote({ text: m.text, type: m.type ?? 'fact', source: { kind: 'agent', pairId } });
    }
    this.changed('agent_private', { pairId, trigger: trigger.kind });
    return out;
  }

  createDraft(pairId, out, trigger) {
    for (const d of this.drafts[pairId]) if (d.status === 'pending') d.status = 'superseded';
    const draft = {
      id: newId('d'),
      ts: Date.now(),
      text: out.message,
      rationale: out.rationale,
      clarifying: out.clarifying,
      memory: out.memory,
      motivation: out.motivation,
      inReplyTo: trigger.messageId ?? null,
      status: 'pending',
    };
    this.drafts[pairId].push(draft);
    if (this.pairMem[pairId].userModel.teaching && out.rationale) {
      this.addMessage({ channel: pairId, pairId, kind: 'agent', text: `How I got to this draft: ${out.rationale}` });
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
      const msg = this.addMessage({
        channel: 'group',
        pairId,
        kind: 'agent',
        text: edited ? text.trim() : draft.text,
        rationale: draft.rationale,
        viaDraft: edited ? 'adapt' : 'direct',
        clarifying: draft.clarifying,
      });
      // Memory proposals ride along only when the human sent the draft unchanged.
      if (!edited) this.applyMemory(pairId, draft.memory, { humanApproved: true });
      this.changed('draft_reviewed', { pairId, draftId, action: draft.status });
      this.schedule({ kind: 'group', depth: 1, trigger: { kind: 'group', text: msg.text, pairId, fromAgent: true, messageId: msg.id } });
      return msg;
    }

    if (action === 'explain') {
      um.engagement.understand += 1;
      this.changed('draft_reviewed', { pairId, draftId, action: 'explain' });
      this.schedule({ kind: 'private', pairId, draftId, trigger: { kind: 'explain', text: draft.text } });
      return null;
    }

    if (action === 'revise') {
      if (!feedback?.trim()) throw new SessionError('Tell the agent what to change.');
      um.engagement.critique += 1;
      draft.status = 'revised';
      this.addMessage({ channel: pairId, pairId, kind: 'human', text: `Revise: ${feedback.trim()}` });
      this.changed('draft_reviewed', { pairId, draftId, action: 'revise' });
      this.schedule({
        kind: 'revise',
        pairId,
        draftId,
        inReplyTo: draft.inReplyTo,
        trigger: { kind: 'revise', text: draft.text, feedback: feedback.trim() },
      });
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
    return Boolean(this.thinking[id]) && Date.now() - this.thinking[id] < THINKING_TTL_MS;
  }

  buildCtx(pairId, trigger, extra = {}) {
    const pair = this.pairs[pairId];
    const counts = this.contributionCounts();
    const others = PAIR_IDS.filter((id) => id !== pairId);
    const quietPair = others.reduce((q, id) => (counts[id] < counts[q] ? id : q), others[0]);
    const maxCount = Math.max(...PAIR_IDS.map((id) => counts[id]));
    const conversation = this.group.filter((m) => m.kind !== 'system');
    const lastOwn = conversation.map((m) => m.kind === 'agent' && m.pairId === pairId).lastIndexOf(true);
    const recapMsgs = conversation.slice(-2);

    return {
      task: this.task,
      role: pair.role,
      mode: pair.mode,
      teaching: this.pairMem[pairId].userModel.teaching,
      trigger,
      lastDraft: extra.lastDraft ?? null,
      groupThread: this.group.slice(-20),
      pairThread: this.pairThreads[pairId].slice(-10),
      globalMemory: this.global.toPrompt(),
      pairMemory: this.pairMem[pairId].toPrompt(),
      teamSummary: PAIR_IDS.map((id) => `Pair ${id}: ${ROLES[this.pairs[id].role].label} agent, ${MODES[this.pairs[id].mode].label}`).join('; '),
      recentlySpoke: this.group.slice(-2).some((m) => m.kind === 'agent' && m.pairId === pairId),
      sinceFacilitator: lastOwn === -1 ? conversation.length : conversation.length - 1 - lastOwn,
      quietPair: maxCount - counts[quietPair] >= 2 ? quietPair : null,
      recap: recapMsgs.length ? recapMsgs.map((m) => `${m.authorLabel.split(' (')[0]}: "${m.text.slice(0, 60)}"`).join('; ') : 'nothing decided yet',
      plannedSteps: this.global.active().filter((i) => i.type === 'plan').map((i) => i.text.replace(/^Next: /, '')),
      privateFacts: this.pairMem[pairId].notes.filter((n) => !n.shared && n.type === 'fact').map((n) => n.text),
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
      this.global.add({
        type: u.type,
        text: u.text,
        source: { kind: 'agent', pairId, humanApproved },
        status: needsSignoff ? 'needs_signoff' : 'active',
      });
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
    if (this.pairs[pairId].mode === 'agent') throw new SessionError('Only a participating human can write to global memory directly.');
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
    const item = this.global.add({ type: note.type, text: note.text, source: { kind: 'human', pairId, from: 'pair-memory' } });
    this.changed('note_shared', { pairId, noteId, globalId: item.id });
    return item;
  }

  signOff({ pairId, itemId }) {
    this.requirePair(pairId);
    if (this.pairs[pairId].mode === 'agent') throw new SessionError('Sign-off needs a participating human.');
    const item = this.global.get(itemId);
    if (!item) throw new SessionError('Memory item not found.');
    item.status = 'active';
    item.signedOffBy = pairId;
    this.changed('signed_off', { pairId, itemId });
  }

  removeMemory({ pairId, scope, itemId }) {
    this.requirePair(pairId);
    if (scope === 'pair') this.pairMem[pairId].removeNote(itemId);
    else {
      if (this.pairs[pairId].mode === 'agent') throw new SessionError('Only a participating human can edit global memory.');
      this.global.remove(itemId);
    }
    this.changed('memory_removed', { pairId, scope, itemId });
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
    const c = { A: 0, B: 0, C: 0 };
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
      frictions: this.frictions.filter((f) => f.pairId === id),
    };
  }

  view(viewer) {
    const base = {
      viewer,
      llm: { ...describeProvider(), callsToday: this.usage.day === today() ? this.usage.calls : 0, dailyCap: DAILY_LLM_CAP },
      task: this.task,
      roles: ROLES,
      criticality: CRITICALITY,
      modes: MODES,
      pairs: PAIR_IDS.map((id) => ({ ...this.pairs[id], thinking: this.isThinking(id) })),
      group: this.group,
      global: this.global.active(),
      analytics: this.analytics(),
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
    if (!PAIR_IDS.includes(pairId)) throw new SessionError(`Unknown pair "${pairId}".`);
  }

  requireTask() {
    if (!this.task) throw new SessionError('Create a task first.');
  }
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
