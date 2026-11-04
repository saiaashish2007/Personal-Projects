"use client";

import { useMemo, useState, type FormEvent } from "react";
import { detectDrifts } from "../lib/drift";
import { byRecordOrder, formatFullDate, formatMonthDay, kindLabel } from "../lib/format";
import { hashToken } from "../lib/similarity";
import type { Decision, ExtractResult, Source, SourceKind } from "../lib/types";

type Board = { decisions: Decision[]; sources: Source[] };

type Props = {
  company: string;
  seedDecisions: Decision[];
  seedSources: Source[];
};

function sameRecord(left: Decision[], right: Decision[]): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(left.map((decision) => decision.id));
  return right.every((decision) => ids.has(decision.id));
}

function ensureSources(current: Source[], incoming: Decision[], paste: Source | null, seeds: Source[]): Source[] {
  const next = [...current];
  const have = new Set(next.map((source) => source.id));
  for (const decision of incoming) {
    if (have.has(decision.sourceId)) continue;
    const seeded = seeds.find((source) => source.id === decision.sourceId);
    const addition = seeded ?? (paste && paste.id === decision.sourceId ? paste : null);
    if (!addition) continue;
    next.push(addition);
    have.add(addition.id);
  }
  next.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return next;
}

function conflictNote(decision: Decision, drifts: ReturnType<typeof detectDrifts>): string | null {
  const later = drifts.find((drift) => drift.later.id === decision.id);
  if (later) return `Reverses ${formatMonthDay(later.earlier.date)}`;
  const earlier = drifts.find((drift) => drift.earlier.id === decision.id);
  if (earlier) return `Reversed ${formatMonthDay(earlier.later.date)}`;
  return null;
}

function Transcript({ raw, decisions }: { raw: string; decisions: Decision[] }) {
  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const placed = new Set<string>();
  return (
    <div className="transcript">
      {blocks.map((block, index) => {
        const decision = decisions.find((item) => block.includes(item.sourceQuote));
        if (block.startsWith("#") && !decision) {
          return (
            <p className="channel" key={`${index}-channel`}>
              {block}
            </p>
          );
        }
        if (!decision) return <p key={index}>{block}</p>;
        placed.add(decision.id);
        const at = block.indexOf(decision.sourceQuote);
        return (
          <p key={decision.id}>
            {block.slice(0, at)}
            <mark id={`msg-${decision.id}`}>{decision.sourceQuote}</mark>
            {block.slice(at + decision.sourceQuote.length)}
          </p>
        );
      })}
      {decisions
        .filter((decision) => !placed.has(decision.id))
        .map((decision) => (
          <span id={`msg-${decision.id}`} key={decision.id} />
        ))}
    </div>
  );
}

function QuoteBlock({ decision, when }: { decision: Decision; when: string }) {
  return (
    <blockquote>
      <p>“{decision.sourceQuote}”</p>
      <footer className="quote-meta">
        <strong>{decision.speaker}</strong>
        <span>
          {formatFullDate(decision.date)} · {kindLabel(decision.sourceKind)}
        </span>
        <a href={`#msg-${decision.id}`}>{decision.sourceTitle}</a>
      </footer>
      <span className="sr-only">{when}</span>
    </blockquote>
  );
}

