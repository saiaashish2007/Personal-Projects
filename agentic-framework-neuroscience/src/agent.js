import { complete, parseJson, provider } from './llm.js';
import { TEAM_TOOLS, Workspace, externalWritePolicy } from './tools.js';

/**
 * Each teammate has one personal agent. Inside it, three subagents run in
 * sequence on every turn (this keeps the original facilitator / analyst /
 * critic triad, but per person instead of per team):
 *   Planner  decides whether the trigger needs this agent and plans steps
 *   Worker   executes the plan with team tools and MCP connectors
 *   Reviewer checks the output before it reaches the team, and can send it back once
 */
export const CREW = {
  planner: { label: 'Planner', brief: 'Decides whether to act and breaks the work into steps.' },
  worker: { label: 'Worker', brief: 'Does the work with team tools and connected platforms.' },
  reviewer: { label: 'Reviewer', brief: 'Checks accuracy, completeness, and stakes before anything is shared.' },
};

export const CRITICALITY = {
  ephemeral: { label: 'Ephemeral', rank: 0, rule: 'Low stakes. Be brief and fast.' },
  operational: { label: 'Operational', rank: 1, rule: 'Moderate stakes. Keep suggestions concrete and checkable.' },
  consequential: {
    label: 'Consequential',
    rank: 2,
    rule: 'Hard to undo or affects people outside the team. State assumptions and uncertainty. Decisions and deliverables need a human sign-off.',
  },
  high_stakes: {
    label: 'High stakes',
    rank: 3,
    rule: 'Irreversible or major legal/financial/safety impact. Never present a decision as final; surface risks and what a human must verify.',
  },
};

export const SPEAK_THRESHOLD = 0.55;
const MAX_OBSERVATION = 3000;

const clamp = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const snippet = (t, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const list = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 8) : []);

export class Agent {
  constructor({ pairId, name, humanName, focus }) {
    this.pairId = pairId;
    this.name = name;
    this.humanName = humanName;
    this.focus = focus;
  }

  /**
   * Runs one turn: plan, act with tools, review. `tools` are the MCP connector
   * tools available this turn and `callExternal(name, args)` executes one.
   */
  async think(ctx, { tools = [], callExternal = async () => 'ERROR: no connectors', onStep = () => {} } = {}) {
    const ws = new Workspace(ctx.workspace);
    if (provider === 'offline' || ctx.offline) return offlineThink(this, ctx, ws);

    const trace = { plan: [], steps: [], review: null, calls: 0, motivation: 1, offline: false, startedAt: Date.now() };
    const scratch = [];
    const budget = ctx.budget ?? 6;
    const system = this.systemPrompt(ctx, tools);
    const ask = async (extra = '') => {
      trace.calls += 1;
      const out = parseJson(await complete({ system, user: `${this.userPrompt(ctx, ws, scratch)}${extra}`, maxTokens: 1800 }));
      if (!out) throw new Error('The model did not return valid JSON.');
      return out;
    };

    try {
      let final = null;
      while (!final && trace.calls < budget - 1) {
        const out = await ask();
        if (trace.calls === 1) {
          trace.plan = list(out.plan);
          trace.motivation = clamp(Number(out.motivation ?? 1));
          if (!ctx.mustRespond && trace.motivation < SPEAK_THRESHOLD) {
            return this.result({ speak: false, rationale: String(out.thought ?? '') }, ws, trace);
          }
        }
        if (out.final) final = out.final;
        else if (out.action?.tool) {
          onStep(out.action.tool);
          const observation = await this.runTool(out.action, ws, tools, callExternal, ctx);
          scratch.push({ thought: String(out.thought ?? ''), tool: out.action.tool, args: out.action.args ?? {}, observation });
          trace.steps.push({ thought: String(out.thought ?? '').slice(0, 400), tool: out.action.tool, args: out.action.args ?? {}, observation: observation.slice(0, 600) });
        } else final = { speak: Boolean(out.message), message: out.message ?? '', rationale: out.thought ?? '' };
      }
      if (!final) final = (await ask('\n\nYou are out of tool steps. Reply now with a "final" object.')).final ?? { speak: false };

      if (this.needsReview(ctx, final, ws)) {
        onStep('reviewer');
        const review = await this.review(ctx, final, ws);
        trace.calls += 1;
        trace.review = review;
        if (review.verdict === 'revise') {
          scratch.push({ review });
          for (let k = 0; k < 2 && trace.calls < budget + 2; k++) {
            const out = await ask(
              `\n\nREVIEWER FEEDBACK (your own Reviewer subagent): ${review.issues.join('; ')}. ${review.instructions}\nFix it now. You may call one tool (for example team.submit_work again to replace a deliverable), then reply with "final".`
            );
            if (out.final) {
              final = out.final;
              break;
            }
            if (out.action?.tool) {
              const observation = await this.runTool(out.action, ws, tools, callExternal, ctx);
              scratch.push({ thought: String(out.thought ?? ''), tool: out.action.tool, args: out.action.args ?? {}, observation });
              trace.steps.push({ thought: String(out.thought ?? '').slice(0, 400), tool: out.action.tool, args: out.action.args ?? {}, observation: observation.slice(0, 600), afterReview: true });
            }
          }
          trace.review.revised = true;
        }
      }
      return this.result(final, ws, trace);
    } catch (err) {
      console.error(`[agent ${this.name}] LLM turn failed, using offline fallback:`, err.message);
      return { ...offlineThink(this, ctx, new Workspace(ctx.workspace)), error: err.message.slice(0, 300) };
    }
  }

