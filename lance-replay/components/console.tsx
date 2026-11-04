"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock, formatStay } from "@/lib/dates";
import { readStoredTraces, writeStoredTraces } from "@/lib/local-traces";
import { BOOK, type Reservation, type Trace } from "@/lib/types";

const SAMPLE =
  "Hi, this is Alex Chen, confirmation R-1042. Please move checkout from March 15 to March 17 and add late checkout.";

type Phase = "idle" | "listening" | "running" | "ready";

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function passedCount(trace: Trace) {
  return trace.steps.filter((step) => step.pass).length;
}

function totalLatency(trace: Trace) {
  return trace.steps.reduce((sum, step) => sum + step.latencyMs, 0);
}

function lateLabel(value: boolean) {
  return value ? "Yes" : "No";
}

function sameRecord(a: Reservation, b: Reservation) {
  return (
    a.guest === b.guest &&
    a.room === b.room &&
    a.arrive === b.arrive &&
    a.depart === b.depart &&
    a.lateCheckout === b.lateCheckout
  );
}

async function readBody(response: Response): Promise<{
  error?: string;
  reservation?: Reservation;
  reservations?: Reservation[];
  trace?: Trace;
}> {
  try {
    return (await response.json()) as {
      error?: string;
      reservation?: Reservation;
      reservations?: Reservation[];
      trace?: Trace;
    };
  } catch {
    throw new Error("The property system returned an unreadable response.");
  }
}

