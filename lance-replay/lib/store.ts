import fs from "fs";
import path from "path";
import { BOOK, type Reservation, type Trace } from "./types";

type Memory = {
  reservations: Reservation[];
  traces: Trace[];
};

const globalStore = globalThis as typeof globalThis & {
  __harborPine?: Memory;
};

const dataDir = path.join(process.cwd(), "data");
const tracesDir = path.join(dataDir, "traces");
const bookPath = path.join(dataDir, "book.json");

function onVercel() {
  return Boolean(process.env.VERCEL);
}

function cloneBook(rows: Reservation[]): Reservation[] {
  return rows.map((row) => ({ ...row }));
}

function readBookFile(): Reservation[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(bookPath, "utf8")) as Reservation[];
    return Array.isArray(parsed) && parsed.length > 0 ? cloneBook(parsed) : null;
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
      reservations: onVercel() ? cloneBook(BOOK) : (readBookFile() ?? cloneBook(BOOK)),
      traces: onVercel() ? [] : readTraceFiles(),
    };
  }
  return globalStore.__harborPine;
}

function persistBook() {
  if (onVercel()) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(bookPath, JSON.stringify(memory().reservations, null, 2));
}

export function listReservations(): Reservation[] {
  return cloneBook(memory().reservations);
}

export function replaceBook(reservations: Reservation[]) {
  memory().reservations = cloneBook(reservations);
  persistBook();
}

export function getReservation(confirmation?: string): Reservation | undefined {
  const rows = memory().reservations;
  if (!confirmation) return rows[0] ? { ...rows[0] } : undefined;
  const found = rows.find((row) => row.confirmation.toLowerCase() === confirmation.toLowerCase());
  return found ? { ...found } : undefined;
}

export function saveReservation(reservation: Reservation) {
  const rows = memory().reservations;
  const index = rows.findIndex((row) => row.confirmation.toLowerCase() === reservation.confirmation.toLowerCase());
  if (index >= 0) rows[index] = { ...reservation };
  else rows.push({ ...reservation });
  persistBook();
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