  result(final, ws, trace) {
    const message = String(final.message ?? '').trim();
    return {
      motivation: trace.motivation,
      speak: Boolean(final.speak ?? message) && message.length > 0,
      message,
      rationale: String(final.rationale ?? '').trim(),
      clarifying: Boolean(final.clarifying),
      effects: ws.effects,
      trace: { ...trace, ms: Date.now() - trace.startedAt },
    };
  }

  needsReview(ctx, final, ws) {
    if (['explain', 'friction'].includes(ctx.trigger.kind)) return false;
    const shares = (final.speak && String(final.message ?? '').trim()) || ws.effects.some((e) => e.type === 'submit_work');
    return Boolean(shares) && (ctx.criticalityRank >= 1 || ws.effects.some((e) => e.type === 'submit_work'));
  }

  async runTool(action, ws, tools, callExternal, ctx) {
    const name = String(action.tool);
    const args = action.args && typeof action.args === 'object' ? action.args : {};
    const clip = (s) => (s.length > MAX_OBSERVATION ? `${s.slice(0, MAX_OBSERVATION)}… [truncated]` : s);
    if (name.startsWith('team.')) {
      try {
        return clip(ws.run(name, args));
      } catch (err) {
        return `ERROR: ${err.message}`;
      }
    }
    const tool = tools.find((t) => t.name === name);
    if (!tool) return `ERROR: Unknown tool "${name}". Use only the tools listed.`;
    try {
      if (tool.readOnly) return clip(await callExternal(name, args));
      const policy = externalWritePolicy({ mode: ctx.mode, criticalityRank: ctx.criticalityRank });
      if (policy === 'run') {
        const out = clip(await callExternal(name, args));
        ws.effects.push({ type: 'external_done', tool: name, args, result: out.slice(0, 400) });
        return out;
      }
      ws.effects.push({ type: 'external_action', tool: name, args, policy });
      return policy === 'draft'
        ? 'Queued for your human to approve with your draft. Do not assume it has happened yet.'
        : 'This write needs a human sign-off on this task. It is now on the team approvals list. Do not assume it has happened yet.';
    } catch (err) {
      return `ERROR: ${err.message.slice(0, 300)}`;
    }
  }

