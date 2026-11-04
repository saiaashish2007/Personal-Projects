import type { CallRequest } from "./types";

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateFromPhrase(phrase: string, yearFallback: number): string | null {
  const iso = phrase.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = phrase.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i,
  );
  if (!named) return null;
  const month = MONTH_INDEX[named[1].slice(0, 3).toLowerCase()];
  return isoFromParts(named[3] ? Number(named[3]) : yearFallback, month, Number(named[2]));
}

function confirmationFrom(text: string): string | null {
  const match = text.match(/\bR[-\s]?(\d{3,5})\b/i);
  return match ? `R-${match[1]}` : null;
}

function guestFrom(text: string): string | null {
  const match = text.match(
    /\b(?:this is|i am|i'm|im|my name is)\s+([a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+){0,2})/i,
  );
  if (!match) return null;
  const cleaned = match[1].replace(/\s+(confirmation|on|calling|here|please)$/i, "").trim();
  if (!cleaned || /^(the|a|an)$/i.test(cleaned)) return null;
  return titleCase(cleaned);
}

function departFrom(text: string): string | null {
  const aimed = text.match(
    /\b(?:to|until|through|till)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?|20\d{2}-\d{2}-\d{2})/i,
  );
  if (aimed) {
    const parsed = dateFromPhrase(aimed[1], 2026);
    if (parsed) return parsed;
  }
  const dates = [
    ...text.matchAll(
      /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?|20\d{2}-\d{2}-\d{2})\b/gi,
    ),
  ];
  if (dates.length === 0) return null;
  return dateFromPhrase(dates[dates.length - 1][0], 2026);
}

function lateFrom(text: string): boolean | null {
  if (/\b(no late checkout|remove late checkout|cancel late checkout|without late checkout|drop late checkout)\b/i.test(text)) {
    return false;
  }
  if (/\blate checkout\b/i.test(text)) return true;
  return null;
}

export function parseCall(raw: string): CallRequest {
  const text = raw.replace(/\s+/g, " ").trim();
  return {
    raw: text,
    confirmation: confirmationFrom(text),
    guest: guestFrom(text),
    depart: departFrom(text),
    lateCheckout: lateFrom(text),
  };
}
