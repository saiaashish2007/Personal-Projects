# Decision Drift Detector

A source of truth for decisions that were already said in meetings and Slack. When a later conversation quietly reverses an earlier one, the product shows both quotes.

The demo company is Northline, a fictional freight-visibility team. Nothing in the corpus is a real meeting.

## Demo hook

Open the app. Press **Watch live** and the five March 2026 conversations are extracted one at a time, with no API key and no database. You can also paste or dictate any transcript; decisions land as you type when Live is on. The first card from the sample is:

> You decided annual billing on Mar 3, but monthly billing on Mar 17.

Each card has both source quotes, the speaker, the date, and a link to the source message. Clear the record to see the empty state. Paste a transcript, or load one of the five samples, then extract. Run demo puts the Northline record back.

## Extraction

`lib/extract.ts` has two paths.

- The deterministic extractor recognizes the seeded quotes and, for other pastes, a small decision grammar (`we decided`, `we're locking`, billing and onboarding commitments, and so on). This is the path the page uses when no key is set.
- `extractWithClaude` calls the Anthropic Messages API with a JSON schema tool (`record_decisions`) only if `ANTHROPIC_API_KEY` is set. A missing key, a failed call, or an empty result falls back to the deterministic extractor. The homepage never calls Anthropic, so a missing key cannot blank the page. `ANTHROPIC_MODEL` overrides the model (default `claude-sonnet-4-5`).

## Similarity

`lib/similarity.ts` turns a decision into a hashed bag-of-words vector and pairs a new decision with the earlier one it contradicts using cosine similarity. `findClosestPriorDecision` is the retrieval step. Contradiction itself is a short explicit list: annual/monthly, white-glove/self-serve, postgres/warehouse-first, exception-alerts/predictive-eta.

That function is the pgvector seam. Store `hashedBagOfWords(decisionEmbeddingText(decision))` in a `vector` column and replace the scan with `ORDER BY embedding <=> $1::vector LIMIT 1`. Swap the hash vectors for model embeddings without changing the drift cards.

## MCP

The stdio server reads `data/northline.json` directly. It does not start Next.js.

```
node mcp/server.mjs
```

Tools: `list_decisions`, `list_drifts`, `get_decision`.

## What would replace the stand-ins

- Claude: set `ANTHROPIC_API_KEY`. The schema tool is already the model path. A stricter production extractor would trust the model for unseen transcripts and keep the verbatim-quote check.
- pgvector: replace `findClosestPriorDecision` with cosine distance in Postgres, as noted above. No database is provisioned here.

## Local run

```
npm install
npm run dev
```
