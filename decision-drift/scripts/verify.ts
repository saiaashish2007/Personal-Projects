import corpusJson from "../data/northline.json";
import { loadCorpus } from "../lib/corpus";
import { detectDrifts } from "../lib/drift";
import { deterministicExtract, extractWithClaude, inferCommitment } from "../lib/extract";
import { findClosestPriorDecision } from "../lib/similarity";

const BILLING = "You decided annual billing on Mar 3, but monthly billing on Mar 17.";
const ONBOARDING = "You decided white-glove onboarding on Mar 10, but self-serve onboarding on Mar 17.";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const corpus = loadCorpus(corpusJson);
assert(corpus.sources.length === 5, "expected 5 conversations");
assert(corpus.decisions.length === 6, "expected 6 decisions");

for (const decision of corpus.decisions) {
  const source = corpus.sources.find((item) => item.id === decision.sourceId);
  assert(source, `missing source for ${decision.id}`);
  assert(source.raw.includes(decision.sourceQuote), `quote missing from source ${decision.id}`);
  assert(
    inferCommitment(decision.sourceQuote) === decision.commitment,
    `commitment mismatch for ${decision.id}: got ${inferCommitment(decision.sourceQuote)}`,
  );
}

const drifts = detectDrifts(corpus.decisions);
assert(drifts.length === 2, `expected 2 drifts, got ${drifts.length}: ${drifts.map((d) => d.summary).join(" | ")}`);
assert(drifts[0].summary === BILLING, `billing summary was: ${drifts[0].summary}`);
assert(drifts[1].summary === ONBOARDING, `onboarding summary was: ${drifts[1].summary}`);
assert(drifts[0].earlier.speaker === "Maya Chen", "earlier speaker");
assert(drifts[0].later.speaker === "Sam Rivera", "later speaker");
assert(drifts[0].earlier.date === "2026-03-03", "earlier date");
assert(drifts[0].later.date === "2026-03-17", "later date");
assert(drifts[0].earlier.sourceTitle === "Pricing huddle", "earlier source");
assert(drifts[0].later.sourceTitle === "GTM sync", "later source");
assert(drifts[0].similarity > 0.45, `billing similarity too low: ${drifts[0].similarity}`);
assert(drifts[1].similarity > 0.45, `onboarding similarity too low: ${drifts[1].similarity}`);

const monthly = corpus.decisions.find((decision) => decision.id === "dec_billing_monthly");
const earlier = corpus.decisions.filter((decision) => decision.date < "2026-03-17");
assert(monthly, "monthly decision missing");
const pair = findClosestPriorDecision(monthly, earlier);
assert(pair?.decision.id === "dec_billing_annual", `paired ${pair?.decision.id} score ${pair?.score}`);

const expected: Record<string, string[]> = {
  src_pricing_huddle: ["dec_billing_annual"],
  src_product_launch: ["dec_alerts_april"],
  src_onboarding_review: ["dec_onboarding_white_glove"],
  src_eng_architecture: ["dec_postgres_sor"],
  src_gtm_sync: ["dec_billing_monthly", "dec_onboarding_self_serve"],
};

for (const source of corpus.sources) {
  const found = deterministicExtract({
    text: source.raw,
    title: source.title,
    kind: source.kind,
    date: source.date,
  }).map((decision) => decision.id);
  assert(found.join(",") === expected[source.id].join(","), `${source.id} extracted ${found.join(",")}`);
}

const bothQuotes = `${corpus.decisions[0].sourceQuote}\n\n${monthly.sourceQuote}`;
const fromQuotes = deterministicExtract({ text: bothQuotes, kind: "meeting", date: "2026-03-17" });
assert(
  fromQuotes.map((decision) => decision.id).join(",") === "dec_billing_annual,dec_billing_monthly",
  `quote paste extracted ${fromQuotes.map((decision) => decision.id).join(",")}`,
);

const lunch = deterministicExtract({ text: "Let's grab lunch.", kind: "slack", date: "2026-03-18" });
assert(lunch.length === 0, "lunch should not be a decision");

const novel = deterministicExtract({
  text: "Avery Quinn: We're locking annual billing as the default for the Harbor account.\n\nAvery Quinn: Let's switch the default to monthly billing for the Harbor account.",
  title: "Harbor",
  kind: "meeting",
  date: "2026-03-28",
});
assert(novel.length === 2, `novel extracted ${novel.length}`);
const novelDrifts = detectDrifts(novel);
assert(novelDrifts.length === 1, `novel drifts ${novelDrifts.length}`);
assert(novelDrifts[0].summary === "You decided annual billing on Mar 28, but monthly billing on Mar 28.", novelDrifts[0].summary);

const empty = deterministicExtract({ text: "   " });
assert(empty.length === 0, "blank paste");

const hiring = deterministicExtract({
  text: "Mina Cole: We decided to hire two engineers this quarter.\n\nMina Cole: We are not hiring engineers this quarter.",
  title: "Staffing",
  kind: "meeting",
  date: "2026-04-02",
});
assert(hiring.length === 2, `hiring extracted ${hiring.length}`);
const hiringDrifts = detectDrifts(hiring);
assert(hiringDrifts.length === 1, `hiring drifts ${hiringDrifts.length}`);

async function main(): Promise<void> {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const fallback = await extractWithClaude({
      text: corpus.sources[0].raw,
      title: corpus.sources[0].title,
      kind: "meeting",
      date: "2026-03-03",
    });
    assert(fallback.extractor === "deterministic", "missing key should stay deterministic");
    assert(fallback.decisions[0]?.id === "dec_billing_annual", "fallback should return the seeded decision");
  } finally {
    if (previousKey !== undefined) process.env.ANTHROPIC_API_KEY = previousKey;
  }

  console.log(
    `ok drifts=${drifts.length} billing=${drifts[0].similarity.toFixed(3)} onboarding=${drifts[1].similarity.toFixed(3)}`,
  );
}

main();
