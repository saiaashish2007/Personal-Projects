import { complete, parseJson, provider } from './llm.js';

export const ROLES = {
  facilitator: {
    label: 'Facilitator',
    brief:
      'Keep the group moving: summarize where things stand, invite pairs who have contributed least, and propose the next concrete step.',
  },
  analyst: {
    label: 'Analyst',
    brief:
      'Break the task into sub-problems, bring evidence and trade-offs, and flag information the group is missing.',
  },
  critic: {
    label: 'Critic',
    brief:
      "Act as a constructive devil's advocate: challenge premature consensus and other agents' suggestions, and state the strongest counter-argument.",
  },
};

export const CRITICALITY = {
  ephemeral: { label: 'Ephemeral', rank: 0, rule: 'Low stakes. Be brief and fast.' },
  operational: { label: 'Operational', rank: 1, rule: 'Moderate stakes. Keep suggestions concrete and checkable.' },
  consequential: {
    label: 'Consequential',
    rank: 2,
    rule: 'Hard to undo or affects people outside the team. State assumptions and uncertainty. Decisions need a human sign-off.',
  },
  high_stakes: {
    label: 'High stakes',
    rank: 3,
    rule: 'Irreversible or major legal/financial/safety impact. Never present a decision as final; surface risks and what a human must verify.',
  },
};

export const SPEAK_THRESHOLD = 0.55;

export class Agent {
  constructor({ pairId, name, role }) {
    this.pairId = pairId;
    this.name = name;
    this.role = role;
  }

  /**
   * Decides whether to contribute and what to say. Mirrors the "inner thoughts"
   * idea: form a candidate thought, rate the motivation to voice it, and only
   * speak above a threshold.
   */
  async think(ctx) {
    if (provider !== 'offline') {
      try {
        const out = parseJson(await complete({ system: this.systemPrompt(ctx), user: this.userPrompt(ctx) }));
        if (out) return normalize(out);
      } catch (err) {
        console.error(`[agent ${this.name}] LLM call failed, using offline fallback:`, err.message);
      }
    }
    return offlineThink(this, ctx);
  }

  systemPrompt(ctx) {
    const crit = CRITICALITY[ctx.task?.criticality] ?? CRITICALITY.operational;
    const modeLine =
      ctx.mode === 'both'
        ? 'Your human partner is present. Anything you say to the group is a DRAFT that your partner will approve, edit, or reject.'
        : 'Your human partner is not participating in this task. You represent your pair alone and your messages go straight to the group.';
    return [
      `You are ${this.name}, the AI agent of Pair ${this.pairId} in a team of three human-AI pairs.`,
      `Your role: ${ROLES[this.role]?.brief ?? this.role}`,
      modeLine,
      `Task criticality: ${crit.label}. ${crit.rule}`,
      'Rules:',
      '- Use your pair\'s PRIVATE memory to reason, but do not reveal private notes verbatim unless they are marked shared.',
      '- If the latest request is underspecified, ask ONE targeted clarifying question instead of guessing.',
      '- Do not repeat what someone just said. If you have nothing new, set speak to false.',
      '- Keep messages under 90 words. Put your reasoning in "rationale" so humans can check it.',
      ctx.teaching ? '- Teaching mode is on: write the rationale as a short explanation your partner can learn from.' : '',
      'Reply with JSON only:',
      '{"motivation":0-1,"speak":true|false,"message":"...","rationale":"...","clarifying":true|false,',
      ' "memory":[{"scope":"global"|"pair","type":"decision"|"plan"|"fact"|"question","text":"..."}]}',
    ]
      .filter(Boolean)
      .join('\n');
  }

