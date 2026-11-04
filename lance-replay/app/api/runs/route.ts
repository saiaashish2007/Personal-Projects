import { runAgent } from "@/lib/agent";
import { getReservation, listTraces } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  return Response.json(
    { traces: listTraces(), reservation: getReservation() },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  let breakRoom = false;
  try {
    const body = (await request.json()) as { breakRoom?: unknown };
    breakRoom = Boolean(body?.breakRoom);
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400, headers: noStore });
  }

  const trace = await runAgent(breakRoom);
  return Response.json(
    { trace, reservation: getReservation() },
    { headers: noStore },
  );
}
