import { newId, rank, TASK_STATUSES } from './memory.js';

/**
 * Built-in "team" tools. They run during an agent's reasoning loop against a
 * working copy of the session (so an agent reads its own writes), and each
 * write is recorded as an effect that the session applies afterwards in one
 * transaction. That keeps slow LLM loops outside the state lock.
 */
export const TEAM_TOOLS = [
  { name: 'team.create_task', args: '{ title: string, detail?: string, owner?: A|B|C }', description: 'Add a task to the team board. Use it to split work; assign an owner when the split is agreed.' },
  { name: 'team.claim_task', args: '{ task_id: string }', description: 'Take ownership of an unassigned task for your teammate.' },
  { name: 'team.update_task', args: '{ task_id: string, status: todo|doing|blocked|done, note?: string }', description: 'Change a task status, e.g. blocked with the reason.' },
  {
    name: 'team.submit_work',
    args: '{ task_id: string, title: string, content: string }',
    description: 'Attach a finished deliverable (the actual work product, in markdown) to a task and mark it done.',
  },
  { name: 'team.read_task', args: '{ task_id: string }', description: 'Read a task, its log, and the full text of its deliverables.', readOnly: true },
  { name: 'team.message_agent', args: '{ to: A|B|C, text: string }', description: "Send a direct message to a teammate's agent to coordinate, hand off, or share work so far." },
  { name: 'team.remember', args: '{ scope: private|team, type: fact|decision|plan|question|thought, text: string }', description: 'Save a note to your private memory or to team memory.' },
  { name: 'team.search_memory', args: '{ query: string }', description: 'Search team memory, the board, deliverables, and your private notes.', readOnly: true },
  { name: 'team.ask_my_human', args: '{ question: string }', description: 'Ask your own teammate a question in your private DM.' },
];

const TEAM_WRITES = new Set(['team.create_task', 'team.claim_task', 'team.update_task', 'team.submit_work']);

/** Working copy of what one agent can see, plus the effects it has produced so far. */
export class Workspace {
  constructor({ pairId, pairIds, board, memory, notes, mode, criticality }) {
    this.pairId = pairId;
    this.pairIds = pairIds;
    this.board = structuredClone(board);
    this.memory = memory;
    this.notes = notes;
    this.mode = mode;
    this.criticality = criticality;
    this.effects = [];
  }

  find(taskId) {
    return this.board.find((t) => t.id === taskId);
  }

