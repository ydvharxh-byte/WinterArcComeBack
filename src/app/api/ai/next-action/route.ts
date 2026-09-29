import { getNextBestAction } from "@/server/engine";

export const dynamic = "force-dynamic";

/** GET /api/ai/next-action — deterministic next-best-action (no AI call). */
export async function GET() {
  const action = await getNextBestAction();
  return Response.json({ action });
}
