import { db } from "@/db";
import { settings } from "@/db/schema";
import { getConfig, listModels } from "@/server/ai/llm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** GET /api/ai/models — provider catalog + current selection (for setup). */
export async function GET() {
  const cfg = await getConfig();
  const catalog = await listModels();
  const models = Array.isArray(catalog) ? catalog.map((m) => m.id).slice(0, 50) : [];
  return Response.json({
    hasKey: cfg.hasKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    configured: cfg.configured,
    models,
    catalogError: Array.isArray(catalog) || !cfg.hasKey ? null : catalog.error,
  });
}

/** PATCH /api/ai/models {model} — persist the chosen model when AI_MODEL env isn't set. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = z.object({ model: z.string().trim().min(1).max(100) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "model is required" }, { status: 400 });
  await db
    .insert(settings)
    .values({ key: "aiModel", value: parsed.data.model })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data.model } });
  revalidatePath("/", "layout");
  return Response.json({ ok: true, model: parsed.data.model, envOverride: Boolean(process.env.AI_MODEL) });
}