  userPrompt(ctx) {
    const thread = ctx.groupThread.map((m) => `${m.authorLabel}: ${m.text}`).join('\n') || '(no messages yet)';
    const pairThread = ctx.pairThread.map((m) => `${m.authorLabel}: ${m.text}`).join('\n') || '(none)';
    return [
      `TASK: ${ctx.task?.title ?? '(none)'}\n${ctx.task?.description ?? ''}`,
      ctx.task?.subtasks?.length ? `SUBTASKS:\n${ctx.task.subtasks.map((s) => `- ${s}`).join('\n')}` : '',
      `TEAM: ${ctx.teamSummary}`,
      `GLOBAL MEMORY (shared by all three agents):\n${ctx.globalMemory}`,
      `YOUR PAIR'S PRIVATE MEMORY:\n${ctx.pairMemory}`,
      `RECENT GROUP THREAD:\n${thread}`,
      `RECENT PRIVATE THREAD WITH YOUR PARTNER:\n${pairThread}`,
      `TRIGGER: ${ctx.trigger.kind}${ctx.trigger.text ? ` — "${ctx.trigger.text}"` : ''}`,
      ctx.trigger.feedback ? `PARTNER FEEDBACK ON YOUR LAST DRAFT: ${ctx.trigger.feedback}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

function normalize(out) {
  return {
    motivation: clamp(Number(out.motivation ?? 0)),
    speak: Boolean(out.speak),
    message: String(out.message ?? '').trim(),
    rationale: String(out.rationale ?? '').trim(),
    clarifying: Boolean(out.clarifying),
    memory: Array.isArray(out.memory) ? out.memory.filter((m) => m && m.text) : [],
  };
}

const clamp = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const snippet = (t, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Deterministic stand-in used when no API key is configured, so the interface and
// the memory/turn-taking machinery can be demoed and tested offline.
function offlineThink(agent, ctx) {
  const t = ctx.trigger;
  const text = (t.text ?? '').toLowerCase();
  const nameHit = text.includes(agent.name.toLowerCase()) || text.includes(`pair ${agent.pairId.toLowerCase()}`);
  const everyone = /\b(everyone|all of you|agents|team)\b/.test(text);

  if (t.kind === 'explain') {
    return result(0.9, true, `Here's why I suggested that: ${ctx.lastDraft?.rationale || 'it follows from the task and what the group has said so far.'}`, '', false, []);
  }
  if (t.kind === 'revise') {
    const base = ctx.lastDraft?.text ?? '';
    return result(0.9, true, `Revised based on your note ("${snippet(t.feedback ?? '', 60)}"): ${base}`, 'Applied partner feedback to the previous draft.', false, []);
  }
  if (t.kind === 'private') {
    const note = /remember|note|keep in mind/.test(text);
    return result(
      0.9,
      true,
      note ? "Noted. I'll keep that in our private memory." : `Got it. I'll factor that into what I suggest to the group on "${snippet(ctx.task?.title ?? 'this task', 40)}".`,
      'Private exchange with partner.',
      false,
      note ? [{ scope: 'pair', type: 'fact', text: t.text }] : []
    );
  }
  if (t.kind === 'friction') {
    return result(0.95, true, 'It sounds like I missed something. Can you tell me the one detail I got wrong, or paste the information I should be using?', 'Friction flagged: ask for evidence rather than guess again.', true, []);
  }

  let m = 0.15 + (nameHit ? 0.6 : 0) + (everyone ? 0.3 : 0);
  if (ctx.recentlySpoke) m -= 0.35;
  if (t.fromAgent) m -= 0.15;

  const words = text.split(/\s+/).filter(Boolean).length;
  let msg = '';
  let rationale = '';
  let clarifying = false;
  const memory = [];

  if (agent.role === 'facilitator') {
    if (ctx.sinceFacilitator >= 4 || /\b(next|summar|stuck|where are we)\b/.test(text) || t.kind === 'round') m += 0.45;
    const quiet = ctx.quietPair ? ` Pair ${ctx.quietPair}, what's your take?` : '';
    const next = ctx.task?.subtasks?.find((s) => !ctx.plannedSteps.includes(s)) ?? 'agree on a decision criterion';
    msg = `Quick recap: ${ctx.recap}.${quiet} Suggested next step: ${next}.`;
    rationale = 'Facilitator: summarize, balance participation, move to the next step.';
    memory.push({ scope: 'global', type: 'plan', text: `Next: ${next}` });
  } else if (agent.role === 'analyst') {
    if (/\?|\b(how|why|option|data|compare|trade)/.test(text) || t.kind === 'round') m += 0.45;
    if (words > 0 && words < 6 && !ctx.task?.subtasks?.length) {
      clarifying = true;
      m += 0.2;
      msg = `Before I dig in: what would a good outcome for "${snippet(ctx.task?.title ?? 'this', 40)}" look like, and are there constraints (deadline, budget, audience) I should respect?`;
      rationale = 'Request looks underspecified; a clarifying question beats a guess.';
      memory.push({ scope: 'global', type: 'question', text: 'What are the success criteria and constraints?' });
    } else {
      const facts = ctx.privateFacts.slice(0, 2).map((f) => f.replace(/[.\s]+$/, ''));
      msg = facts.length
        ? `From what our pair knows: ${facts.join('; ')}. Weighing that against the options on the table, I'd compare them on cost, risk, and time to deliver.`
        : 'I would split this into: define criteria, list the options, then score each option against the criteria.';
      rationale = facts.length ? 'Analyst: surfacing pair-private evidence relevant to the decision.' : 'Analyst: decomposing the task.';
      if (facts.length) memory.push({ scope: 'global', type: 'fact', text: `Pair ${agent.pairId} reports: ${facts.join('; ')}` });
    }
  } else if (agent.role === 'critic') {
    if (/\b(agree|sounds good|let'?s go|decide|final|lock|consensus|settled)\b/.test(text)) m += 0.55;
    if (t.kind === 'round') m += 0.3;
    msg = `Before we lock that in: what is the strongest case against "${snippet(t.text ?? 'the current plan', 60)}"? If we're wrong, what would we have missed?`;
    rationale = "Critic: challenge consensus forming quickly (devil's advocate).";
    memory.push({ scope: 'global', type: 'question', text: `Counter-argument to check: ${snippet(t.text ?? 'current plan', 80)}` });
  }

  return result(clamp(m), m >= SPEAK_THRESHOLD, msg, rationale, clarifying, memory);
}

const result = (motivation, speak, message, rationale, clarifying, memory) => ({
  motivation,
  speak,
  message,
  rationale,
  clarifying,
  memory,
});
