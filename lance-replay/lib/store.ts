import fs from "fs";
import path from "path";
import { SEED, type Reservation, type Trace } from "./types";

type Memory = {
  reservation: Reservation;
  traces: Trace[];
};

const globalStore = globalThis as typeof globalThis & {
  __harborPine?: Memory;
};

const dataDir = path.join(process.cwd(), "data");
const tracesDir = path.join(dataDir, "traces");
const reservationPath = path.join(dataDir, "reservation.json");

function onVercel() {
  return Boolean(process.env.VERCEL);
}

function readReservationFile(): Reservation | null {
  try {
    return JSON.parse(fs.readFileSync(reservationPath, "utf8")) as Reservation;
  } catch {
    return null;
  }
}

function readTraceFiles(): Trace[] {
  try {
    return fs
      .readdirSync(tracesDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(tracesDir, name), "utf8")) as Trace)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  } catch {
    return [];
  }
}

function memory(): Memory {
  if (!globalStore.__harborPine) {
    globalStore.__harborPine = {
      reservation: onVercel() ? { ...SEED } : (readReservationFile() ?? { ...SEED }),
      traces: onVercel() ? [] : readTraceFiles(),
    };
  }
  return globalStore.__harborPine;
}

export function getReservation(): Reservation {
  return memory().reservation;
}

export function saveReservation(reservation: Reservation) {
  const next = { ...reservation };
  memory().reservation = next;
  if (onVercel()) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(reservationPath, JSON.stringify(next, null, 2));
}

export function listTraces(): Trace[] {
  return memory().traces;
}

export function saveTrace(trace: Trace) {
  memory().traces.unshift(trace);
  if (onVercel()) return;
  fs.mkdirSync(tracesDir, { recursive: true });
  fs.writeFileSync(path.join(tracesDir, `${trace.id}.json`), JSON.stringify(trace, null, 2));
}