  run(name, args = {}) {
    const me = this.pairId;
    const need = (k) => {
      const v = args[k];
      if (v === undefined || v === null || String(v).trim() === '') throw new Error(`Missing "${k}".`);
      return String(v).trim();
    };
    const task = () => {
      const t = this.find(need('task_id'));
      if (!t) throw new Error(`No task with id "${args.task_id}". Use team.search_memory or read the board first.`);
      return t;
    };

    switch (name) {
      case 'team.create_task': {
        const owner = args.owner && this.pairIds.includes(String(args.owner).toUpperCase()) ? String(args.owner).toUpperCase() : null;
        const title = need('title');
        if (this.board.some((t) => t.title.toLowerCase() === title.toLowerCase())) return `A task named "${title}" already exists.`;
        const id = newId('task');
        this.board.push({ id, title, detail: args.detail ?? '', owner, status: owner ? 'doing' : 'todo', artifacts: [], log: [] });
        this.effects.push({ type: 'create_task', id, title, detail: args.detail ?? '', owner });
        return `Created task ${id} "${title}"${owner ? ` owned by ${owner}` : ''}.`;
      }
      case 'team.claim_task': {
        const t = task();
        if (t.owner && t.owner !== me) return `Task ${t.id} is already owned by ${t.owner}. Message their agent if you want to help.`;
        t.owner = me;
        t.status = 'doing';
        this.effects.push({ type: 'update_task', taskId: t.id, owner: me, status: 'doing' });
        return `You now own ${t.id} "${t.title}".`;
      }
      case 'team.update_task': {
        const t = task();
        const status = need('status');
        if (!TASK_STATUSES.includes(status)) throw new Error(`status must be one of ${TASK_STATUSES.join(', ')}`);
        t.status = status;
        this.effects.push({ type: 'update_task', taskId: t.id, status, note: args.note ?? '' });
        return `Task ${t.id} is now ${status}.`;
      }
      case 'team.submit_work': {
        const t = task();
        const content = need('content');
        if (content.length < 40) throw new Error('The deliverable is too short. Submit the actual work product.');
        const title = need('title');
        const earlier = this.effects.findIndex((e) => e.type === 'submit_work' && e.taskId === t.id);
        if (earlier >= 0) {
          this.effects[earlier] = { type: 'submit_work', taskId: t.id, title, content };
          t.artifacts[t.artifacts.length - 1] = { title, content };
          return `Replaced your earlier deliverable on ${t.id} with "${title}".`;
        }
        t.artifacts.push({ title, content });
        t.status = 'done';
        if (!t.owner) t.owner = me;
        this.effects.push({ type: 'submit_work', taskId: t.id, title, content });
        return `Submitted "${title}" to ${t.id}; the task is marked done.`;
      }
      case 'team.read_task': {
        const t = task();
        const arts = t.artifacts.map((a) => `### ${a.title}\n${a.content}`).join('\n\n') || '(no deliverables yet)';
        return `${t.title} (${t.status}, owner ${t.owner ?? 'none'})\n${t.detail}\n\n${arts}`.slice(0, 5000);
      }
      case 'team.message_agent': {
        const to = need('to').toUpperCase();
        if (!this.pairIds.includes(to) || to === me) throw new Error(`"to" must be another teammate: ${this.pairIds.filter((p) => p !== me).join(', ')}.`);
        this.effects.push({ type: 'message_agent', to, text: need('text') });
        return `Message delivered to ${to}'s agent. They will reply in the agent channel.`;
      }
      case 'team.remember': {
        const scope = args.scope === 'team' ? 'team' : 'private';
        this.effects.push({ type: 'remember', scope, memType: args.type ?? 'fact', text: need('text') });
        return `Saved to ${scope} memory.`;
      }
      case 'team.search_memory': {
        const terms = String(args.query ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
        const docs = [
          ...this.memory.map((i) => ({ ref: i.id, kind: i.type, text: i.text })),
          ...this.board.map((t) => ({ ref: t.id, kind: 'task', text: `${t.title}. ${t.detail} (${t.status}, owner ${t.owner ?? 'none'})` })),
          ...this.board.flatMap((t) => t.artifacts.map((a) => ({ ref: t.id, kind: 'deliverable', text: `${a.title}: ${a.content}` }))),
          ...this.notes.map((n) => ({ ref: n.id, kind: `private ${n.type}`, text: n.text })),
        ];
        const hits = rank(docs, terms, 6);
        return hits.length ? hits.map((h) => `- [${h.kind} ${h.ref}] ${h.text.slice(0, 300)}`).join('\n') : 'No matches.';
      }
      case 'team.ask_my_human': {
        this.effects.push({ type: 'ask_human', text: need('question') });
        return 'Question sent to your human privately. Do not wait for the answer in this turn.';
      }
      default:
        throw new Error(`Unknown tool "${name}".`);
    }
  }
}

export const isTeamWrite = (effect) => ['create_task', 'update_task', 'submit_work', 'external_action'].includes(effect.type) || (effect.type === 'remember' && effect.scope === 'team');
export const isTeamWriteTool = (name) => TEAM_WRITES.has(name);

/**
 * Policy for tools that touch outside platforms. Reads always run. Writes run
 * immediately only when the agent works alone on a low-stakes task; otherwise
 * they wait for a human (the teammate in Human + agent mode, or any present
 * teammate for consequential and high-stakes tasks).
 */
export function externalWritePolicy({ mode, criticalityRank }) {
  if (mode === 'agent' && criticalityRank <= 1) return 'run';
  if (mode === 'both') return 'draft';
  return 'signoff';
}
