/**
 * In-memory stand-in for pgvector.
 *
 * `hashedBagOfWords` is the embedding. `findClosestPriorDecision` is the
 * retrieval. A pgvector swap stores that vector and replaces the scan with
 * `ORDER BY embedding <=> $1::vector LIMIT 1` (cosine distance), then keeps
 * the contradiction check below.
 */

const DIM = 384;
export const MIN_PAIR_SCORE = 0.45;

const STOP = new Set(
  "a an the and or to of for in on we is be as at by our it this that with from so if i you they not until into than then just also are was were can will would should but about over after before out up do does did its their them he she who what when where how which your been have has had".split(
    " ",
  ),
);

const OPPOSITE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["annual", "monthly"],
  ["white-glove", "self-serve"],
  ["postgres", "warehouse-first"],
  ["exception-alerts", "predictive-eta"],
];

export type PairableDecision = {
  id: string;
  topic: string;
  statement: string;
  commitment: string;
};

export function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

export function decisionEmbeddingText(decision: Pick<PairableDecision, "topic" | "statement">): string {
  return `${decision.topic} ${decision.topic} ${decision.topic} ${decision.statement}`;
}

export function hashedBagOfWords(text: string): number[] {
  const vector = Array.from({ length: DIM }, () => 0);
  for (const token of tokenize(text)) {
    vector[hashToken(token) % DIM] += 1;
  }
  return vector;
}

export function embedDecision(decision: Pick<PairableDecision, "topic" | "statement">): number[] {
  return hashedBagOfWords(decisionEmbeddingText(decision));
}

export function cosineSimilarity(left: number[], right: number[]): number {
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

export function commitmentsContradict(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b || a === b) return false;
  return OPPOSITE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function findClosestPriorDecision<T extends PairableDecision>(
  candidate: T,
  earlier: T[],
): { decision: T; score: number } | null {
  const query = embedDecision(candidate);
  let best: { decision: T; score: number } | null = null;
  for (const prior of earlier) {
    if (prior.id === candidate.id) continue;
    if (!commitmentsContradict(candidate.commitment, prior.commitment)) continue;
    const score = cosineSimilarity(query, embedDecision(prior));
    if (!best || score > best.score) best = { decision: prior, score };
  }
  if (!best || best.score < MIN_PAIR_SCORE) return null;
  return best;
}
