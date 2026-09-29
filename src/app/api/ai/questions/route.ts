import { generateQuestionSet, markQuestionAttempted, revealQuestion } from "@/server/ai/question-generator";
import { clientKey, rateLimit } from "@/server/ai/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** POST /api/ai/questions — adaptive set for a topic (answers server-side). */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "ai/questions"), 10, 60_000);
  if (!rl.allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      topicId: z.number().int(),
      count: z.number().int().min(1).max(8).optional(),
      sessionId: z.number().int().nullable().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: "topicId is required" }, { status: 400 });

  const res = await generateQuestionSet(parsed.data);
  if (!res.ok) return Response.json({ error: res.error }, { status: res.error === "Topic not found" ? 404 : 502 });
  return Response.json(res.data);
}

/** PATCH /api/ai/questions — mark attempted and/or reveal after attempt. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = z.object({ id: z.number().int() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "id is required" }, { status: 400 });
  await markQuestionAttempted(parsed.data.id);
  const res = await revealQuestion(parsed.data.id);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
  return Response.json(res.data);
}
