import corpusJson from "../data/northline.json";
import { loadCorpus } from "./corpus";
import { hashToken } from "./similarity";
import type { Decision, ExtractResult, IngestRequest, SourceKind } from "./types";

const seed = loadCorpus(corpusJson);

const TOPIC_BY_COMMITMENT: Record<string, string> = {
  annual: "billing cadence",
  monthly: "billing cadence",
  "white-glove": "onboarding motion",
  "self-serve": "onboarding motion",
  postgres: "system of record",
  "warehouse-first": "system of record",
  "exception-alerts": "april roadmap",
  "predictive-eta": "april roadmap",
};

const SHORT_BY_COMMITMENT: Record<string, string> = {
  annual: "annual billing",
  monthly: "monthly billing",
  "white-glove": "white-glove onboarding",
  "self-serve": "self-serve onboarding",
  postgres: "Postgres as the system of record",
  "warehouse-first": "a warehouse-first architecture",
  "exception-alerts": "exception alerts in the April release",
  "predictive-eta": "a predictive ETA model",
};

const STRONG_CUE =
  /\b(we decided|we've decided|decision:|decision for|i'm deciding|i am deciding|calling it|we will|we won't|we are not|we're not|the record changes)\b/i;

const INLINE_TURN =
  /^([A-Z][A-Za-z'’.-]+(?: [A-Z][A-Za-z'’.-]+){0,3})(?: \([^)\n]{1,48}\))?\s*:\s+(.+)$/;

const SLACK_HEADER =
  /^([A-Z][A-Za-z'’.-]+(?: [A-Z][A-Za-z'’.-]+){0,3})\s{2,}\d{1,2}:\d{2}\s*$/;

const decisionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          statement: { type: "string" },
          owner: { type: "string" },
          speaker: { type: "string" },
          rationale: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          sourceQuote: {
            type: "string",
            description: "Verbatim span copied from the transcript",
          },
          topic: { type: "string" },
          commitment: {
            type: "string",
            description: "Short canonical commitment such as annual or monthly",
          },
          shortLabel: {
            type: "string",
            description: "Lowercase noun phrase, for example annual billing",
          },
        },
        required: [
          "statement",
          "owner",
          "speaker",
          "rationale",
          "date",
          "sourceQuote",
          "topic",
          "commitment",
          "shortLabel",
        ],
      },
    },
  },
  required: ["decisions"],
} as const;

