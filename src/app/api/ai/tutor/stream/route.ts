import { db } from "@/db";
import { tutorMessages, tutorSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clientKey, rateLimit } from "@/server/ai/rate-limit";
import { callLlmStream, getConfig } from "@/server/ai/llm";
import { buildTutorMessages, finalizeTutorTurn } from "@/server/tutor";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/tutor/stream
 * Streams the assistant reply as SSE (`data: <text>`), then a final
 * `done` event carrying the next action. Database writes only happen
 * after the full response is assembled (never mid-stream).
 * Events: {t:"delta",d:string} | {t:"done",d:{reply,nextAction,stageLabel}} | {t:"error",d:string}
 */
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
  const { sessionId, text } = parsed.data;

  const [session] = await db.select().from(tutorSessions).where(eq(tutorSessions.id, sessionId));
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  await db.insert(tutorMessages).values({ sessionId, role: "user", content: text });

  const cfg = await getConfig();
  const encoder = new TextEncoder();
  const sse = (obj: object) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  if (!cfg.configured) {
    return Response.json(
      { error: !cfg.hasKey ? "not_configured" : "model_missing" },
      { status: 503 }
    );
  }

  const built = await buildTutorMessages(session, text);
  if ("error" in built) return Response.json({ error: built.error }, { status: 500 });

  const upstream = await callLlmStream(built.messages);
  if ("error" in upstream) {
    return Response.json({ error: upstream.error }, { status: upstream.error === "rate_limited" ? 429 : 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += value;
          controller.enqueue(sse({ t: "delta", d: value }));
        }
        // finalize AFTER completion: parse meta, persist, apply engine updates
        try {
          const result = await finalizeTutorTurn(session, text, full, built.classification);
          controller.enqueue(sse({ t: "done", d: { reply: result.reply, nextAction: result.nextAction, stageLabel: result.stageLabel, intent: result.intent } }));
        } catch {
          controller.enqueue(sse({ t: "done", d: { reply: full, nextAction: null, stageLabel: built.classification.stageLabel, intent: built.classification.intent } }));
        }
      } catch {
        controller.enqueue(sse({ t: "error", d: "Stream interrupted by the provider" }));
      } finally {
        controller.close();
      }
    },
    cancel() {
      upstream.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
