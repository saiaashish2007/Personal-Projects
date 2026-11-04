import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Plain-JS twin of lib/similarity.ts and lib/drift.ts so `node mcp/server.mjs`
 * can run with no TypeScript loader. Keep the pairing math in sync with
 * findClosestPriorDecision.
 *
 * pgvector swap: store hashedBagOfWords(decisionEmbeddingText(d)) and replace
 * the scan in findClosestPriorDecision with
 * `ORDER BY embedding <=> $1::vector LIMIT 1`.
 */

const DIM = 384;
const MIN_PAIR_SCORE = 0.45;
const STOP = new Set(
  "a an the and or to of for in on we is be as at by our it this that with from so if i you they not until into than then just also are was were can will would should but about over after before out up do does did its their them he she who what when where how which your been have has had".split(
    " ",
  ),
);
const OPPOSITE_PAIRS = [
  ["annual", "monthly"],
  ["white-glove", "self-serve"],
  ["postgres", "warehouse-first"],
  ["exception-alerts", "predictive-eta"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let cached = null;

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function decisionEmbeddingText(decision) {
  return `${decision.topic} ${decision.topic} ${decision.topic} ${decision.statement}`;
}

function hashedBagOfWords(text) {
  const vector = Array.from({ length: DIM }, () => 0);
  for (const token of tokenize(text)) vector[hashToken(token) % DIM] += 1;
  return vector;
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function stem(token) {
  return token.slice(0, Math.min(token.length, 5));
}

function polarityTokens(commitment) {
  if (commitment.startsWith("yes:")) return { pole: "yes", tokens: commitment.slice(4).split("-").filter(Boolean) };
  if (commitment.startsWith("not:")) return { pole: "not", tokens: commitment.slice(4).split("-").filter(Boolean) };
  return null;
}

function commitmentsContradict(left, right) {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b || a === b) return false;
  if (OPPOSITE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) return true;
  const leftPole = polarityTokens(a);
  const rightPole = polarityTokens(b);
  if (!leftPole || !rightPole || leftPole.pole === rightPole.pole) return false;
  let shared = 0;
  for (const token of leftPole.tokens) {
    if (rightPole.tokens.some((other) => stem(token) === stem(other))) shared += 1;
  }
  return shared >= 2;
}

export function findClosestPriorDecision(candidate, earlier) {
  const query = hashedBagOfWords(decisionEmbeddingText(candidate));
  let best = null;
  for (const prior of earlier) {
    if (prior.id === candidate.id) continue;
    if (!commitmentsContradict(candidate.commitment, prior.commitment)) continue;
    const score = cosineSimilarity(query, hashedBagOfWords(decisionEmbeddingText(prior)));
    if (!best || score > best.score) best = { decision: prior, score };
  }
  if (!best || best.score < MIN_PAIR_SCORE) return null;
  return best;
}

function formatMonthDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

function byRecordOrder(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function loadDecisions() {
  if (cached) return cached;
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "northline.json");
  const corpus = JSON.parse(readFileSync(path, "utf8"));
  const decisions = [];
  for (const conversation of corpus.conversations) {
    for (const decision of conversation.decisions) {
      if (!conversation.raw.includes(decision.sourceQuote)) {
        throw new Error(`Quote for ${decision.id} is missing from ${conversation.id}`);
      }
      decisions.push({
        id: decision.id,
        position: decision.position,
        statement: decision.statement,
        owner: decision.owner,
        speaker: decision.speaker,
        rationale: decision.rationale,
        date: decision.date,
        sourceQuote: decision.sourceQuote,
        sourceTitle: conversation.title,
        sourceKind: conversation.kind,
        sourceId: conversation.id,
        topic: decision.topic,
        commitment: decision.commitment,
        shortLabel: decision.shortLabel,
      });
    }
  }
  decisions.sort(byRecordOrder);
  cached = decisions;
  return cached;
}

export function detectDrifts(decisions = loadDecisions()) {
  const ordered = [...decisions].sort(byRecordOrder);
  const drifts = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const later = ordered[index];
    const match = findClosestPriorDecision(later, ordered.slice(0, index));
    if (!match) continue;
    const earlier = match.decision;
    drifts.push({
      id: `drift_${earlier.id}_${later.id}`,
      summary: `You decided ${earlier.shortLabel} on ${formatMonthDay(earlier.date)}, but ${later.shortLabel} on ${formatMonthDay(later.date)}.`,
      topic: later.topic,
      similarity: match.score,
      earlier,
      later,
    });
  }
  drifts.sort((a, b) => {
    if (a.later.date !== b.later.date) return a.later.date < b.later.date ? 1 : -1;
    if (a.earlier.date !== b.earlier.date) return a.earlier.date < b.earlier.date ? -1 : 1;
    return a.earlier.position - b.earlier.position;
  });
  return drifts;
}

export function getDecision(id) {
  return loadDecisions().find((decision) => decision.id === id) ?? null;
}
