import { parseCall } from "./parseCall";
import { getReservation, listReservations, saveReservation } from "./store";
import type { CallRequest, Reservation, StepResult, Trace } from "./types";

const STEP_DELAYS_MS = [70, 46, 90, 54, 60];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(reservation: Reservation): Reservation {
  return { ...reservation };
}

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
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

function blankReservation(): Reservation {
  return {
    confirmation: "—",
    guest: "—",
    room: "—",
    arrive: "—",
    depart: "—",
    lateCheckout: false,
    status: "Not found",
  };
}

export async function runAgent(input: { transcript: string; breakRoom: boolean }): Promise<Trace> {
  const request: CallRequest = parseCall(input.transcript);
  const breakRoom = input.breakRoom;
  const match = request.confirmation
    ? listReservations().find((item) => sameName(item.confirmation, request.confirmation ?? ""))
    : undefined;
  const before = match ? clone(match) : blankReservation();
  const working = match ? clone(match) : null;
  const steps: StepResult[] = [];
  let nameOk = false;

  steps.push(
    await record(
      request.confirmation ? `Lookup reservation ${request.confirmation}` : "Lookup reservation",
      STEP_DELAYS_MS[0],
      () => {
        if (!request.confirmation) {
          return { pass: false, detail: "The call did not include a confirmation code." };
        }
        if (!working) {
          return { pass: false, detail: `No reservation matched ${request.confirmation}.` };
        }
        return {
          pass: true,
          detail: `Found ${working.confirmation} · ${working.guest} · ${working.room} · arrive ${working.arrive} · depart ${working.depart}`,
        };
      },
    ),
  );

  steps.push(
    await record("Verify guest name", STEP_DELAYS_MS[1], () => {
      if (!working) {
        return { pass: false, detail: "Guest was not checked. The reservation was not found." };
      }
      if (!request.guest) {
        nameOk = true;
        return { pass: true, detail: `Caller did not state a name. Guest on file is ${working.guest}.` };
      }
      nameOk = sameName(working.guest, request.guest);
      return {
        pass: nameOk,
        detail: nameOk
          ? `Guest on file is ${working.guest}.`
          : `Guest on file is ${working.guest}. The caller said ${request.guest}.`,
      };
    }),
  );

  const departName = request.depart ? `Update departure to ${request.depart}` : "Departure change";
  steps.push(
    await record(departName, STEP_DELAYS_MS[2], () => {
      if (!working || !nameOk) {
        return { pass: false, detail: "Departure not updated. The lookup or guest check failed." };
      }
      if (!request.depart) {
        return { pass: true, detail: "No departure change was requested." };
      }
      if (request.depart < working.arrive) {
        return { pass: false, detail: `Requested departure ${request.depart} is before arrival ${working.arrive}.` };
      }
      if (breakRoom) {
        return {
          pass: false,
          detail: `Room blocked. ${working.room} cannot extend through ${request.depart}. Departure left at ${working.depart}.`,
        };
      }
      const previous = working.depart;
      working.depart = request.depart;
      return {
        pass: true,
        detail:
          previous === request.depart
            ? `Departure confirmed at ${request.depart}.`
            : `Departure moved from ${previous} to ${request.depart}.`,
      };
    }),
  );

  const lateName =
    request.lateCheckout === false ? "Remove late checkout" : request.lateCheckout === true ? "Add late checkout" : "Late checkout";
  steps.push(
    await record(lateName, STEP_DELAYS_MS[3], () => {
      if (!working || !nameOk) {
        return { pass: false, detail: "Late checkout was not changed. The lookup or guest check failed." };
      }
      if (request.lateCheckout === null) {
        return { pass: true, detail: "No late-checkout change was requested." };
      }
      const already = working.lateCheckout;
      working.lateCheckout = request.lateCheckout;
      if (request.lateCheckout) {
        return { pass: true, detail: already ? "Late checkout is already on the reservation." : "Late checkout added." };
      }
      return { pass: true, detail: already ? "Late checkout removed." : "Late checkout was already off." };
    }),
  );

  const changed = Boolean(
    working && (working.depart !== before.depart || working.lateCheckout !== before.lateCheckout),
  );
  if (working && changed) {
    working.status = "Modified";
    saveReservation(working);
  }

  steps.push(
    await record("Read back and confirm", STEP_DELAYS_MS[4], () => {
      if (!working || !request.confirmation) {
        return { pass: false, detail: "Nothing to read back. The reservation was not found." };
      }
      const seen = getReservation(request.confirmation) ?? working;
      const departOk = !request.depart || seen.depart === request.depart;
      const lateOk = request.lateCheckout === null || seen.lateCheckout === request.lateCheckout;
      const guestOk = !request.guest || sameName(seen.guest, request.guest);
      const matches = departOk && lateOk && guestOk && !breakRoom || (breakRoom && !request.depart && lateOk && guestOk);
      const late = seen.lateCheckout ? "yes" : "no";
      if (breakRoom && request.depart) {
        return {
          pass: false,
          detail: `On file: ${seen.guest} · depart ${seen.depart} · late checkout ${late}. Departure was blocked.`,
        };
      }
      return {
        pass: matches,
        detail: matches
          ? `Confirmed ${seen.confirmation} · ${seen.guest} · depart ${seen.depart} · late checkout ${late}.`
          : `On file: ${seen.guest} · depart ${seen.depart} · late checkout ${late}. The call asked for a different result.`,
      };
    }),
  );

  const after = request.confirmation ? (getReservation(request.confirmation) ?? before) : before;
  const trace: Trace = {
    id: crypto.randomUUID(),
    startedAt: steps[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    breakRoom,
    passed: steps.every((step) => step.pass),
    transcript: request.raw,
    request,
    steps,
    before,
    after: clone(after),
  };
  return trace;
}
