import { newId, rank, TASK_STATUSES } from './memory.js';
import { readChunk, fileSummary } from './files.js';

/**
 * Built-in "team" tools. They run during an agent's reasoning loop against a
 * working copy of the session (so an agent reads its own writes), and each
 * write is recorded as an effect that the session applies afterwards in one
 * transaction. That keeps slow LLM loops outside the state lock.
 */
export const TEAM_TOOLS = [
  { name: 'team.create_task', args: '{ title: string, detail?: string, owner?: A|B|C, due?: string }', description: 'Add a task to the team board. Use it to split work; assign an owner when the split is agreed.' },
  { name: 'team.assign_task', args: '{ task_id: string, owner: A|B|C, note?: string }', description: 'Delegate a task to a teammate. The team thread is told who owns it, and their agent is asked to start.' },
  { name: 'team.list_tasks', args: '{ owner?: A|B|C, status?: todo|doing|blocked|done }', description: 'Board status: who owns what, what is blocked, what is done. Use it before giving a status update.', readOnly: true },
  { name: 'team.claim_task', args: '{ task_id: string }', description: 'Take ownership of an unassigned task for your teammate.' },
  { name: 'team.update_task', args: '{ task_id: string, status: todo|doing|blocked|done, note?: string }', description: 'Change a task status, e.g. blocked with the reason.' },
  {
    name: 'team.submit_work',
    args: '{ task_id?: string, title: string, content: string }',
    description: 'Attach a finished deliverable (the actual work product, in markdown) to a task and mark it done. Omit task_id to file it as a new task you own.',
  },
  { name: 'team.read_task', args: '{ task_id: string }', description: 'Read a task, its log, and the full text of its deliverables.', readOnly: true },
  { name: 'team.message_agent', args: '{ to: A|B|C, text: string }', description: "Send a direct message to a teammate's agent to coordinate, hand off, or share work so far." },
  { name: 'team.remember', args: '{ scope: private|team, type: fact|decision|plan|question|thought, text: string }', description: 'Save a note to your private memory or to team memory.' },
  { name: 'team.search_memory', args: '{ query: string }', description: 'Search team memory, the board, deliverables, shared files, and your private notes.', readOnly: true },
  { name: 'team.list_files', args: '{}', description: 'Files people shared in the thread or uploaded (PDFs, docs, code, CSV).', readOnly: true },
  { name: 'team.read_file', args: '{ file_id: string, offset?: number }', description: 'Read a shared file in chunks of ~6,000 characters. Read it before answering questions about it.', readOnly: true },
  { name: 'team.ask_my_human', args: '{ question: string }', description: 'Ask your own teammate a question in your private DM.' },
];

const TEAM_WRITES = new Set(['team.create_task', 'team.assign_task', 'team.claim_task', 'team.update_task', 'team.submit_work']);

/** Working copy of what one agent can see, plus the effects it has produced so far. */
export class Workspace {
  constructor({ pairId, pairIds, board, memory, notes, files = [], people = {}, mode, criticality }) {
    this.pairId = pairId;
    this.pairIds = pairIds;
    this.board = structuredClone(board);
    this.memory = memory;
    this.notes = notes;
    this.files = files;
    this.people = people;
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
        const due = args.due ? String(args.due).slice(0, 40) : null;
        this.board.push({ id, title, detail: args.detail ?? '', owner, due, status: owner ? 'doing' : 'todo', artifacts: [], log: [] });
        this.effects.push({ type: 'create_task', id, title, detail: args.detail ?? '', owner, due });
        return `Created task ${id} "${title}"${owner ? ` owned by ${owner}` : ''}${due ? `, due ${due}` : ''}.`;
      }
      case 'team.assign_task': {
        const t = task();
        const owner = need('owner').toUpperCase();
        if (!this.pairIds.includes(owner)) throw new Error(`owner must be one of ${this.pairIds.join(', ')}.`);
        if (t.owner === owner) return `${t.id} is already owned by ${owner}.`;
        t.owner = owner;
        if (t.status === 'todo') t.status = 'doing';
        this.effects.push({ type: 'assign_task', taskId: t.id, owner, note: args.note ? String(args.note).slice(0, 400) : '' });
        return `Assigned ${t.id} "${t.title}" to ${this.people[owner] ?? owner}. The team thread will say so, and their agent is asked to start.`;
      }
      case 'team.list_tasks': {
        const owner = args.owner ? String(args.owner).toUpperCase() : null;
        const rows = this.board.filter((t) => (!owner || t.owner === owner) && (!args.status || t.status === args.status));
        if (!rows.length) return 'No tasks match.';
        return rows
          .map((t) => `- [${t.id}] ${t.title} — ${t.status}, owner ${t.owner ? (this.people[t.owner] ?? t.owner) : 'nobody'}${t.due ? `, due ${t.due}` : ''}${t.artifacts.length ? `, ${t.artifacts.length} deliverable(s)` : ''}${t.log?.length ? ` · last: ${t.log.at(-1).text}` : ''}`)
          .join('\n');
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
        const content = need('content');
        if (!args.task_id) {
          const title = need('title');
          const existing = this.board.find((x) => x.title.toLowerCase() === title.toLowerCase());
          if (existing) args = { ...args, task_id: existing.id };
          else {
            const id = newId('task');
            this.board.push({ id, title, detail: '', owner: me, due: null, status: 'doing', artifacts: [], log: [] });
            this.effects.push({ type: 'create_task', id, title, detail: '', owner: me, due: null });
            args = { ...args, task_id: id };
          }
        }
        const t = task();
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
          ...this.files.flatMap((f) => chunksOf(f.text).map((part, i) => ({ ref: `${f.id}@${i * 1500}`, kind: `file ${f.name}`, text: part }))),
        ];
        const hits = rank(docs, terms, 6);
        return hits.length ? hits.map((h) => `- [${h.kind} ${h.ref}] ${h.text.slice(0, 300)}`).join('\n') : 'No matches.';
      }
      case 'team.list_files': {
        return this.files.length ? this.files.map(fileSummary).join('\n') : 'No files have been shared yet.';
      }
      case 'team.read_file': {
        const id = need('file_id');
        const f = this.files.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
        if (!f) throw new Error(`No file "${id}". Use team.list_files.`);
        return readChunk(f, args.offset);
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

function chunksOf(text = '', size = 1500) {
  const out = [];
  for (let i = 0; i < text.length && out.length < 40; i += size) out.push(text.slice(i, i + size));
  return out;
}

export const isTeamWrite = (effect) => ['create_task', 'assign_task', 'update_task', 'submit_work', 'external_action'].includes(effect.type) || (effect.type === 'remember' && effect.scope === 'team');
export const isTeamWriteTool = (name) => TEAM_WRITES.has(name);

/**
 * Policy for tools that touch outside platforms. Reads always run. Writes run
 * immediately only when the agent works alone on a low-stakes task; otherwise
 * they wait for a human (the teammate in Human + agent mode, or any present
 * teammate for consequential and high-stakes tasks).
 */
export function externalWritePolicy({ mode, criticalityRank, tool = '' }) {
  // Posting to a code host is public to the whole repo, so it always waits for a person.
  const alwaysHuman = tool.startsWith('github.');
  if (mode === 'agent' && criticalityRank <= 1 && !alwaysHuman) return 'run';
  if (mode === 'both') return 'draft';
  return 'signoff';
}
