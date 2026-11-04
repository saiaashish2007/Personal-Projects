import { extractWithClaude } from "../../../lib/extract";
import type { IngestRequest, SourceKind } from "../../../lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isKind(value: unknown): value is SourceKind {
  return value === "meeting" || value === "slack";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with text." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send a JSON body with text." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Paste a transcript or a Slack thread first." }, { status: 400 });
  }
  if (text.length > 50000) {
    return NextResponse.json({ error: "That paste is too long. Keep it under 50,000 characters." }, { status: 400 });
  }
  const input: IngestRequest = {
    text,
    title: typeof record.title === "string" ? record.title : undefined,
    kind: isKind(record.kind) ? record.kind : undefined,
    date: typeof record.date === "string" ? record.date : undefined,
    sourceId: typeof record.sourceId === "string" ? record.sourceId : undefined,
  };
  const result = await extractWithClaude(input);
  return NextResponse.json(result);
}