type ClaudeDecision = {
  statement?: unknown;
  owner?: unknown;
  speaker?: unknown;
  rationale?: unknown;
  date?: unknown;
  sourceQuote?: unknown;
  topic?: unknown;
  commitment?: unknown;
  shortLabel?: unknown;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDate(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return "2026-03-24";
}

function cleanKind(value: SourceKind | undefined): SourceKind {
  return value === "slack" ? "slack" : "meeting";
}

function cleanSourceId(value: string | undefined, text: string): string {
  if (value && /^src_[a-z0-9_]+$/i.test(value)) return value;
  return `src_${hashToken(normalize(text)).toString(16)}`;
}

export function inferCommitment(text: string): string | null {
  const value = text.toLowerCase().replace(/[’‘]/g, "'");
  if (
    /not moving to a warehouse-first|postgres remains the system of record|postgres stays the system of record/.test(
      value,
    )
  ) {
    return "postgres";
  }
  if (/moving to a warehouse-first/.test(value)) return "warehouse-first";
  if (/white-glove/.test(value) && /no self-serve|not self-serve/.test(value)) return "white-glove";
  if (/white-glove/.test(value) && !/opening self-serve|self-serve is the new/.test(value)) {
    return "white-glove";
  }
  if (/self-serve onboarding|opening self-serve|self-serve is the new/.test(value)) {
    return "self-serve";
  }
  if (/predictive eta model waits|defer the predictive eta|exception alerts ship/.test(value)) {
    return "exception-alerts";
  }
  if (/predictive eta model ships|ship the predictive eta/.test(value)) return "predictive-eta";
  if (
    /lock(?:ing)? annual billing|annual billing as the default|annual billing is the default|default is annual billing/.test(
      value,
    )
  ) {
    return "annual";
  }
  if (
    /switch(?:ing)? the default to monthly|monthly billing is the default|monthly billing is the new default|default to monthly billing|make monthly billing the default/.test(
      value,
    )
  ) {
    return "monthly";
  }
  return null;
}

function matchSeed(text: string): Decision[] {
  const norm = normalize(text);
  const found = new Map<string, Decision>();
  for (const decision of seed.decisions) {
    const quote = normalize(decision.sourceQuote);
    if (quote.length >= 24 && norm.includes(quote)) found.set(decision.id, decision);
  }
  return [...found.values()].sort((a, b) => a.position - b.position);
}

type Turn = { speaker: string; text: string };

function parseTurns(raw: string): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      current = null;
      continue;
    }
    if (trimmed.startsWith("#")) {
      current = null;
      continue;
    }
    const inline = trimmed.match(INLINE_TURN);
    if (inline) {
      current = { speaker: inline[1], text: inline[2] };
      turns.push(current);
      continue;
    }
    const header = trimmed.match(SLACK_HEADER);
    if (header) {
      current = { speaker: header[1], text: "" };
      turns.push(current);
      continue;
    }
    if (current) {
      current.text = current.text ? `${current.text} ${trimmed}` : trimmed;
    }
  }
  return turns.filter((turn) => turn.text.trim().length > 0);
}

function statementFrom(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 180) return cleaned;
  return cleaned.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
}

function rationaleFrom(text: string): string {
  const because = text.match(/because\s+([^.]{12,160})/i);
  if (because) return `${because[1].trim()}.`;
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length >= 2) return sentences[1];
  return "Stated in the conversation.";
}

function shortLabelFor(commitment: string, statement: string): string {
  return (
    SHORT_BY_COMMITMENT[commitment] ??
    statement
      .replace(/[.]+$/, "")
      .split(/\s+/)
      .slice(0, 8)
      .join(" ")
  );
}

function heuristicExtract(input: IngestRequest): Decision[] {
  const text = input.text.trim();
  const turns = parseTurns(text);
  const usable = turns.length > 0 ? turns : [{ speaker: "Unattributed", text }];
  const date = cleanDate(input.date);
  const kind = cleanKind(input.kind);
  const title = input.title?.trim() || "Pasted conversation";
  const sourceId = cleanSourceId(input.sourceId, text);
  const decisions: Decision[] = [];

  usable.forEach((turn, index) => {
    const commitment = inferCommitment(turn.text);
    const strong = STRONG_CUE.test(turn.text);
    if (!commitment && !strong) return;
    if (turn.text.trim().length < 12) return;
    const resolved = commitment ?? `custom-${hashToken(normalize(turn.text).slice(0, 80)).toString(16)}`;
    const statement = statementFrom(turn.text);
    const speaker = turn.speaker || "Unattributed";
    decisions.push({
      id: `dec_${hashToken(normalize(turn.text)).toString(16)}`,
      position: index,
      statement,
      owner: speaker,
      speaker,
      rationale: rationaleFrom(turn.text),
      date,
      sourceQuote: turn.text.trim(),
      sourceTitle: title,
      sourceKind: kind,
      sourceId,
      topic: TOPIC_BY_COMMITMENT[resolved] ?? "pasted decision",
      commitment: resolved,
      shortLabel: shortLabelFor(resolved, statement),
    });
  });

  return decisions;
}

export function deterministicExtract(input: IngestRequest): Decision[] {
  const text = input.text.trim();
  if (!text) return [];
  const seeded = matchSeed(text);
  if (seeded.length > 0) return seeded;
  return heuristicExtract(input);
}

