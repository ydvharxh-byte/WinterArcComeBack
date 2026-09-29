import { generateDailyPlan } from "@/server/engine";
import { callLlm } from "@/server/ai/llm";
import { clientKey, rateLimit } from "@/server/ai/rate-limit";
import { buildStudentContext } from "@/server/ai/context";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/plan {date}
 * Deterministic scheduling runs first; AI only explains the plan
 * (degrades gracefully when the provider is absent).
 */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "ai/plan"), 6, 60_000);
  if (!rl.allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const body = await req.json().catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(today) }).safeParse(body ?? {});
  const date = parsed.success ? parsed.data.date : today;

  const plan = await generateDailyPlan(date);
  if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });

  let explanation: string | null = null;
  if (plan.data && plan.data.created > 0) {
    const ctx = await buildStudentContext();
    const res = await callLlm([
      {
        role: "system",
        content:
          "You summarize a student's study plan in 2-3 short sentences: lead with the single highest-impact block, say why it wins, and name the quiet risk (fatigue, late revision, near exam). Plain, honest, no hype. Use only the facts provided.",
      },
      {
        role: "user",
        content: `Plan created for ${date}: ${plan.data.summary.join(" | ")}. Context highlights: ${JSON.stringify({
          exams: ctx.exams.slice(0, 3).map((e) => ({ name: e.name, days: e.daysRemaining, prep: e.preparationPct })),
          revisionDue: ctx.revisionDueToday.length,
          backlogOpen: ctx.backlog.openTopics,
        })}`,
      },
    ], { temperature: 0.3, maxTokens: 180 });
    if ("content" in res) explanation = res.content.trim();
  } else if (plan.data) {
    explanation = plan.data.summary[0];
  }

  return Response.json({ ...plan.data, explanation });
}
