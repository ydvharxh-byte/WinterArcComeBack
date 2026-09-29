import { evaluateAnswer } from "@/server/ai/diagnostic";
import { clientKey, rateLimit } from "@/server/ai/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/ai/evaluate — run the diagnostic pipeline on one answer. */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "ai/evaluate"), 20, 60_000);
  if (!rl.allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const body = await req.json().catch(() => null);
  const res = await evaluateAnswer(body ?? {});
  if (!res.ok) {
    const status = res.error === "not_configured" || res.error === "model_missing" ? 503 : res.error?.includes("twice") ? 502 : 400;
    return Response.json({ error: res.error }, { status });
  }
  return Response.json(res.data);
}
