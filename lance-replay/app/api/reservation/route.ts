import { getReservation, saveReservation } from "@/lib/store";
import { SEED, type Reservation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET() {
  return Response.json({ reservation: getReservation() }, { headers: noStore });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400, headers: noStore });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected a reservation." }, { status: 400, headers: noStore });
  }

  const current = getReservation();
  const input = body as Record<string, unknown>;
  const guest = typeof input.guest === "string" ? input.guest.trim() : current.guest;
  const room = typeof input.room === "string" ? input.room.trim() : current.room;
  const arrive = typeof input.arrive === "string" ? input.arrive : current.arrive;
  const depart = typeof input.depart === "string" ? input.depart : current.depart;
  const lateCheckout =
    typeof input.lateCheckout === "boolean" ? input.lateCheckout : current.lateCheckout;

  if (!guest || guest.length > 80) {
    return Response.json({ error: "Enter a guest name." }, { status: 400, headers: noStore });
  }
  if (!room || room.length > 40) {
    return Response.json({ error: "Enter a room." }, { status: 400, headers: noStore });
  }
  if (!isDate(arrive) || !isDate(depart)) {
    return Response.json({ error: "Use dates as YYYY-MM-DD." }, { status: 400, headers: noStore });
  }
  if (depart < arrive) {
    return Response.json({ error: "Departure is before arrival." }, { status: 400, headers: noStore });
  }

  const restored =
    guest === SEED.guest &&
    room === SEED.room &&
    arrive === SEED.arrive &&
    depart === SEED.depart &&
    lateCheckout === SEED.lateCheckout;

  const next: Reservation = {
    confirmation: current.confirmation,
    guest,
    room,
    arrive,
    depart,
    lateCheckout,
    status: restored ? "Confirmed" : "Modified",
  };

  saveReservation(next);
  return Response.json({ reservation: next }, { headers: noStore });
}
