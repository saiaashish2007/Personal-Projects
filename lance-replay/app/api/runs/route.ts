import { runAgent } from "@/lib/agent";
import { listReservations, replaceBook, saveTrace } from "@/lib/store";
import type { Reservation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function isReservation(value: unknown): value is Reservation {
  if (!value || typeof value !== "object") return false;
  const row = value as Reservation;
  return (
    typeof row.confirmation === "string" &&
    typeof row.guest === "string" &&
    typeof row.room === "string" &&
    typeof row.arrive === "string" &&
    typeof row.depart === "string" &&
    typeof row.lateCheckout === "boolean"
  );
}

export async function GET() {
  return Response.json(
    { reservations: listReservations() },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  let breakRoom = false;
  let transcript = "";
  let incoming: Reservation[] | null = null;
  try {
    const body = (await request.json()) as {
      breakRoom?: unknown;
      transcript?: unknown;
      reservations?: unknown;
    };
    breakRoom = Boolean(body?.breakRoom);
    transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    if (Array.isArray(body?.reservations) && body.reservations.every(isReservation)) {
      incoming = body.reservations;
    }
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400, headers: noStore });
  }

  if (!transcript) {
    return Response.json({ error: "The call transcript is empty." }, { status: 400, headers: noStore });
  }
  if (transcript.length > 4000) {
    return Response.json({ error: "That call is too long." }, { status: 400, headers: noStore });
  }
  if (incoming) replaceBook(incoming);

  const trace = await runAgent({ transcript, breakRoom });
  saveTrace(trace);
  return Response.json(
    { trace, reservations: listReservations() },
    { headers: noStore },
  );
}
