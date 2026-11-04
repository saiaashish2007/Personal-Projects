import { getReservation, saveReservation, saveTrace } from "./store";
import {
  CONFIRMATION,
  STEP_NAMES,
  TARGET_DEPART,
  TARGET_GUEST,
  type Reservation,
  type StepResult,
  type Trace,
} from "./types";

const STEP_DELAYS_MS = [72, 48, 96, 58, 64];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(reservation: Reservation): Reservation {
  return { ...reservation };
}

function sameGuest(name: string) {
  return name.trim().toLowerCase() === TARGET_GUEST.toLowerCase();
}

async function record(
  name: string,
  delayMs: number,
  run: () => { pass: boolean; detail: string },
): Promise<StepResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  await wait(delayMs);
  const outcome = run();
  return {
    name,
    startedAt,
    latencyMs: Date.now() - started,
    pass: outcome.pass,
    detail: outcome.detail,
  };
}

export async function runAgent(breakRoom: boolean): Promise<Trace> {
  const before = clone(getReservation());
  const working = clone(before);
  const steps: StepResult[] = [];
  let nameOk = false;

  steps.push(
    await record(STEP_NAMES[0], STEP_DELAYS_MS[0], () => {
      const found = working.confirmation === CONFIRMATION;
      return {
        pass: found,
        detail: found
          ? `Found ${working.confirmation} · ${working.guest} · ${working.room} · arrive ${working.arrive} · depart ${working.depart}`
          : "No reservation matched R-1042.",
      };
    }),
  );

  steps.push(
    await record(STEP_NAMES[1], STEP_DELAYS_MS[1], () => {
      nameOk = sameGuest(working.guest);
      return {
        pass: nameOk,
        detail: nameOk
          ? `Guest on file is ${working.guest}.`
          : `Guest on file is "${working.guest}". Expected ${TARGET_GUEST}.`,
      };
    }),
  );

  steps.push(
    await record(STEP_NAMES[2], STEP_DELAYS_MS[2], () => {
      if (!nameOk) {
        return {
          pass: false,
          detail: "Departure not updated. Guest name did not match.",
        };
      }
      if (breakRoom) {
        return {
          pass: false,
          detail: `Room blocked. ${working.room} cannot extend through ${TARGET_DEPART}. Departure left at ${working.depart}.`,
        };
      }
      const previous = working.depart;
      working.depart = TARGET_DEPART;
      return {
        pass: true,
        detail:
          previous === TARGET_DEPART
            ? `Departure confirmed at ${TARGET_DEPART}.`
            : `Departure moved from ${previous} to ${TARGET_DEPART}.`,
      };
    }),
  );

  steps.push(
    await record(STEP_NAMES[3], STEP_DELAYS_MS[3], () => {
      if (!nameOk) {
        return {
          pass: false,
          detail: "Late checkout not added. Guest name did not match.",
        };
      }
      const already = working.lateCheckout;
      working.lateCheckout = true;
      return {
        pass: true,
        detail: already ? "Late checkout is already on the reservation." : "Late checkout added.",
      };
    }),
  );

  const changed =
    working.depart !== before.depart || working.lateCheckout !== before.lateCheckout;
  if (changed) {
    working.status = "Modified";
    saveReservation(working);
  }

  steps.push(
    await record(STEP_NAMES[4], STEP_DELAYS_MS[4], () => {
      const seen = clone(getReservation());
      const matches =
        seen.confirmation === CONFIRMATION &&
        sameGuest(seen.guest) &&
        seen.depart === TARGET_DEPART &&
        seen.lateCheckout === true;
      const late = seen.lateCheckout ? "yes" : "no";
      return {
        pass: matches,
        detail: matches
          ? `Confirmed ${seen.confirmation} · ${seen.guest} · depart ${seen.depart} · late checkout yes.`
          : `On file: ${seen.guest} · depart ${seen.depart} · late checkout ${late}. Expected ${TARGET_GUEST} · depart ${TARGET_DEPART} · late checkout yes.`,
      };
    }),
  );

  const trace: Trace = {
    id: crypto.randomUUID(),
    startedAt: steps[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    breakRoom,
    passed: steps.every((step) => step.pass),
    steps,
    before,
    after: clone(getReservation()),
  };

  saveTrace(trace);
  return trace;
}
