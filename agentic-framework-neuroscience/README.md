# Agentic Framework: Three Human–AI Pairs (Triad)

A research framework and live web app for studying how **three human–AI pairs** work together on one task. There are three AI agents and three human participants. The agents share a **global memory**, and each pair also has its own **private memory**. For every task, each pair chooses who joins: **Human only**, **Agent only**, or **Human + agent**.

The project has three parts:

1. **Background.** The paper *Human–AI Collaboration at Scale: Task Criticality, Agency, and Friction across 250,000 Conversations* (Shao, Zhao, Padmakumar, Wang & Yang, Stanford, 2026). Both the paper and my presentation on it are in [`docs/`](docs/).
2. **Literature review.** Small-group behavior in human–AI and agent teams, from CHI, CSCW, UIST, and AAAI, 2022–2026: [`docs/LITERATURE_REVIEW.md`](docs/LITERATURE_REVIEW.md).
3. **The framework.** A runnable Node.js server and browser interface, described below.

---

## Contents

- [Quick start](#quick-start)
- [Background: what the paper found](#background-what-the-paper-found)
- [What the literature adds](#what-the-literature-adds)
- [System design](#system-design)
  - [Actors and roles](#actors-and-roles)
  - [Participation modes](#participation-modes)
  - [Turn-taking: how agents decide to speak](#turn-taking-how-agents-decide-to-speak)
  - [Drafts and engagement modes](#drafts-and-engagement-modes)
  - [Memory: global and per-pair](#memory-global-and-per-pair)
  - [Criticality and sign-off](#criticality-and-sign-off)
  - [Friction and recovery](#friction-and-recovery)
  - [Teaching mode](#teaching-mode)
  - [Analytics and agency estimate](#analytics-and-agency-estimate)
- [Interface walkthrough](#interface-walkthrough)
- [Task presets](#task-presets)
- [Running a study session](#running-a-study-session)
- [Architecture](#architecture)
- [HTTP API](#http-api)
- [Data and logging](#data-and-logging)
- [Configuration](#configuration)
- [Tests](#tests)
- [Limitations and future work](#limitations-and-future-work)
- [References](#references)

---

## Quick start

Requirements: Node.js 18 or later. There are no npm dependencies to install.

```bash
cd agentic-framework-neuroscience
npm start      # serves http://127.0.0.1:8790
npm test       # runs the test suite
```

Open one browser window per participant:

| Who | URL |
|---|---|
| Pair A (human A) | http://127.0.0.1:8790/?as=A |
| Pair B (human B) | http://127.0.0.1:8790/?as=B |
| Pair C (human C) | http://127.0.0.1:8790/?as=C |
| Researcher / observer | http://127.0.0.1:8790/?as=observer |

Opening `/` with no parameter shows a chooser page.

**Real LLM agents.** Set an API key before starting:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start          # default model: claude-sonnet-4-5
OPENAI_API_KEY=sk-... npm start                 # default model: gpt-4o-mini
LLM_MODEL=<model-id> ANTHROPIC_API_KEY=... npm start
```

With no key, the agents run in **offline mode**. They follow the same protocol (motivation scores, drafts, memory writes) using rule-based heuristics and templated text. That's enough for demos, piloting, and rehearsing a study. The header badge shows which mode is active.

---

## Background: what the paper found

Shao et al. analyzed 249,834 real conversations between people and an AI assistant along several facets. The framework draws on these:

| Concept from the paper | Finding | Where it appears in this framework |
|---|---|---|
| **Task criticality** (ephemeral → operational → consequential → high-stakes) | People hand AI serious work. 44% of tasks are consequential and 12% are high-stakes. | Every task has a criticality tier. Higher tiers trigger human sign-off. |
| **Human Agency Scale (H1–H5)** | Agency is chosen by the user conversation by conversation, not fixed by the task. | Each pair picks its own mode per task. Modes map onto HAS levels. |
| **Engagement modes** (direct use, understand, adapt, critique, reject) | Users rework AI output more as stakes rise, *except* at the highest tier. There, adapting and critiquing decline while simply understanding becomes more common, which "might lead to the weakening of human oversight precisely where it matters most." | Each draft action maps to an engagement mode and is counted. Teaching mode and the Revise action encourage active engagement. |
| **Friction** (user-side, model-side, compound) | Much friction is compound. Productive friction concentrates in high-stakes, non-routine work. | Humans flag friction and attribute it to themselves, the agent, or both. |
| **Recovery strategies** | Users try to recover in 78.7% of friction conversations. Strategies differ a lot in how well they work; clarifying (disambiguate) and repair work best. | The next human message after a flag is classified as a recovery, and the UI suggests effective ones. |
| **Design implications** | Surface the AI's reasoning, support breaking tasks into parts, build user models, keep oversight where stakes are high. | "Why the agent said this", Explain why, a typed shared plan, a per-pair user model, and sign-off gating. |

The paper studies **one person with one AI**. This framework asks what happens when **three such pairs** work together.

---

## What the literature adds

The full review is in [`docs/LITERATURE_REVIEW.md`](docs/LITERATURE_REVIEW.md). It covers 12 papers from the target venues plus 2 closely related ones from other venues. Each design choice below traces back to a finding there:

| Finding | Source | Design choice |
|---|---|---|
| Groups rely on AI *more* than individuals do | Chiang et al., CHI 2023 | Provenance on everything; review before an agent speaks for a pair |
| Agents should form private thoughts and speak based on their own motivation | Liu et al., CHI 2025 (Inner Thoughts) | Each agent scores its motivation (0–1) with a speaking threshold |
| A human-in-the-loop who accepts, rejects, or modifies agent messages reduces social loafing | Doherty et al., CHI 2025 | Draft review in Human + agent mode |
| Teams need moderate conflict; a devil's-advocate agent helps | Chen et al., CHI 2025; Chiang et al., IUI 2024 | **Critic** agent that also challenges the other agents |
| LLM facilitation lifts quiet members but doesn't fix hidden-profile bias | Alsobay et al., CSCW 2026 (5-person groups + facilitator) | **Facilitator** invites the quietest pair; **Analyst** brings private facts forward; hidden-profile preset |
| Shared awareness builds team cognition in human-agent teams | Schelble et al., CSCW 2022 | Global memory is a board that every participant can see |
| Structured memory, user-chosen reuse, and human-reviewed updates | Park et al., UIST 2023; Yen & Zhao, UIST 2024; Vaithilingam et al., UIST 2025 | Typed memory items; an explicit Share step; sign-off for agent decisions |
| Private and shared memory tiers with provenance | Rezazadeh et al., ICML 2025 | Pair memory vs. global memory |
| Agents that model teammates' intentions coordinate better | Zhang et al., AAAI 2024 (ProAgent) | Agents receive a team summary (roles, modes, contribution counts) |
| Group conversations need simulation and post-hoc analysis tools | Hu et al., UIST 2025 (DialogLab) | Offline agents, "Run agent round", observer view, JSON export |

**Gaps this framework targets:**
- Asymmetric pairs, where each pair picks its own level of AI involvement within the same task.
- Two-tier memory where the *humans* control what moves from private to shared.
- Measuring the paper's facets (engagement, friction, recovery, agency) inside a group setting.

---

## System design

### Actors and roles

Six actors take part: three humans and three agents, organized as three pairs.

| Pair | Human | Agent | Default role | Speaks up when... |
|---|---|---|---|---|
| A | Human A | **Atlas** | Facilitator | Participation is lopsided or a pair has gone quiet. Atlas invites that pair, summarizes, and keeps the plan moving. |
| B | Human B | **Beacon** | Analyst | Its pair holds private facts the group hasn't seen yet, or a question is still open. Beacon brings that evidence forward. |
| C | Human C | **Cipher** | Critic | The group converges quickly ("agree", "final", "lock it in"). Cipher plays devil's advocate, including against the other agents' claims. |

Names and roles can be changed per pair from the interface (`setPairConfig`).

### Participation modes

Each pair chooses one mode per task and can switch at any time. Every switch is logged in `modeHistory`.

| Mode | Human Agency Scale | Group thread | Private channel |
|---|---|---|---|
| **Human only** | H5 | Only the human posts. The agent stays silent. | The agent still answers its own human privately. |
| **Human + agent** | H3–H4 | The human posts. The agent writes **drafts** that only its human sees and that need the human's action before they're sent. | Full private chat. |
| **Agent only** | H1–H2 | Only the agent posts, directly. The human watches. | The human can still talk to the agent. |

Rules enforced on the server:
- A human in Agent only mode cannot post to the group or sign off decisions.
- Switching to Human only discards the agent's pending drafts.

### Turn-taking: how agents decide to speak

Every new group message triggers a **group turn**:

1. All active agents (those not in Human only mode) "think" in parallel. Each one gets its role, the task, recent group messages, global memory, **only its own pair's** private memory and user model, and a summary of the team.
2. Each agent returns `{ motivation, speak, message, rationale, clarifying, memory[] }`. Motivation is a 0–1 score of how much it wants to contribute right now, following the Inner Thoughts approach.
3. Agents at or above `SPEAK_THRESHOLD = 0.55` want to speak:
   - In **Human + agent** mode, the agent writes a draft for its human. Several paired agents can draft at once.
   - In **Agent only** mode, only the **most motivated** solo agent posts. This keeps the agents from talking over each other.
4. An agent's post can trigger another round. Agent-to-agent chains are capped at `MAX_AGENT_CHAIN = 2`, so humans get the floor back.
5. Any memory items the agent proposes are written, subject to the sign-off rules below.

Messages in a pair's private channel trigger a **private turn** instead. The agent replies only to its human, and memory writes go only to pair memory.

The **Run agent round** button forces a group turn when no one has spoken, which is useful for a cold start or to rehearse with offline agents.

### Drafts and engagement modes

In Human + agent mode, each draft appears only in its pair's panel and offers five actions. Each action maps to an engagement mode from the paper and is counted in the pair's user model:

| Action | Engagement mode | Effect |
|---|---|---|
| **Send as-is** | Direct use | Posted to the group with a "sent as-is by human" tag. The draft's memory items are written as human-approved. |
| **Edit** | Adapt | The human's edited text is posted. The agent's proposed memory items are *not* written, because the human changed the content. |
| **Explain why** | Understand | The agent's rationale is posted to the private chat. The draft stays pending. |
| **Revise…** | Critique | The human gives feedback, and the agent writes a new draft that replaces the old one. |
| **Discard** | Reject | The draft is dropped. |

A new draft automatically replaces older pending ones (they are marked `superseded`), so a pair never has a stale backlog.

### Memory: global and per-pair

**Pair memory** (one per pair, private):
- *Notes:* `{ id, type, text, source, shared }`. They come from the task's private brief, from the human, or from the agent.
- *User model:* engagement counts (direct, adapt, understand, critique, reject), friction count, recovery counts (repair, reformulate, disambiguate), and the teaching flag. This goes into the agent's prompt so it adapts to its human, following the paper's "user models and personalization" recommendation.
- Privacy is enforced on the server. Each viewer only receives its own pair's data, and an agent's context includes only its own pair's notes. Tests cover both.

**Global memory** (shared by all three agents and all three humans):
- Items are `{ id, type, text, source, status, ts }`, where type is `decision`, `plan`, `fact`, or `question`.
- `source` records provenance. Examples: `Human B`, `Beacon (agent)`, or `shared from Pair B`.
- `status` is `active` or `needs_signoff`.
- The UI groups items as Decisions, Plan, Facts, and Open questions.

**Moving information between the two levels.** Private notes reach global memory **only** through an explicit human **Share** click. The note is then marked shared in pair memory and carries "shared from Pair X" provenance globally. This is the core of the hidden-profile test: does private knowledge actually reach the team?

### Criticality and sign-off

| Tier | Rank | Rule |
|---|---|---|
| Ephemeral | 0 | Agent writes go straight to global memory. |
| Operational | 1 | Agent writes go straight to global memory. |
| Consequential | 2 | Agent `decision` items that no human approved enter as **needs sign-off**. |
| High-stakes | 3 | Same as consequential, and the UI shows an oversight reminder. |

Only a pair whose human is present (Human only or Human + agent) can sign off. An Agent only pair cannot approve its own agent's decision.

### Friction and recovery

- Every group message has a ⚑ **friction** flag. The flagging human attributes it to *my request*, *the agent*, or *both*, which is recorded as user, model, or compound friction, following the paper's taxonomy.
- The flagging pair's agent then privately suggests how to get unstuck.
- The pair's **next human message** is classified as a recovery strategy:
  - **disambiguate:** it ends in a question.
  - **repair:** at least 50% new words, or at least 1.3× longer than the flagged message.
  - **reformulate:** anything else.
- After a flag, the pair panel shows a tip that pushes toward disambiguate and repair, the two strategies the paper found most productive.

### Teaching mode

A per-pair toggle. When it's on, the agent adds its reasoning to the private chat alongside every draft, and its prompt asks it to explain concepts rather than just give answers. This follows the paper's recommendation to surface AI reasoning, and it pushes back on the drop in active engagement at the highest stakes.

### Analytics and agency estimate

The observer view and the export compute, per pair:
- Group messages written by the human vs. by the agent.
- Draft outcomes: approved, edited, discarded, superseded.
- Engagement counts, friction flags, and recovery counts.
- **Estimated agency level.** Take the share of the pair's group contributions authored by the human; an edited agent draft counts as half human. Map it to HAS: below 0.1 is H1, below 0.3 H2, below 0.6 H3, below 0.9 H4, and anything higher is H5. This is a behavioral estimate, not a validated rating.

---

## Interface walkthrough

**Pair view (`/?as=A|B|C`)**
- **Header:** task title, criticality badge, LLM/offline badge, a **New task** button, and a viewer switcher.
- **Team cards:** each pair's mode, agent role, estimated agency level, and a "thinking…" indicator while an agent is deciding.
- **Group thread:** the conversation shared by all six actors. Agent messages carry an "AI agent" tag and an expandable **Why the agent said this**. Every message has a ⚑ friction flag.
- **Your pair panel** (visible only to this pair):
  - A mode selector (Human only, Agent only, Human + agent) and the teaching toggle.
  - Context tips: a recovery tip after friction, and an oversight note on high-stakes tasks.
  - **Drafts waiting for you**, each with the five actions.
  - **Private chat** with your agent.
  - **Private pair memory** notes, each with a **Share** button, plus a form to add notes.
- **Global memory:** decisions, plan, facts, and open questions, each showing its source, with **Sign off** buttons where allowed. The **Run agent round** button sits in this panel's header.

**Observer view (`/?as=observer`)**
- All three private pair channels side by side.
- An analytics table per pair.
- **Export session**, **Run agent round**, and **Reset**.

The UI updates live over server-sent events. Re-renders preserve focus, cursor position, and scroll, so typing isn't interrupted when other participants act.

---

## Task presets

| Preset | Criticality | What it tests |
|---|---|---|
| **Host city (hidden profile)** | Consequential | Pick Riverton, Lakeside, or Hillcrest for a tournament. Each pair's private brief holds different facts. The best answer only appears once the facts are shared, following the hidden-profile design used in Alsobay et al. (CSCW 2026). |
| **Product launch plan** | Operational | Breaking a launch into parts and coordinating them; plan items in global memory. |
| **AI-tool policy memo** | High-stakes | Productive disagreement, devil's advocacy, and sign-off gating. |

**Custom task:** set a title, description, criticality, and a private brief for each pair from the New task dialog.

Starting a new task clears the threads, drafts, and memory, but **keeps each pair's user model**, so agents keep adapting to their humans across tasks.

---

## Running a study session

A suggested protocol for a pilot:

1. Start the server and open the observer view on the researcher's machine.
2. Give each participant their pair URL. Use one machine each, or separate browser windows if everyone is co-located.
3. From any view, click **New task** and choose a preset. Let each pair pick its mode before discussion starts. To compare conditions across sessions, you can assign modes instead (for example, A = Human + agent, B = Agent only, C = Human only).
4. Let the group work. Encourage participants to flag friction when something goes wrong.
5. At the end, click **Export session** in the observer view. Also keep `data/events.jsonl` for the full timeline.
6. Click **Reset** before the next group.

**Example research questions:**
- Do pairs choose different modes as task criticality changes?
- Does Human + agent mode lead to more adapt and critique than direct use, and does that shift at high stakes?
- In the hidden-profile task, how many private facts reach global memory, and through whom: the human or the agent?
- Does having a Critic agent change how quickly decisions converge, or how often they get signed off?
- Which recovery strategies follow friction in a group compared with a one-on-one chat?

---

## Architecture

```
               ┌───────────── Global memory (shared by all 3 agents & humans) ─────────────┐
               │  decisions · plan · facts · open questions   — every item has provenance │
               └─────────▲───────────────────────▲───────────────────────▲─────────────────┘
                 share / sign-off          share / sign-off          share / sign-off
        ┌────────────────┴───┐     ┌─────────────┴──────┐     ┌──────────┴─────────┐
        │ Pair A             │     │ Pair B             │     │ Pair C             │
        │ Human A ⇄ Atlas    │     │ Human B ⇄ Beacon   │     │ Human C ⇄ Cipher   │
        │ (facilitator)      │     │ (analyst)          │     │ (critic)           │
        │ private chat+memory│     │ private chat+memory│     │ private chat+memory│
        └────────┬───────────┘     └─────────┬──────────┘     └──────────┬─────────┘
                 └────────────── Group thread (all six actors) ─────────┘
```

```
Browser (public/app.js) ──POST /api/action──▶ server.js ──▶ Session (src/session.js)
        ▲                                                       │  Agent.think() ×3 (src/agent.js)
        └──── GET /events?as=<viewer> (SSE, per-viewer view) ◀──┤  LLM adapter (src/llm.js)
                                                                │  GlobalMemory / PairMemory (src/memory.js)
                                                                └▶ data/events.jsonl, data/session.json
```

| File | Responsibility |
|---|---|
| `server.js` | HTTP server, static files, the SSE stream (one filtered view per viewer, debounced 40 ms, 25 s keep-alive ping), the action endpoint, export. |
| `src/session.js` | The orchestrator: modes, group and private turns, drafts, memory writes, sign-off, friction and recovery, analytics, per-viewer views, persistence. |
| `src/agent.js` | Agent roles, criticality rules, the speaking threshold, LLM prompts (JSON output), and offline heuristics. |
| `src/memory.js` | `GlobalMemory` and `PairMemory` (including the user model). |
| `src/llm.js` | Adapter for the Anthropic Messages API, OpenAI chat completions, or offline mode, plus a tolerant JSON parser. |
| `src/presets.js` | Task presets with per-pair private briefs. |
| `public/` | Single-page UI: `index.html`, `app.js`, `style.css`. |
| `test/session.test.js` | Test suite (node:test). |
| `docs/` | Literature review, the source paper (PDF), and the presentation (PPTX). |

Each action runs through a promise queue (`Session.schedule`), so concurrent actions from different participants are applied in order.

---

## HTTP API

| Method & path | Purpose |
|---|---|
| `GET /` , `/app.js`, `/style.css` | Static UI |
| `GET /events?as=A\|B\|C\|observer` | Server-sent event stream of that viewer's filtered view |
| `GET /api/presets` | List presets `{ key, title, criticality }` |
| `GET /api/export` | Download the full session JSON |
| `POST /api/action` | Perform an action: `{ "type": "...", ...fields }` |

Action types:

| `type` | Fields |
|---|---|
| `createTask` | `preset`, or `title`, `description`, `criticality`, optional `subtasks[]`, `privateBriefs: {A,B,C}` |
| `setMode` | `pairId`, `mode` (`human` / `agent` / `both`) |
| `setPairConfig` | `pairId`, optional `humanName`, `agentName`, `role`, `teaching` |
| `post` | `pairId`, `channel` (`group` / `pair`), `text` |
| `reviewDraft` | `pairId`, `draftId`, `action` (`approve` / `edit` / `explain` / `revise` / `reject`), optional `text` or `feedback` |
| `flagFriction` | `pairId`, `messageId`, `source` (`me` / `agent` / `both`) |
| `addMemory` | `pairId`, `scope` (global or pair), `type`, `text` |
| `shareNote` | `pairId`, `noteId` |
| `signOff` | `pairId`, `itemId` |
| `removeMemory` | `pairId`, `scope`, `itemId` |
| `runRound` | (none) |
| `reset` | (none) |

Invalid actions, such as posting to the group from Agent only mode, return `400 { error }`.

Example:

```bash
curl -X POST localhost:8790/api/action -H 'content-type: application/json' \
  -d '{"type":"createTask","preset":"hidden-profile"}'
```

---

## Data and logging

- `data/events.jsonl` is append-only, one JSON event per line: `{ ts, type, ...details }`. The event types are:
  `task_created, mode_changed, pair_config, human_post, agent_turn, agent_private, draft_reviewed, draft_revised, memory_added, memory_removed, note_shared, signed_off, friction_flagged, friction_recovery, reset`.
- `data/session.json` is the latest full state. The server reloads it on startup, so a restart resumes the session.
- **Export session** returns `{ exportedAt, llm, task, pairs, group, pairThreads, drafts, global, pairMem, frictions, modeHistory, analytics, events }`.

`data/` is git-ignored because it may contain participant text.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8790` | HTTP port (the server binds to 127.0.0.1 only) |
| `ANTHROPIC_API_KEY` | (unset) | Use Claude for the agents |
| `OPENAI_API_KEY` | (unset) | Use OpenAI if no Anthropic key is set |
| `LLM_MODEL` | `claude-sonnet-4-5` / `gpt-4o-mini` | Override the model |

Tunable constants in code: `SPEAK_THRESHOLD` (`src/agent.js`), `MAX_AGENT_CHAIN` (`src/session.js`), and the agency thresholds in `agencyLevel()` (`src/session.js`).

---

## Tests

```bash
npm test
```

The 9 tests cover:
- Private briefs stay private, and each agent's context contains only its own pair's memory.
- Shared notes carry provenance.
- Mode rules (Agent only humans can't post; Human only agents stay silent).
- Paired agents draft while solo agents post.
- Draft actions update the engagement counts.
- Sign-off rules.
- Recovery classification.
- The agency estimate.

---

## Limitations and future work

- **Offline agents are templated.** They follow the full protocol but don't reason. Use an API key for real studies.
- **The agency level is an estimate** based on authorship share, not a validated H1–H5 annotation. You could validate it against human coders, or against the paper's LLM-based classifier.
- **Recovery classification is a simple word-level heuristic.** An LLM classifier using the paper's taxonomy would be more faithful.
- **No authentication.** Anyone who can reach the URL can open any view, and the server binds to localhost only. Add auth and HTTPS before a remote study.
- **Single process, in memory, one session at a time.** Running several groups in parallel would need a session ID in the URLs.
- **Scale.** The design is fixed at three pairs (six actors). Generalizing to N pairs mostly means changing `PAIR_IDS` and the layout.
- **Possible extensions:**
  - Voice channels, as in Chen et al. 2025.
  - Agent-to-agent private negotiation.
  - Memory conflict detection, as in SemanticCommit.
  - A post-task survey tied to the export.

---

## References

1. Shao, Y., Zhao, D., Padmakumar, V., Wang, J., & Yang, D. (2026). *Human–AI Collaboration at Scale: Task Criticality, Agency, and Friction across 250,000 Conversations.* Stanford University. (in `docs/`)
2. Chiang, C.-W., Lu, Z., Li, Z., & Yin, M. (2023). Are Two Heads Better Than One in AI-Assisted Decision Making? *CHI '23.* https://doi.org/10.1145/3544548.3581015
3. Schelble, B. G., Flathmann, C., Musick, G., McNeese, N. J., & Freeman, G. (2022). I See You: Examining the Role of Spatial Information in Human-Agent Teams. *PACM HCI 6(CSCW2).* https://doi.org/10.1145/3555099
4. Liu, X. B., Fang, S., Shi, W., Wu, C.-S., Igarashi, T., & Chen, X. A. (2025). Proactive Conversational Agents with Inner Thoughts. *CHI '25.* https://doi.org/10.1145/3706598.3713760
5. Doherty, E., et al. (2025). Piecing Together Teamwork: A Responsible Approach to an LLM-based Educational Jigsaw Agent. *CHI '25.* https://doi.org/10.1145/3706598.3713349
6. Chen, et al. (2025). Maintaining "Balanced" Conflict: Proactive Intervention Strategies of AI Voice Agents in Online Collaboration of Temporary Design Teams. *CHI '25.* https://doi.org/10.1145/3706598.3713457
7. Cai, Z., Park, S., Nixon, N., & Doroudi, S. (2024). Advancing Knowledge Together: Integrating LLM-based Conversational AI in Small Group Collaborative Learning. *CHI EA '24.* https://doi.org/10.1145/3613905.3650868
8. Alsobay, M., Rothschild, D. M., Hofman, J. M., & Goldstein, D. G. (2026). Bringing Everyone to the Table: An Experimental Study of LLM-Facilitated Group Decision Making. *PACM HCI (CSCW).* https://doi.org/10.1145/3816907
9. Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). Generative Agents: Interactive Simulacra of Human Behavior. *UIST '23.* https://doi.org/10.1145/3586183.3606763
10. Yen, R., & Zhao, J. (2024). Memolet: Reifying the Reuse of User-AI Conversational Memories. *UIST '24.* https://doi.org/10.1145/3654777.3676388
11. Vaithilingam, P., et al. (2025). SemanticCommit: Helping Users Update Intent Specifications for AI Memory at Scale. *UIST '25.* https://doi.org/10.1145/3746059.3747778
12. Hu, E., et al. (2025). DialogLab: Authoring, Simulating, and Testing Dynamic Human-AI Group Conversations. *UIST '25.*
13. Zhang, C., et al. (2024). ProAgent: Building Proactive Cooperative Agents with Large Language Models. *AAAI-24, 38(16), 17591–17599.*
14. Chiang, C.-W., Lu, Z., Li, Z., & Yin, M. (2024). Enhancing AI-Assisted Group Decision Making through LLM-Powered Devil's Advocate. *IUI '24.*
15. Rezazadeh, A., et al. (2025). Collaborative Memory: Multi-User Memory Sharing in LLM Agents with Dynamic Access Control. *ICML 2025.*