function quoteInSource(quote: string, text: string): boolean {
  return text.includes(quote) || normalize(text).includes(normalize(quote));
}

function asCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fromClaude(raw: ClaudeDecision, input: IngestRequest, index: number): Decision | null {
  const sourceQuote = asCleanString(raw.sourceQuote);
  const statement = asCleanString(raw.statement);
  if (!sourceQuote || !statement || !quoteInSource(sourceQuote, input.text)) return null;
  const seeded = seed.decisions.find(
    (decision) => normalize(input.text).includes(normalize(decision.sourceQuote)) && normalize(decision.sourceQuote) === normalize(sourceQuote),
  );
  if (seeded) return seeded;
  const speaker = asCleanString(raw.speaker) || asCleanString(raw.owner) || "Unattributed";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asCleanString(raw.date))
    ? asCleanString(raw.date)
    : cleanDate(input.date);
  const inferred = inferCommitment(sourceQuote) ?? inferCommitment(statement);
  const commitment = inferred || asCleanString(raw.commitment) || "unspecified";
  const sourceId = cleanSourceId(input.sourceId, input.text);
  return {
    id: `dec_${hashToken(normalize(sourceQuote)).toString(16)}`,
    position: index,
    statement,
    owner: asCleanString(raw.owner) || speaker,
    speaker,
    rationale: asCleanString(raw.rationale) || "Stated in the conversation.",
    date,
    sourceQuote,
    sourceTitle: input.title?.trim() || "Pasted conversation",
    sourceKind: cleanKind(input.kind),
    sourceId,
    topic: TOPIC_BY_COMMITMENT[commitment] ?? (asCleanString(raw.topic) || "pasted decision"),
    commitment,
    shortLabel: SHORT_BY_COMMITMENT[commitment] ?? (asCleanString(raw.shortLabel) || shortLabelFor(commitment, statement)),
    };
}

async function callAnthropic(input: IngestRequest, apiKey: string): Promise<Decision[]> {
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system:
        "Extract explicit company decisions from a meeting transcript or Slack thread. A decision is a commitment about what the company will do. Copy sourceQuote verbatim from the transcript. Do not invent speakers, dates, or quotes. If a later line reverses an earlier commitment, extract both.",
      tools: [
        {
          name: "record_decisions",
          description: "Record the decisions found in the conversation.",
          input_schema: decisionSchema,
        },
      ],
      tool_choice: { type: "tool", name: "record_decisions" },
      messages: [
        {
          role: "user",
          content: `Conversation date: ${cleanDate(input.date)}\nSource title: ${input.title?.trim() || "Pasted conversation"}\nSource kind: ${cleanKind(input.kind)}\n\n${input.text}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; name?: string; input?: { decisions?: ClaudeDecision[] } }>;
  };
  const tool = payload.content?.find((block) => block.type === "tool_use" && block.name === "record_decisions");
  const rows = tool?.input?.decisions;
  if (!Array.isArray(rows)) return [];
  const decisions: Decision[] = [];
  rows.forEach((row, index) => {
    const decision = fromClaude(row, input, index);
    if (decision && !decisions.some((existing) => existing.id === decision.id)) decisions.push(decision);
  });
  return decisions;
}

/**
 * Calls the Anthropic Messages API with a JSON schema tool ONLY when
 * ANTHROPIC_API_KEY is set. A missing key, a transport error, or an empty
 * result falls back to the deterministic extractor. The page never depends on this.
 */
export async function extractWithClaude(input: IngestRequest): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { decisions: deterministicExtract(input), extractor: "deterministic" };
  }
  try {
    const decisions = await callAnthropic(input, apiKey);
    if (decisions.length === 0) {
      return { decisions: deterministicExtract(input), extractor: "deterministic" };
    }
    return { decisions, extractor: "claude" };
  } catch {
    return { decisions: deterministicExtract(input), extractor: "deterministic" };
  }
}