function speechCtor(): (new () => SpeechRecognizer) | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRecognizer;
    webkitSpeechRecognition?: new () => SpeechRecognizer;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function Console() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [breakRoom, setBreakRoom] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>(BOOK);
  const [selectedCode, setSelectedCode] = useState(BOOK[0].confirmation);
  const [draft, setDraft] = useState<Reservation>(BOOK[0]);
  const [utterance, setUtterance] = useState("");
  const [interim, setInterim] = useState("");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(99);
  const [animateId, setAnimateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);

  const breakRef = useRef(breakRoom);
  const bookRef = useRef(reservations);
  const utteranceRef = useRef(utterance);
  const runningRef = useRef(false);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  breakRef.current = breakRoom;
  bookRef.current = reservations;
  utteranceRef.current = utterance;

  const selectedReservation = reservations.find((item) => item.confirmation === selectedCode) ?? reservations[0];
  const dirty = selectedReservation ? !sameRecord(draft, selectedReservation) : false;
  const selected = traces.find((trace) => trace.id === selectedId) ?? null;
  const busy = phase === "running" || saving;

  useEffect(() => {
    const stored = readStoredTraces();
    if (stored.length > 0) {
      setTraces(stored);
      setSelectedId(stored[0]?.id ?? null);
    }
    void (async () => {
      try {
        const response = await fetch("/api/reservation", { cache: "no-store" });
        const body = await readBody(response);
        if (!response.ok || !body.reservations) throw new Error(body.error || "Could not load the book.");
        setReservations(body.reservations);
        setDraft(body.reservations[0]);
        setSelectedCode(body.reservations[0].confirmation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reach the property system.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!animateId) return;
    setRevealed(0);
    const timers = [1, 2, 3, 4, 5].map((count, index) => window.setTimeout(() => setRevealed(count), 120 * (index + 1)));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [animateId]);

  function chooseReservation(code: string) {
    const next = reservations.find((item) => item.confirmation === code);
    if (!next) return;
    setSelectedCode(code);
    setDraft(next);
    setFormError(null);
  }

  function updateDraft(patch: Partial<Reservation>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
  }

  function remember(trace: Trace, nextBook?: Reservation[]) {
    if (nextBook) {
      setReservations(nextBook);
      const touched = nextBook.find((item) => item.confirmation === trace.request.confirmation) ?? nextBook[0];
      if (touched) {
        setSelectedCode(touched.confirmation);
        setDraft(touched);
      }
    }
    setTraces((current) => {
      const next = [trace, ...current.filter((item) => item.id !== trace.id)].slice(0, 30);
      writeStoredTraces(next);
      return next;
    });
    setSelectedId(trace.id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimateId(null);
      setRevealed(99);
    } else {
      setRevealed(0);
      setAnimateId(trace.id);
    }
  }

  async function executeRun(transcript: string) {
    const text = transcript.trim();
    if (!text || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          breakRoom: breakRef.current,
          reservations: bookRef.current,
        }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.trace) throw new Error(body.error || "The run could not be scored.");
      remember(body.trace, body.reservations);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not be scored.");
      setPhase("ready");
    } finally {
      runningRef.current = false;
    }
  }

  function stopListening() {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setListening(false);
    setInterim("");
    if (phase === "listening") setPhase("idle");
  }

  function startListening() {
    const Ctor = speechCtor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Type the call, then run it.");
      return;
    }
    setError(null);
    const recognizer = new Ctor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = "en-US";
    recognizer.onresult = (event) => {
      let finalText = "";
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = event.results[index][0]?.transcript ?? "";
        if (event.results[index].isFinal) finalText += piece;
        else pending += piece;
      }
      if (finalText.trim()) {
        setUtterance((current) => `${current} ${finalText}`.replace(/\s+/g, " ").trim());
      }
      setInterim(pending);
    };
    recognizer.onerror = () => {
      setListening(false);
      setInterim("");
      setPhase("idle");
    };
    recognizer.onend = () => {
      setListening(false);
      setInterim("");
      if (phase !== "running") setPhase("ready");
    };
    recognizerRef.current = recognizer;
    recognizer.start();
    setListening(true);
    setPhase("listening");
  }

  async function saveDraft() {
    if (!draft.guest.trim() || !draft.room.trim()) {
      setFormError("Guest and room are required.");
      return;
    }
    if (draft.depart < draft.arrive) {
      setFormError("Departure is before arrival.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/reservation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await readBody(response);
      if (!response.ok || !body.reservations) throw new Error(body.error || "Could not save the reservation.");
      setReservations(body.reservations);
      const saved = body.reservation ?? body.reservations.find((item) => item.confirmation === draft.confirmation);
      if (saved) setDraft(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the reservation.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreBook() {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/reservation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.reservations) throw new Error(body.error || "Could not restore the book.");
      setReservations(body.reservations);
      setSelectedCode(body.reservations[0].confirmation);
      setDraft(body.reservations[0]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not restore the book.");
    } finally {
      setSaving(false);
    }
  }

  const visibleSteps = selected ? selected.steps.slice(0, revealed) : [];
  const heard = `${utterance} ${interim}`.trim();

  return (
    <main className="shell">
      <header className="top">
        <div className="identity">
          <div>
            <p className="kicker">Harbor & Pine</p>
            <h1>Guest call to property system</h1>
            <p>Speak or type the change. The agent looks up the reservation that was actually named and scores every step.</p>
          </div>
        </div>
        <div className="actions">
          <label className={breakRoom ? "break on" : "break"}>
            <input type="checkbox" checked={breakRoom} onChange={(event) => setBreakRoom(event.target.checked)} />
            Break the room
          </label>
          <button
            type="button"
            className="quiet"
            disabled={busy || !selected?.transcript}
            onClick={() => void executeRun(selected?.transcript || utteranceRef.current)}
          >
            Replay
          </button>
          <button type="button" className="primary" disabled={busy || !utterance.trim()} onClick={() => void executeRun(utterance)}>
            {phase === "running" ? "Scoring" : "Run call"}
          </button>
        </div>
      </header>

      <div className="board">
        <section className="panel call" aria-label="Call">
          <div className="panel-head">
            <div>
              <p className="kicker">Live call</p>
              <h2>Front desk</h2>
            </div>
            <div className={listening ? "live on" : "live"}>
              <span className="dot" aria-hidden="true" />
              {listening ? "Listening" : phase === "running" ? "Updating" : heard ? "Call captured" : "Waiting"}
            </div>
          </div>
          <label className="utterance">
            What the guest said
            <textarea
              value={utterance}
              maxLength={4000}
              placeholder={SAMPLE}
              onChange={(event) => setUtterance(event.target.value)}
            />
          </label>
          {interim ? <p className="interim">{interim}</p> : null}
          <div className="form-actions">
            <button type="button" className={listening ? "primary" : "quiet"} onClick={() => (listening ? stopListening() : startListening())}>
              {listening ? "Stop microphone" : "Listen"}
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setUtterance(SAMPLE);
                setError(null);
              }}
            >
              Fill sample call
            </button>
          </div>
          <p className="help">
            Try another stay out loud: “This is Jordan Lee, confirmation R-2201, move checkout to March 16 and remove late checkout.”
          </p>
        </section>

        <section className="panel reservation" aria-label="Reservation">
          <div className="panel-head">
            <div>
              <p className="kicker">Property system</p>
              <h2>In house</h2>
            </div>
          </div>
          <div className="book">
            {reservations.map((item) => (
              <button
                type="button"
                key={item.confirmation}
                className={item.confirmation === selectedCode ? "stay active" : "stay"}
                onClick={() => chooseReservation(item.confirmation)}
              >
                <strong>{item.confirmation}</strong>
                <span>{item.guest}</span>
                <span>{item.room}</span>
                <span>Out {formatStay(item.depart)}</span>
              </button>
            ))}
          </div>
          {selectedReservation ? (
            <>
              <div className="confirm">
                <strong>{selectedReservation.confirmation}</strong>
                <span className={selectedReservation.status === "Modified" ? "status modified" : "status"}>
                  {selectedReservation.status}
                </span>
              </div>
              <div className="fields">
                <label className="field">
                  Guest
                  <input value={draft.guest} maxLength={80} disabled={busy} onChange={(event) => updateDraft({ guest: event.target.value })} />
                </label>
                <label className="field">
                  Room
                  <input value={draft.room} maxLength={40} disabled={busy} onChange={(event) => updateDraft({ room: event.target.value })} />
                </label>
                <label className="field">
                  Arrive
                  <input type="date" value={draft.arrive} disabled={busy} onChange={(event) => updateDraft({ arrive: event.target.value })} />
                </label>
                <label className="field">
                  Depart
                  <input type="date" value={draft.depart} disabled={busy} onChange={(event) => updateDraft({ depart: event.target.value })} />
                </label>
                <label className="field wide check">
                  <input
                    type="checkbox"
                    checked={draft.lateCheckout}
                    disabled={busy}
                    onChange={(event) => updateDraft({ lateCheckout: event.target.checked })}
                  />
                  Late checkout
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="quiet" onClick={() => void saveDraft()} disabled={busy || !dirty}>
                  Save changes
                </button>
                <button type="button" className="link" onClick={() => void restoreBook()} disabled={busy}>
                  Restore the book
                </button>
              </div>
              {dirty ? <p className="hint">Save before the next call. The agent reads the book you saved.</p> : null}
              {formError ? <p className="form-error">{formError}</p> : null}
            </>
          ) : null}
        </section>

        <section className="panel trace" aria-label="Score">
          <div className="panel-head">
            <div>
              <p className="kicker">Score</p>
              <h2>{traces.length === 1 ? "1 run" : `${traces.length} runs`}</h2>
            </div>
          </div>
          {error ? <p className="banner">{error}</p> : null}
          {traces.length === 0 ? (
            <p className="empty">No scored runs yet. Listen, type a change, or fill the sample call, then run it.</p>
          ) : (
            <div className="trace-grid">
              <div className="runs">
                {traces.map((trace) => (
                  <button
                    type="button"
                    key={trace.id}
                    className={trace.id === selectedId ? "run active" : "run"}
                    onClick={() => {
                      setSelectedId(trace.id);
                      setAnimateId(null);
                      setRevealed(99);
                    }}
                  >
                    <span className="run-top">
                      <span className={trace.passed ? "chip pass" : "chip fail"}>{trace.passed ? "Pass" : "Fail"}</span>
                      <span className="time">{formatClock(trace.startedAt)}</span>
                    </span>
                    <span className="run-sub">
                      {passedCount(trace)}/{trace.steps.length} · {totalLatency(trace)} ms
                      {trace.breakRoom ? " · Room blocked" : ""}
                    </span>
                  </button>
                ))}
              </div>
              <div className="timeline">
                {selected ? (
                  <>
                    <div className="scoreline">
                      <strong className={selected.passed ? "pass" : "fail"}>
                        {selected.passed ? "Passed" : "Failed"} · {passedCount(selected)}/{selected.steps.length}
                      </strong>
                      <span className="ms">{totalLatency(selected)} ms</span>
                    </div>
                    {selected.transcript ? <p className="heard">“{selected.transcript}”</p> : null}
                    <div aria-live="polite">
                      {visibleSteps.map((step, index) => (
                        <article className={step.pass ? "step" : "step fail"} key={`${selected.id}-${step.name}-${index}`}>
                          <div className="n">{String(index + 1).padStart(2, "0")}</div>
                          <h3>{step.name}</h3>
                          <div className="step-meta">
                            <span className="ms">{step.latencyMs} ms</span>
                            <span className={step.pass ? "chip pass" : "chip fail"}>{step.pass ? "Pass" : "Fail"}</span>
                          </div>
                          <p>{step.detail}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="empty">Select a run.</p>
                )}
              </div>
              <div className="compare-col">
                {selected ? (
                  <>
                    <Snapshot title="Before" reservation={selected.before} />
                    <Snapshot title="After" reservation={selected.after} before={selected.before} request={selected.request} />
                  </>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Snapshot({
  title,
  reservation,
  before,
  request,
}: {
  title: string;
  reservation: Reservation;
  before?: Reservation;
  request?: Trace["request"];
}) {
  const departTone = !before
    ? ""
    : request?.depart && reservation.depart !== request.depart
      ? "missed"
      : reservation.depart !== before.depart
        ? "changed"
        : "";
  const lateTone = !before
    ? ""
    : request?.lateCheckout !== null &&
        request?.lateCheckout !== undefined &&
        reservation.lateCheckout !== request.lateCheckout
      ? "missed"
      : reservation.lateCheckout !== before.lateCheckout
        ? "changed"
        : "";

  return (
    <div className="snap">
      <h3>{title}</h3>
      <dl>
        <div className="row">
          <dt>Guest</dt>
          <dd>{reservation.guest}</dd>
        </div>
        <div className="row">
          <dt>Room</dt>
          <dd>{reservation.room}</dd>
        </div>
        <div className="row">
          <dt>Arrive</dt>
          <dd>{reservation.arrive === "—" ? "—" : formatStay(reservation.arrive)}</dd>
        </div>
        <div className={departTone ? `row ${departTone}` : "row"}>
          <dt>Depart</dt>
          <dd>{reservation.depart === "—" ? "—" : formatStay(reservation.depart)}</dd>
        </div>
        <div className={lateTone ? `row ${lateTone}` : "row"}>
          <dt>Late</dt>
          <dd>{reservation.confirmation === "—" ? "—" : lateLabel(reservation.lateCheckout)}</dd>
        </div>
      </dl>
    </div>
  );
}
