let counter = 0;
export const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const MEMORY_TYPES = ['decision', 'plan', 'fact', 'question'];
export const NOTE_TYPES = ['fact', 'thought', 'todo', 'worklog'];
export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Team memory every agent reads and writes: typed notes plus the task board.
 * Every item keeps provenance (which teammate, human or agent, and whether a
 * human approved it) so the team can audit where a "shared fact" came from.
 */
export class GlobalMemory {
  constructor(data = {}) {
    this.items = data.items ?? [];
    this.tasks = data.tasks ?? [];
  }

  add({ type, text, source, status = 'active' }) {
    const item = { id: newId('g'), type: MEMORY_TYPES.includes(type) ? type : 'fact', text, source, status, ts: Date.now() };
    this.items.push(item);
    return item;
  }

  get(id) {
    return this.items.find((i) => i.id === id);
  }

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
  }

  active() {
    return this.items.filter((i) => i.status !== 'removed');
  }

  // ---------- task board ----------

  addTask({ id = newId('task'), title, detail = '', owner = null, source }) {
    const task = {
      id,
      title: clip(String(title).trim(), 120),
      detail: clip(String(detail ?? '').trim(), 600),
      owner,
      status: owner ? 'doing' : 'todo',
      source,
      artifacts: [],
      log: [{ ts: Date.now(), by: source, text: owner ? `Created and assigned to ${owner}` : 'Created' }],
      ts: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.push(task);
    return task;
  }

  task(id) {
    return this.tasks.find((t) => t.id === id);
  }

  updateTask(id, { status, owner, note, by }) {
    const task = this.task(id);
    if (!task) return null;
    if (owner !== undefined) task.owner = owner;
    if (status && TASK_STATUSES.includes(status)) task.status = status;
    task.updatedAt = Date.now();
    const bits = [owner !== undefined ? `owner → ${owner ?? 'nobody'}` : '', status ? `status → ${status}` : '', note ?? ''].filter(Boolean);
    if (bits.length) task.log.push({ ts: Date.now(), by, text: bits.join(' · ') });
    return task;
  }

  addArtifact(taskId, { title, content, by, status = 'active' }) {
    const task = this.task(taskId);
    if (!task) return null;
    const artifact = { id: newId('art'), title: clip(String(title).trim(), 120), content: String(content), by, status, ts: Date.now() };
    task.artifacts.push(artifact);
    task.updatedAt = Date.now();
    task.log.push({ ts: Date.now(), by, text: `Submitted "${artifact.title}"` });
    return artifact;
  }

  artifact(id) {
    for (const t of this.tasks) {
      const a = t.artifacts.find((x) => x.id === id);
      if (a) return { task: t, artifact: a };
    }
    return null;
  }

  boardPrompt(limit = 20) {
    const lines = this.tasks.slice(-limit).map((t) => {
      const arts = t.artifacts.length ? ` · ${t.artifacts.length} deliverable(s): ${t.artifacts.map((a) => `"${a.title}" [${a.id}]`).join(', ')}` : '';
      return `- [${t.id}] ${t.title} — ${t.status}${t.owner ? `, owner ${t.owner}` : ', unassigned'}${arts}`;
    });
    return lines.length ? lines.join('\n') : '(no tasks yet)';
  }

  toPrompt(limit = 40) {
    const lines = this.active()
      .slice(-limit)
      .map((i) => {
        const who = i.source ? `${i.source.kind}${i.source.pairId ? ` ${i.source.pairId}` : ''}` : 'system';
        const flag = i.status === 'needs_signoff' ? ' [awaiting human sign-off]' : '';
        return `- (${i.type}) ${i.text} [from ${who}]${flag}`;
      });
    return lines.length ? lines.join('\n') : '(empty)';
  }

  /** Keyword search over notes, tasks, and deliverables, used by the search_memory tool. */
  search(query, limit = 6) {
    const terms = String(query ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    const docs = [
      ...this.active().map((i) => ({ ref: i.id, kind: i.type, text: i.text })),
      ...this.tasks.map((t) => ({ ref: t.id, kind: 'task', text: `${t.title}. ${t.detail} (${t.status}, owner ${t.owner ?? 'none'})` })),
      ...this.tasks.flatMap((t) => t.artifacts.map((a) => ({ ref: a.id, kind: 'deliverable', text: `${a.title}: ${a.content}` }))),
    ];
    return rank(docs, terms, limit);
  }

  toJSON() {
    return { items: this.items, tasks: this.tasks };
  }
}

export function rank(docs, terms, limit) {
  if (!terms.length) return docs.slice(-limit);
  return docs
    .map((d) => {
      const t = d.text.toLowerCase();
      return { ...d, score: terms.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0) };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const emptyUserModel = () => ({
  engagement: { direct: 0, adapt: 0, understand: 0, critique: 0, reject: 0 },
  friction: 0,
  recoveries: { repair: 0, reformulate: 0, disambiguate: 0 },
  teaching: false,
});

/**
 * Private memory for one teammate and their agent: their own facts and
 * thoughts, plus the agent's work log. Only that teammate's agent sees it in
 * its prompt; it reaches the team only when the human explicitly shares a note.
 */
export class PairMemory {
  constructor(pairId, data = {}) {
    this.pairId = pairId;
    this.notes = data.notes ?? [];
    this.userModel = { ...emptyUserModel(), ...(data.userModel ?? {}) };
  }

  addNote({ text, source, type = 'fact' }) {
    const note = { id: newId('p'), type: NOTE_TYPES.includes(type) ? type : 'fact', text: clip(String(text), 1200), source, shared: false, ts: Date.now() };
    this.notes.push(note);
    if (this.notes.length > 200) this.notes.splice(0, this.notes.length - 200);
    return note;
  }

  getNote(id) {
    return this.notes.find((n) => n.id === id);
  }

  removeNote(id) {
    this.notes = this.notes.filter((n) => n.id !== id);
  }

  search(query, limit = 5) {
    const terms = String(query ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return rank(this.notes.map((n) => ({ ref: n.id, kind: n.type, text: n.text })), terms, limit);
  }

  toPrompt(limit = 25) {
    const facts = this.notes.filter((n) => n.type !== 'worklog').slice(-limit);
    const work = this.notes.filter((n) => n.type === 'worklog').slice(-6);
    const lines = facts.map((n) => `- (${n.type}) ${n.text}${n.shared ? ' [already shared with team]' : ''}`);
    const e = this.userModel.engagement;
    const style =
      `Your human's engagement with your drafts so far: sent as-is ${e.direct}, edited ${e.adapt}, asked why ${e.understand}, ` +
      `asked for a revision ${e.critique}, discarded ${e.reject}. Teaching mode: ${this.userModel.teaching ? 'on' : 'off'}.`;
    return [
      lines.length ? lines.join('\n') : '(no private notes)',
      work.length ? `Your recent work log:\n${work.map((n) => `- ${n.text}`).join('\n')}` : '',
      style,
    ]
      .filter(Boolean)
      .join('\n');
  }

  toJSON() {
    return { notes: this.notes, userModel: this.userModel };
  }
}