export function Workspace({ company, seedDecisions, seedSources }: Props) {
  const [board, setBoard] = useState<Board>({ decisions: seedDecisions, sources: seedSources });
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Pasted conversation");
  const [kind, setKind] = useState<SourceKind>("meeting");
  const [date, setDate] = useState("2026-03-24");
  const [activeSample, setActiveSample] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const drifts = useMemo(() => detectDrifts(board.decisions), [board.decisions]);
  const ordered = useMemo(() => [...board.decisions].sort(byRecordOrder), [board.decisions]);
  const visibleSources = useMemo(
    () => board.sources.filter((source) => ordered.some((decision) => decision.sourceId === source.id)),
    [board.sources, ordered],
  );
  const demoOn = sameRecord(board.decisions, seedDecisions);
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const drift of drifts) {
      ids.add(drift.earlier.id);
      ids.add(drift.later.id);
    }
    return ids;
  }, [drifts]);

  function runDemo() {
    setBoard({ decisions: seedDecisions, sources: seedSources });
    setStatus(`${company} demo is on the record.`);
    setError("");
  }

  function clearRecord() {
    setBoard({ decisions: [], sources: [] });
    setStatus("");
    setError("");
  }

  function loadSample(source: Source) {
    setDraft(source.raw);
    setTitle(source.title);
    setKind(source.kind);
    setDate(source.date);
    setActiveSample(source.id);
    setError("");
    setStatus(`Loaded ${source.title} into the paste box.`);
  }

  async function onExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    const text = draft.trim();
    if (!text) {
      setError("Paste a transcript or a Slack thread first.");
      return;
    }
    setBusy(true);
    try {
      const sourceId = `src_paste_${hashToken(text).toString(16)}`;
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, title, kind, date, sourceId }),
      });
      const body = (await response.json()) as ExtractResult & { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not extract decisions.");
        return;
      }
      const incoming = body.decisions ?? [];
      if (incoming.length === 0) {
        setStatus("No decision found in that paste.");
        return;
      }
      const known = new Set(board.decisions.map((decision) => decision.id));
      const novel = incoming.filter((decision) => !known.has(decision.id));
      if (novel.length === 0) {
        setStatus("Those decisions are already on the record.");
        return;
      }
      const paste: Source | null = novel.some((decision) => decision.sourceId === sourceId)
        ? { id: sourceId, title: title.trim() || "Pasted conversation", kind, date, raw: text }
        : null;
      setBoard((current) => ({
        decisions: [...current.decisions, ...novel].sort(byRecordOrder),
        sources: ensureSources(current.sources, novel, paste, seedSources),
      }));
      const noun = novel.length === 1 ? "decision" : "decisions";
      setStatus(
        body.extractor === "claude"
          ? `Added ${novel.length} ${noun} with Claude.`
          : `Added ${novel.length} ${noun} with the ruleset extractor.`,
      );
    } catch {
      setError("Could not reach the extractor.");
    } finally {
      setBusy(false);
    }
  }

  const eyebrow = demoOn
    ? `${company} · March 2026`
    : ordered.length === 0
      ? "Empty record"
      : "Working record";

  return (
    <>
      <a className="skip" href="#drifts">
        Skip to drifts
      </a>
      <div className="wrap">
        <header className="top">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>Decision Drift Detector</h1>
            <p className="lede">
              The record of what was already decided in meetings and Slack. When a later conversation
              reverses it, both quotes stay on the card.
            </p>
            <hr className="rule" />
          </div>
          <div className="actions">
            <button className="ghost" type="button" onClick={clearRecord}>
              Clear
            </button>
            <button className="primary" type="button" onClick={runDemo} aria-pressed={demoOn}>
              Run demo
            </button>
          </div>
        </header>

        <ul className="stats">
          <li>{ordered.length === 1 ? "1 decision" : `${ordered.length} decisions`}</li>
          <li>{drifts.length === 1 ? "1 drift" : `${drifts.length} drifts`}</li>
          <li>{visibleSources.length === 1 ? "1 source" : `${visibleSources.length} sources`}</li>
          <li>Ruleset extractor</li>
        </ul>

        <div className="section-head">
          <h2 id="drifts">{drifts.length === 1 ? "1 drift" : `${drifts.length} drifts`}</h2>
        </div>
        {drifts.length === 0 ? (
          <div className="empty">
            <p>
              {ordered.length === 0
                ? "No drift yet. Run the Northline demo to see the March billing reversal."
                : "No contradictions yet. A later decision that reverses an earlier one will show both quotes here."}
            </p>
            {ordered.length === 0 ? (
              <button className="primary" type="button" onClick={runDemo}>
                Run demo
              </button>
            ) : null}
          </div>
        ) : (
          <div className="drift-list">
            {drifts.map((drift, index) => (
              <article className="drift" key={drift.id}>
                <p className="drift-kicker">
                  <span>
                    Drift {String(index + 1).padStart(2, "0")} · {drift.topic}
                  </span>
                  <span>{drift.similarity.toFixed(2)} similar</span>
                </p>
                <p className="drift-sentence">{drift.summary}</p>
                <p className="pair-note">Paired with the earlier decision by wording similarity.</p>
                <div className="quotes">
                  <QuoteBlock decision={drift.earlier} when="Earlier commitment" />
                  <QuoteBlock decision={drift.later} when="Later commitment" />
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="layout">
          <section aria-labelledby="timeline-heading">
            <div className="section-head">
              <h2 id="timeline-heading">{ordered.length === 1 ? "1 decision" : `${ordered.length} decisions`}</h2>
            </div>
            {ordered.length === 0 ? (
              <div className="empty">
                <p>Nothing is on the record. Paste a transcript, load a sample, or run the demo.</p>
              </div>
            ) : (
              <ol className="timeline">
                {ordered.map((decision, index) => {
                  const note = conflictNote(decision, drifts);
                  const conflict = conflictIds.has(decision.id);
                  return (
                    <li className={conflict ? "decision is-conflict" : "decision"} key={decision.id}>
                      <div className="rail" aria-hidden="true">
                        <span className="dot" />
                      </div>
                      <article>
                        <p className="meta">
                          <span className="index">{String(index + 1).padStart(2, "0")}</span>
                          <span>{formatFullDate(decision.date)}</span>
                          <span>{kindLabel(decision.sourceKind)}</span>
                          <span>{decision.owner}</span>
                          {note ? <span className="tag">{note}</span> : null}
                        </p>
                        <h3>{decision.statement}</h3>
                        <p className="rationale">{decision.rationale}</p>
                        <p className="spoken">“{decision.sourceQuote}”</p>
                        <p className="source-link">
                          <a href={`#msg-${decision.id}`}>{decision.sourceTitle}</a>
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <form className="panel" onSubmit={onExtract}>
            <h2>Add a conversation</h2>
            <p className="help">
              Paste a transcript or a Slack thread. Samples fill the box. Extract adds any decision that is not
              already on the record.
            </p>
            <div className="samples">
              {seedSources.map((source) => (
                <button
                  key={source.id}
                  className="chip"
                  type="button"
                  aria-pressed={activeSample === source.id}
                  onClick={() => loadSample(source)}
                >
                  {source.title}
                </button>
              ))}
            </div>
            <label>
              Transcript or thread
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setActiveSample(null);
                }}
                placeholder={'Maya Chen: We are locking annual billing as the default.\n\nJordan Hale  9:14\nDecision for the release: ship the alerts.'}
                maxLength={50000}
              />
            </label>
            <label>
              Source title
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
            </label>
            <div className="row2">
              <label>
                Date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label>
                Kind
                <select value={kind} onChange={(event) => setKind(event.target.value as SourceKind)}>
                  <option value="meeting">Meeting</option>
                  <option value="slack">Slack</option>
                </select>
              </label>
            </div>
            {error ? (
              <p className="alert" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="status" role="status">
                {status}
              </p>
            ) : null}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Extracting…" : "Extract decisions"}
            </button>
            <p className="notice">
              Demo extraction runs on a deterministic ruleset, so the page works with no API key. If
              ANTHROPIC_API_KEY is set on the server, a paste uses Claude and falls back to the ruleset if the
              call fails.
            </p>
          </form>
        </div>

        <div className="section-head">
          <h2>Source messages</h2>
        </div>
        {visibleSources.length === 0 ? (
          <div className="empty">
            <p>Source messages show up here once a decision is on the record.</p>
          </div>
        ) : (
          <div className="sources">
            {visibleSources.map((source) => (
              <article className="source" id={`source-${source.id}`} key={source.id}>
                <p className="meta">
                  <span>{kindLabel(source.kind)}</span>
                  <span>{formatFullDate(source.date)}</span>
                </p>
                <h3>{source.title}</h3>
                <Transcript
                  raw={source.raw}
                  decisions={ordered.filter((decision) => decision.sourceId === source.id)}
                />
              </article>
            ))}
          </div>
        )}

        <p className="foot">
          {company} is fictional, and these conversations were written for the demo. Pairing uses hashed
          bag-of-words cosine similarity, the stand-in for pgvector. Contradiction still checks a short list of
          opposite commitments.
        </p>
      </div>
    </>
  );
}
