import { tutorSessions } from "@/db/schema";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { clientKey, rateLimit } from "@/server/ai/rate-limit";
import { z } from "zod";
import { sendTutorMessage } from "@/server/tutor";

export const dynamic = "force-dynamic";

/** POST /api/ai/tutor — one complete tutor turn (non-streaming variant). */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "ai/tutor"), 30, 60_000);
  if (!rl.allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({ sessionId: z.number().int(), text: z.string().trim().min(1).max(6000) })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: "sessionId and text are required" }, { status: 400 });

  const [session] = await db.select().from(tutorSessions).where(eq(tutorSessions.id, parsed.data.sessionId));
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const res = await sendTutorMessage(parsed.data);
  if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
  return Response.json(res.data);
}