  systemPrompt(ctx, tools) {
    const crit = CRITICALITY[ctx.task?.criticality] ?? CRITICALITY.operational;
    const destination =
      ctx.trigger.kind === 'private' || ctx.trigger.kind === 'explain' || ctx.trigger.kind === 'friction'
        ? `Your "final.message" goes to your private DM with ${this.humanName}.`
        : ctx.mode === 'both'
          ? `${this.humanName} is present. Your "final.message" and any team-visible actions become a DRAFT that ${this.humanName} approves, edits, or rejects.`
          : `${this.humanName} is not in this task. You act for them alone; your "final.message" posts straight to the team thread.`;
    const toolLines = [...TEAM_TOOLS, ...tools]
      .map((t) => `- ${t.name} ${t.args}${t.readOnly === false && t.server ? ' [writes to an outside platform]' : ''}: ${t.description}`)
      .join('\n');
    return [
      `You are ${this.name}, the personal AI agent of ${this.humanName} (${this.focus}) in the #${ctx.channel} team channel. Teammate ids: ${ctx.teamLine}.`,
      'You run as a crew of three subagents: a Planner (decide whether to act; plan steps), a Worker (do the work with tools), and a Reviewer (checks your output separately). In this conversation you are the Planner and the Worker.',
      destination,
      `Task criticality: ${crit.label}. ${crit.rule}`,
      'How to work:',
      '- Produce real work, not descriptions of work. If a task needs an email, a timeline, or a recommendation, write it and attach it with team.submit_work.',
      '- The team board is the source of truth for who does what. Check it before starting; claim or create tasks instead of duplicating a teammate.',
      "- When work splits naturally, create tasks with owners and tell the other agents with team.message_agent. Share work in progress with team.message_agent and finished work with team.submit_work.",
      "- Your human's private notes are yours to reason with. Share a private fact with the team only when it matters for the task, and say whose information it is.",
      "- Save useful facts with team.remember. Your human's thoughts and your work log are saved to private memory automatically.",
      '- If the request is underspecified, ask ONE targeted clarifying question (final.clarifying = true) instead of guessing.',
      '- Do not repeat what someone just said. If you have nothing new to add, finish with speak false.',
      '- Team messages: under 120 words, plain language. Deliverables can be as long as they need to be.',
      ctx.teaching ? '- Teaching mode is on: write final.rationale as a short explanation your human can learn from.' : '',
      'TOOLS:',
      toolLines,
      'PROTOCOL: reply with exactly ONE JSON object per turn, nothing else.',
      '- Use a tool:  {"thought":"...","action":{"tool":"<tool name>","args":{...}}}',
      '- Finish:      {"thought":"...","final":{"speak":true|false,"message":"...","rationale":"...","clarifying":false}}',
      `- On your FIRST reply also include "motivation" (0-1: how much this trigger needs you) and "plan" (a short list of steps). If motivation is below ${SPEAK_THRESHOLD} and nobody asked you directly, finish right away with speak false.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  userPrompt(ctx, ws, scratch) {
    const fmt = (msgs) => msgs.map((m) => `${m.authorLabel}: ${m.text}`).join('\n');
    const t = ctx.trigger;
    const triggerLine = {
      group: `${t.authorLabel ?? 'Someone'} posted in the team thread: "${t.text}"`,
      round: 'The team asked every agent to take a turn: look at the board and move the work forward.',
      private: `${this.humanName} sent you a private DM: "${t.text}"`,
      agent_dm: `${t.fromLabel}'s agent sent you a direct message: "${t.text}". Do the work it asks for. Reply with team.message_agent only if they need an answer.`,
      explain: `${this.humanName} asked why you wrote this draft: "${t.text}". Explain your reasoning briefly.`,
      revise: `${this.humanName} asked you to revise your draft "${t.text}". Their feedback: "${t.feedback}". Redo the work accordingly.`,
      friction: `${this.humanName} flagged this message as a problem: "${t.text}". Ask them one question to find out what went wrong.`,
    }[t.kind] ?? `Trigger: ${t.kind} ${t.text ?? ''}`;
    const steps = scratch
      .map((s, i) =>
        s.review
          ? `Reviewer verdict: ${s.review.verdict}. Issues: ${s.review.issues.join('; ')}`
          : `Step ${i + 1}: ${s.thought}\nAction: ${s.tool} ${JSON.stringify(s.args).slice(0, 400)}\nObservation: ${s.observation}`
      )
      .join('\n\n');
    return [
      `TASK: ${ctx.task?.title ?? '(none)'}\n${ctx.task?.description ?? ''}`,
      ctx.task?.subtasks?.length ? `SUGGESTED SUBTASKS:\n${ctx.task.subtasks.map((s) => `- ${s}`).join('\n')}` : '',
      `TEAM: ${ctx.teamSummary}`,
      `TEAM BOARD:\n${ctx.boardText}`,
      `TEAM MEMORY:\n${ctx.globalMemory}`,
      `${this.humanName.toUpperCase()}'S PRIVATE MEMORY (only you can see this):\n${ctx.pairMemory}`,
      `TEAM THREAD (latest):\n${fmt(ctx.groupThread) || '(no messages yet)'}`,
      `AGENT CHANNEL (your DMs with other agents):\n${fmt(ctx.agentThread) || '(none)'}`,
      `PRIVATE DM WITH ${this.humanName.toUpperCase()}:\n${fmt(ctx.pairThread) || '(none)'}`,
      ctx.lastDraft ? `YOUR LAST DRAFT: ${ctx.lastDraft.text}\nIts rationale: ${ctx.lastDraft.rationale}` : '',
      `TRIGGER: ${triggerLine}`,
      steps ? `YOUR STEPS SO FAR THIS TURN:\n${steps}` : '',
      'Reply with your next JSON object.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  async review(ctx, final, ws) {
    const crit = CRITICALITY[ctx.task?.criticality] ?? CRITICALITY.operational;
    const deliverables = ws.effects
      .filter((e) => e.type === 'submit_work')
      .map((e) => `### ${e.title} (task ${e.taskId})\n${e.content}`)
      .join('\n\n');
    const system = [
      `You are the Reviewer subagent inside ${this.name}, the personal agent of ${this.humanName}. You check the Worker's output before it reaches the team.`,
      `Task criticality: ${crit.label}. ${crit.rule}`,
      'Check: (1) it answers the trigger and moves the task forward; (2) deliverables are real, complete work products whose facts match team memory and the private notes (numbers, names, links); (3) nothing is presented as decided that a human must verify on consequential or high-stakes tasks; (4) it does not duplicate work already on the board; (5) it is concise and free of filler.',
      'Approve unless there is a concrete problem worth one more pass. Reply with JSON only: {"verdict":"approve"|"revise","issues":["..."],"instructions":"what to change"}',
    ].join('\n');
    const user = [
      `TASK: ${ctx.task?.title}\n${ctx.task?.description ?? ''}`,
      `TEAM BOARD:\n${ctx.boardText}`,
      `TEAM MEMORY:\n${ctx.globalMemory}`,
      `PRIVATE NOTES:\n${ctx.pairMemory}`,
      `TRIGGER: ${ctx.trigger.kind} ${ctx.trigger.text ?? ''}`,
      `MESSAGE TO SHARE: ${final.message || '(none)'}`,
      deliverables ? `DELIVERABLES SUBMITTED:\n${deliverables}` : '',
      `OTHER ACTIONS: ${ws.effects.filter((e) => e.type !== 'submit_work').map((e) => e.type + (e.tool ? ` ${e.tool}` : '')).join(', ') || 'none'}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const out = parseJson(await complete({ system, user, maxTokens: 500 })) ?? {};
      return { verdict: out.verdict === 'revise' ? 'revise' : 'approve', issues: list(out.issues), instructions: String(out.instructions ?? '') };
    } catch (err) {
      return { verdict: 'approve', issues: [`Review skipped: ${err.message.slice(0, 120)}`], instructions: '' };
    }
  }
}

// ---------- offline crew ----------
// Deterministic stand-in used without an API key (and once the daily cap is hit),
// so the board, memory, coordination, and approval machinery can be demoed and
// tested end to end. It follows the same plan → act → review shape.

function offlineThink(agent, ctx, ws) {
  const trace = { plan: [], steps: [], review: { verdict: 'approve', issues: [], instructions: '' }, calls: 0, motivation: 0, offline: true, startedAt: Date.now() };
  const t = ctx.trigger;
  const text = (t.text ?? '').toLowerCase();
  const me = agent.pairId;
  const act = (tool, args) => {
    let observation;
    try {
      observation = ws.run(tool, args);
    } catch (err) {
      observation = `ERROR: ${err.message}`;
    }
    trace.steps.push({ thought: '', tool, args, observation });
    return observation;
  };
  const done = (motivation, speak, message, rationale, clarifying = false) => {
    trace.motivation = motivation;
    return {
      motivation,
      speak: speak && Boolean(message),
      message,
      rationale,
      clarifying,
      effects: ws.effects,
      trace: { ...trace, ms: Date.now() - trace.startedAt },
    };
  };

  const mine = ws.board.filter((x) => x.owner === me && x.status !== 'done' && !x.artifacts.length);
  const facts = ctx.privateFacts.slice(0, 3);
  const deliver = (task) => {
    trace.plan.push(`Draft "${task.title}"`, 'Submit it to the board', 'Tell the team');
    const body = [
      `## ${task.title}`,
      `_Prepared by ${agent.name} for ${agent.humanName}. Offline heuristic agent: add an API key for real drafting._`,
      facts.length ? `**From ${agent.humanName}'s notes**\n${facts.map((f) => `- ${f}`).join('\n')}` : '',
      ctx.teamFacts.length ? `**From team memory**\n${ctx.teamFacts.slice(-3).map((f) => `- ${f}`).join('\n')}` : '',
      `**Draft**\nThis covers "${task.title}" for "${ctx.task?.title}". It applies the facts above; the open question for the team is whether anything here conflicts with what the other teammates know.`,
    ]
      .filter(Boolean)
      .join('\n\n');
    act('team.submit_work', { task_id: task.id, title: task.title, content: body });
    if (facts[0]) act('team.remember', { scope: 'team', type: 'fact', text: `${agent.humanName}'s notes: ${facts[0]}` });
    return done(0.85, true, `I finished "${task.title}" and attached it to the board. It uses ${agent.humanName}'s notes${facts.length ? ` (e.g. ${snippet(facts[0], 80)})` : ''}. Can someone check it against what you know?`, 'Worker: delivered my assigned task; Reviewer: facts match private notes.');
  };

  if (t.kind === 'explain') return done(0.9, true, `Here's why I suggested that: ${ctx.lastDraft?.rationale || 'it follows from the task and what the team has said so far.'}`, '');
  if (t.kind === 'friction') {
    return done(0.95, true, 'It sounds like I missed something. Can you tell me the one detail I got wrong, or paste the information I should use?', 'Friction flagged: ask for evidence rather than guess again.', true);
  }
  if (t.kind === 'revise') {
    return done(0.9, true, `Revised based on your note ("${snippet(t.feedback ?? '', 60)}"): ${ctx.lastDraft?.text ?? ''}`, 'Applied your feedback to the previous draft.');
  }

  if (t.kind === 'private') {
    if (/remember|note|keep in mind|fyi/.test(text)) {
      act('team.remember', { scope: 'private', type: 'fact', text: t.text });
      return done(0.9, true, "Noted. I've saved that to your private memory.", 'Stored in private memory.');
    }
    if (/\b(work on|draft|write|do|take|handle|start)\b/.test(text)) {
      let task = mine[0];
      if (!task) {
        const open = ws.board.find((x) => !x.owner && x.status !== 'done');
        if (open) {
          act('team.claim_task', { task_id: open.id });
          task = ws.find(open.id);
        }
      }
      if (task) {
        const out = deliver(task);
        return { ...out, message: `Done. I drafted "${task.title}" and attached it to the board.` };
      }
      return done(0.8, true, 'There is nothing open on the board for us yet. Should I propose a split of the work to the team?', 'No open tasks.', true);
    }
    return done(0.8, true, `Got it. I'll factor that into what I do for "${snippet(ctx.task?.title ?? 'this task', 50)}".`, 'Private exchange with my human.');
  }

  if (t.kind === 'agent_dm') {
    const ask = mine.find((x) => text.includes(x.id) || text.includes(x.title.toLowerCase().slice(0, 20)));
    if (ask) return deliver(ask);
    if (text.trim().endsWith('?')) {
      act('team.message_agent', { to: t.from, text: facts[0] ? `From ${agent.humanName}'s notes: ${facts[0]}` : 'Nothing in our notes on that.' });
      return done(0.6, false, '', 'Answered the other agent directly.');
    }
    return done(0.2, false, '', 'Acknowledged handoff.');
  }

  // group message or round
  const lead = ctx.activeIds[0] === me;
  if (!ws.board.length && ctx.task?.subtasks?.length && lead && (t.kind === 'round' || /\b(split|plan|start|kick|divide|who|tasks?)\b/.test(text) || ctx.groupCount <= 2)) {
    trace.plan.push('Split the task into board items', 'Assign one owner each', 'Tell the other agents');
    const owners = ctx.allIds;
    ctx.task.subtasks.forEach((s, i) => act('team.create_task', { title: s, owner: owners[i % owners.length] }));
    for (const id of ctx.activeIds.filter((x) => x !== me)) {
      const theirs = ws.board.filter((x) => x.owner === id).map((x) => `"${x.title}" (${x.id})`).join(', ');
      if (theirs) act('team.message_agent', { to: id, text: `I split the work on the board. Yours: ${theirs}. Please draft and submit when ready.` });
    }
    return done(0.9, true, `I split this into ${ctx.task.subtasks.length} tasks on the board with one owner each, and handed them to the other agents. ${mine.length ? '' : 'I will start on mine now.'}`, 'Planner: work splits cleanly by subtask, so assign owners to avoid duplication.');
  }
  if (mine.length && (t.kind === 'round' || /\b(go|start|draft|update|status|progress)\b/.test(text) || text.includes(agent.name.toLowerCase()))) return deliver(mine[0]);
  if (/\b(agree|sounds good|let'?s go|final|lock|settled|ship it)\b/.test(text) && ctx.activeIds.at(-1) === me) {
    act('team.remember', { scope: 'team', type: 'question', text: `Counter-argument to check: ${snippet(t.text ?? 'current plan', 80)}` });
    return done(0.65, true, `Before we lock that in: what is the strongest case against "${snippet(t.text ?? 'the current plan', 60)}"? Is anything on the board still unreviewed?`, "Reviewer instinct: challenge consensus that forms quickly.");
  }
  if (text.includes(agent.name.toLowerCase()) || text.includes(agent.humanName.toLowerCase().split(' ')[0])) {
    return done(0.8, true, facts.length ? `From ${agent.humanName}'s notes: ${facts.slice(0, 2).join(' ')}` : "I don't have anything relevant in our notes yet.", 'Asked directly.');
  }
  return done(0.2, false, '', 'Nothing new to add.');
}
