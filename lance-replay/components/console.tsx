"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock, formatStay } from "@/lib/dates";
import { readStoredTraces, writeStoredTraces } from "@/lib/local-traces";
import {
  SEED,
  TARGET_DEPART,
  type Reservation,
  type Trace,
} from "@/lib/types";

const LINES = [
  { speaker: "Agent" as const, text: "Harbor & Pine, front desk." },
  {
    speaker: "Guest" as const,
    text: "Hi, this is Alex Chen, confirmation R-1042. Please move checkout from March 15 to March 17 and add late checkout.",
  },
  {
    speaker: "Agent" as const,
    text: "I have confirmation R-1042 for Alex Chen, departing March 15. I'll move checkout to March 17 and add late checkout.",
  },
  { speaker: "Guest" as const, text: "That's right. Thank you." },
  { speaker: "Agent" as const, text: "One moment. I'll update the reservation." },
];

type Phase = "idle" | "playing" | "running" | "ready";

function pause(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function passedCount(trace: Trace) {
  return trace.steps.filter((step) => step.pass).length;
}

function totalLatency(trace: Trace) {
  return trace.steps.reduce((sum, step) => sum + step.latencyMs, 0);
}

function lateLabel(value: boolean) {
  return value ? "Yes" : "No";
}

async function readBody(response: Response): Promise<{
  error?: string;
  reservation?: Reservation;
  trace?: Trace;
  traces?: Trace[];
}> {
  try {
    return (await response.json()) as {
      error?: string;
      reservation?: Reservation;
      trace?: Trace;
      traces?: Trace[];
    };
  } catch {
    throw new Error("The property system returned an unreadable response.");
  }
}

export function Console() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const [breakRoom, setBreakRoom] = useState(false);
  const [reservation, setReservation] = useState<Reservation>(SEED);
  const [draft, setDraft] = useState<Reservation>(SEED);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(99);
  const [animateId, setAnimateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const breakRef = useRef(breakRoom);
  const phaseRef = useRef(phase);
  const runningRef = useRef(false);
  const editedRef = useRef(false);
  breakRef.current = breakRoom;
  phaseRef.current = phase;

  const dirty = !sameRecord(draft, reservation);
  const selected = traces.find((trace) => trace.id === selectedId) ?? null;
  const busy = phase === "playing" || phase === "running" || saving;

  useEffect(() => {
    let active = true;
    const stored = readStoredTraces();
    if (stored.length > 0) {
      setTraces(stored);
      setSelectedId(stored[0]?.id ?? null);
    }

    void (async () => {
      try {
        const reservationRes = await fetch("/api/reservation", { cache: "no-store" });
        const reservationBody = await readBody(reservationRes);
        if (!active) return;
        if (!reservationRes.ok) throw new Error(reservationBody.error || "Could not load the reservation.");
        if (reservationBody.reservation) {
          setReservation(reservationBody.reservation);
          if (!editedRef.current) setDraft(reservationBody.reservation);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not reach the property system.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!animateId) return;
    setRevealed(0);
    const timers = [1, 2, 3, 4, 5].map((count, index) =>
      window.setTimeout(() => setRevealed(count), 110 * (index + 1)),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [animateId]);

  function updateDraft(patch: Partial<Reservation>) {
    editedRef.current = true;
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
  }

  async function executeRun() {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ breakRoom: breakRef.current }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.trace) {
        throw new Error(body.error || "The run could not be scored.");
      }
      if (body.reservation) {
        setReservation(body.reservation);
        if (!editedRef.current) setDraft(body.reservation);
      }
      const trace = body.trace;
      setTraces((current) => {
        const next = [trace, ...current.filter((item) => item.id !== trace.id)].slice(0, 30);
        writeStoredTraces(next);
        return next;
      });
      setSelectedId(trace.id);
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        setAnimateId(null);
        setRevealed(99);
      } else {
        setRevealed(0);
        setAnimateId(trace.id);
      }
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not be scored.");
      setPhase("ready");
    } finally {
      runningRef.current = false;
    }
  }

  async function playCall() {
    if (phaseRef.current === "playing" || phaseRef.current === "running" || dirty) return;
    setError(null);
    setPhase("playing");
    setShown(0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pauses = reduce ? [0, 0, 0, 0, 0] : [280, 1500, 1000, 800, 700];
    for (let index = 0; index < LINES.length; index += 1) {
      await pause(pauses[index] ?? 700);
      setShown(index + 1);
    }
    await pause(reduce ? 0 : 550);
    await executeRun();
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
        body: JSON.stringify({
          guest: draft.guest,
          room: draft.room,
          arrive: draft.arrive,
          depart: draft.depart,
          lateCheckout: draft.lateCheckout,
        }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.reservation) {
        throw new Error(body.error || "Could not save the reservation.");
      }
      editedRef.current = false;
      setReservation(body.reservation);
      setDraft(body.reservation);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the reservation.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreSeed() {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/reservation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SEED),
      });
      const body = await readBody(response);
      if (!response.ok || !body.reservation) {
        throw new Error(body.error || "Could not restore the stay.");
      }
      editedRef.current = false;
      setReservation(body.reservation);
      setDraft(body.reservation);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not restore the stay.");
    } finally {
      setSaving(false);
    }
  }

  function chooseRun(id: string) {
    setSelectedId(id);
    setAnimateId(null);
    setRevealed(99);
  }

  const callStatus =
    phase === "playing" ? "Live" : phase === "running" ? "Updating" : shown > 0 ? "Call ended" : "Waiting";

  const visibleSteps = selected ? selected.steps.slice(0, revealed) : [];

  return (
    <main className="shell">
      <header className="top">
        <div className="identity">
          <div className="brand">
            <div className="mark" aria-hidden="true">
              H&P
            </div>
            <div>
              <div className="hotel">Harbor & Pine</div>
              <div className="muted">Front office</div>
            </div>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="headline">
            <h1>Guest Call → PMS Action</h1>
            <p>Score each step the agent takes in the reservation system.</p>
          </div>
        </div>
        <div className="actions">
          <label className={breakRoom ? "break on" : "break"}>
            <input
              type="checkbox"
              checked={breakRoom}
              onChange={(event) => setBreakRoom(event.target.checked)}
            />
            Break the room
          </label>
          <button
            type="button"
            className="quiet"
            onClick={() => void executeRun()}
            disabled={busy || dirty}
          >
            {traces.length > 0 ? "Replay" : "Run agent"}
          </button>
          <button type="button" className="primary" onClick={() => void playCall()} disabled={busy || dirty}>
            {phase === "playing" ? "On the call" : phase === "running" ? "Scoring" : "Play call"}
          </button>
        </div>
      </header>

      <div className="board">
        <section className="panel call" aria-label="Call">
          <div className="panel-head">
            <div>
              <p className="kicker">Call</p>
              <h2>Front desk</h2>
            </div>
            <div className={phase === "playing" ? "live on" : "live"}>
              <span className="dot" aria-hidden="true" />
              {callStatus}
            </div>
          </div>
          <div className="transcript" aria-live="polite">
            {shown === 0 ? (
              <p className="empty">
                Play the call. Alex Chen will ask to move checkout on confirmation R-1042 from March 15 to March 17 and add late checkout.
              </p>
            ) : (
              LINES.slice(0, shown).map((line) => (
                <div className="line" key={line.text}>
                  <div className={line.speaker === "Agent" ? "who agent" : "who"}>{line.speaker}</div>
                  <p>{line.text}</p>
                </div>
              ))
            )}
          </div>
          {shown >= 2 ? (
            <div className="request">
              <span className="label">Request</span>
              <span className="pill">R-1042</span>
              <span className="pill">Alex Chen</span>
              <span className="pill">Depart Mar 17</span>
              <span className="pill">Late checkout</span>
            </div>
          ) : null}
          {phase === "running" ? <p className="working">Updating the reservation…</p> : null}
        </section>

        <section className="panel reservation" aria-label="Reservation">
          <div className="panel-head">
            <div>
              <p className="kicker">Property system</p>
              <h2>Reservation</h2>
            </div>
          </div>
          <div className="confirm">
            <strong>{reservation.confirmation}</strong>
            <span className={reservation.status === "Modified" ? "status modified" : "status"}>
              {reservation.status}
            </span>
          </div>
          <div className="fields">
            <label className="field">
              Guest
              <input
                type="text"
                value={draft.guest}
                maxLength={80}
                disabled={busy}
                onChange={(event) => updateDraft({ guest: event.target.value })}
              />
            </label>
            <label className="field">
              Room
              <input
                type="text"
                value={draft.room}
                maxLength={40}
                disabled={busy}
                onChange={(event) => updateDraft({ room: event.target.value })}
              />
            </label>
            <label className="field">
              Arrive
              <input
                type="date"
                value={draft.arrive}
                disabled={busy}
                onChange={(event) => updateDraft({ arrive: event.target.value })}
              />
            </label>
            <label className="field">
              Depart
              <input
                type="date"
                value={draft.depart}
                disabled={busy}
                onChange={(event) => updateDraft({ depart: event.target.value })}
              />
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
            <button type="button" className="link" onClick={() => void restoreSeed()} disabled={busy}>
              Restore original stay
            </button>
          </div>
          {dirty ? <p className="hint">Save changes before the next run. The agent reads the saved reservation.</p> : null}
          {formError ? <p className="form-error">{formError}</p> : null}
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
            <p className="empty">
              No scored runs yet. Play the call and the agent will look up R-1042, move checkout to March 17, and add late checkout.
              {breakRoom ? " Break the room is on, so the departure update will fail." : ""}
            </p>
          ) : (
            <div className="trace-grid">
              <div className="runs-col">
                <div className="runs">
                  {traces.map((trace) => (
                    <button
                      type="button"
                      key={trace.id}
                      className={trace.id === selectedId ? "run active" : "run"}
                      onClick={() => chooseRun(trace.id)}
                    >
                      <span className="run-top">
                        <span className={trace.passed ? "chip pass" : "chip fail"}>
                          {trace.passed ? "Pass" : "Fail"}
                        </span>
                        <span className="time">{formatClock(trace.startedAt)}</span>
                      </span>
                      <span className="run-sub">
                        {passedCount(trace)}/5 · {totalLatency(trace)} ms
                        {trace.breakRoom ? " · Room blocked" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="timeline">
                {selected ? (
                  <>
                    <div className="scoreline">
                      <strong className={selected.passed ? "pass" : "fail"}>
                        {selected.passed ? "Passed" : "Failed"} · {passedCount(selected)}/5
                      </strong>
                      <span className="ms">{totalLatency(selected)} ms</span>
                    </div>
                    <div aria-live="polite">
                      {visibleSteps.map((step, index) => (
                        <article className={step.pass ? "step" : "step fail"} key={`${selected.id}-${step.name}`}>
                          <div className="n">{String(index + 1).padStart(2, "0")}</div>
                          <h3>{step.name}</h3>
                          <div className="step-meta">
                            <span className="ms">{step.latencyMs} ms</span>
                            <span className={step.pass ? "chip pass" : "chip fail"}>
                              {step.pass ? "Pass" : "Fail"}
                            </span>
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
                    <Snapshot title="After" reservation={selected.after} before={selected.before} />
                  </>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
      <p className="footnote">Harbor & Pine · mock front office · runs saved in this browser</p>
    </main>
  );
}

function Snapshot({
  title,
  reservation,
  before,
}: {
  title: string;
  reservation: Reservation;
  before?: Reservation;
}) {
  const departTone = !before
    ? ""
    : reservation.depart !== TARGET_DEPART
      ? "missed"
      : reservation.depart !== before.depart
        ? "changed"
        : "";
  const lateTone = !before
    ? ""
    : !reservation.lateCheckout
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
          <dd>{formatStay(reservation.arrive)}</dd>
        </div>
        <div className={departTone ? `row ${departTone}` : "row"}>
          <dt>Depart</dt>
          <dd>{formatStay(reservation.depart)}</dd>
        </div>
        <div className={lateTone ? `row ${lateTone}` : "row"}>
          <dt>Late</dt>
          <dd>{lateLabel(reservation.lateCheckout)}</dd>
        </div>
      </dl>
    </div>
  );
}
