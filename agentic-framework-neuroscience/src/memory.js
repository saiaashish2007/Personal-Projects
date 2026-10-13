let counter = 0;
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const MEMORY_TYPES = ['decision', 'plan', 'fact', 'question'];

/**
 * Shared blackboard every agent reads and writes. Every item keeps provenance
 * (which pair, human or agent, and whether a human approved it) so the group can
 * audit where a "shared fact" came from.
 */
export class GlobalMemory {
  constructor(data = {}) {
    this.items = data.items ?? [];
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

  toJSON() {
    return { items: this.items };
  }
}

const emptyUserModel = () => ({
  engagement: { direct: 0, adapt: 0, understand: 0, critique: 0, reject: 0 },
  friction: 0,
  recoveries: { repair: 0, reformulate: 0, disambiguate: 0 },
  teaching: false,
});

/**
 * Private memory for one human-agent pair. Only that pair's agent sees it in its
 * prompt; it reaches the group only when the human explicitly shares a note.
 */
export class PairMemory {
  constructor(pairId, data = {}) {
    this.pairId = pairId;
    this.notes = data.notes ?? [];
    this.userModel = { ...emptyUserModel(), ...(data.userModel ?? {}) };
  }

  addNote({ text, source, type = 'fact' }) {
    const note = { id: newId('p'), type, text, source, shared: false, ts: Date.now() };
    this.notes.push(note);
    return note;
  }

  getNote(id) {
    return this.notes.find((n) => n.id === id);
  }

  removeNote(id) {
    this.notes = this.notes.filter((n) => n.id !== id);
  }

  toPrompt(limit = 25) {
    const lines = this.notes.slice(-limit).map((n) => `- (${n.type}) ${n.text}${n.shared ? ' [already shared]' : ''}`);
    const e = this.userModel.engagement;
    const style =
      `Partner engagement so far: used as-is ${e.direct}, edited ${e.adapt}, asked to explain ${e.understand}, ` +
      `critiqued ${e.critique}, rejected ${e.reject}. Teaching mode: ${this.userModel.teaching ? 'on' : 'off'}.`;
    return `${lines.length ? lines.join('\n') : '(no private notes)'}\n${style}`;
  }

  toJSON() {
    return { notes: this.notes, userModel: this.userModel };
  }
}
