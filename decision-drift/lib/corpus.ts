import { byRecordOrder } from "./format";
import type { Decision, Source, SourceKind } from "./types";

type RawDecision = {
  id?: unknown;
  position?: unknown;
  statement?: unknown;
  owner?: unknown;
  speaker?: unknown;
  rationale?: unknown;
  date?: unknown;
  sourceQuote?: unknown;
  topic?: unknown;
  commitment?: unknown;
  shortLabel?: unknown;
};

type RawConversation = {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  date?: unknown;
  raw?: unknown;
  decisions?: unknown;
};

export type LoadedCorpus = {
  company: string;
  decisions: Decision[];
  sources: Source[];
};

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function asKind(value: unknown, label: string): SourceKind {
  if (value === "meeting" || value === "slack") return value;
  throw new Error(`Bad source kind on ${label}`);
}

function asDate(value: unknown, label: string): string {
  const date = asString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad date on ${label}`);
  return date;
}

export function loadCorpus(input: unknown): LoadedCorpus {
  if (!input || typeof input !== "object") throw new Error("Corpus is not an object");
  const record = input as { company?: unknown; conversations?: unknown };
  const company = asString(record.company, "company");
  if (!Array.isArray(record.conversations)) throw new Error("Corpus has no conversations");

  const decisions: Decision[] = [];
  const sources: Source[] = [];
  const seenDecisions = new Set<string>();
  const seenSources = new Set<string>();

  for (const item of record.conversations as RawConversation[]) {
    const sourceId = asString(item.id, "conversation id");
    if (seenSources.has(sourceId)) throw new Error(`Duplicate source ${sourceId}`);
    seenSources.add(sourceId);
    const source: Source = {
      id: sourceId,
      title: asString(item.title, `${sourceId} title`),
      kind: asKind(item.kind, sourceId),
      date: asDate(item.date, sourceId),
      raw: asString(item.raw, `${sourceId} raw`),
    };
    sources.push(source);
    if (!Array.isArray(item.decisions)) throw new Error(`No decisions on ${sourceId}`);

    for (const raw of item.decisions as RawDecision[]) {
      const id = asString(raw.id, `${sourceId} decision id`);
      if (seenDecisions.has(id)) throw new Error(`Duplicate decision ${id}`);
      seenDecisions.add(id);
      if (typeof raw.position !== "number") throw new Error(`Bad position on ${id}`);
      const quote = asString(raw.sourceQuote, `${id} quote`);
      if (!source.raw.includes(quote)) {
        throw new Error(`Quote for ${id} is not in ${sourceId}`);
      }
      decisions.push({
        id,
        position: raw.position,
        statement: asString(raw.statement, `${id} statement`),
        owner: asString(raw.owner, `${id} owner`),
        speaker: asString(raw.speaker, `${id} speaker`),
        rationale: asString(raw.rationale, `${id} rationale`),
        date: asDate(raw.date, id),
        sourceQuote: quote,
        sourceTitle: source.title,
        sourceKind: source.kind,
        sourceId: source.id,
        topic: asString(raw.topic, `${id} topic`),
        commitment: asString(raw.commitment, `${id} commitment`),
        shortLabel: asString(raw.shortLabel, `${id} shortLabel`),
      });
    }
  }

  decisions.sort(byRecordOrder);
  sources.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
  return { company, decisions, sources };
}
