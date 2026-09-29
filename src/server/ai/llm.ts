/**
 * Central AI gateway — OpenAI-compatible, provider-agnostic.
 *
 * Configuration (server environment only — NEVER NEXT_PUBLIC):
 *   AI_API_KEY   — provider key (server secret)
 *   AI_BASE_URL  — defaults to BazaarLink (https://api.bazaarlink.ai/v1)
 *   AI_MODEL     — model id (required; no default is assumed)
 *
 * A keysafe rule runs over every error message: provider secrets are
 * stripped before an error ever reaches a log or the client.
 */
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const DEFAULT_BASE_URL = "https://api.bazaarlink.ai/v1";

function stripSecrets(text: string): string {
  const key = process.env.AI_API_KEY;
  let out = text;
  if (key && key.length > 4) out = out.split(key).join("[redacted]");
  out = out.replace(/Bearer\s+[A-Za-z0-9_\-./+=]+/gi, "Bearer [redacted]");
  out = out.replace(/sk-[A-Za-z0-9_\-]{6,}/g, "[redacted]");
  return out;
}

/** The settings table may hold a UI-selected model when AI_MODEL env is absent. */
async function modelFromSettings(): Promise<string | null> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, "aiModel"));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export interface GatewayConfig {
  configured: boolean;
  hasKey: boolean;
  model: string | null;
  baseUrl: string;
}

export async function getConfig(): Promise<GatewayConfig> {
  const hasKey = Boolean(process.env.AI_API_KEY);
  const baseUrl = (process.env.AI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? (await modelFromSettings());
  return { configured: hasKey && Boolean(model), hasKey, model: model ?? null, baseUrl };
}

export function isAiConfiguredSync(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
}

export interface ModelInfo {
  id: string;
}

/** Inspect the provider's model catalog (OpenAI-compatible GET /models). */
export async function listModels(): Promise<ModelInfo[] | { error: string }> {
  const key = process.env.AI_API_KEY;
  if (!key) return { error: "not_configured" };
  const { baseUrl } = await getConfig();
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: stripSecrets(`Catalog error ${res.status}`) };
    const data = (await res.json()) as { data?: { id?: string }[] };
    const models = (data.data ?? []).filter((m) => m.id).map((m) => ({ id: m.id! }));
    if (models.length === 0) return { error: "Catalog returned no models" };
    return models;
  } catch (e) {
    return { error: stripSecrets(`Could not reach provider (${e instanceof Error ? e.message : "network"})`) };
  }
}

export async function callLlm(messages: LlmMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<{ content: string } | { error: string }> {
  const cfg = await getConfig();
  if (!cfg.hasKey) return { error: "not_configured" };
  if (!cfg.model) return { error: "model_missing" };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts?.temperature ?? 0.4,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    return { error: stripSecrets(`Could not reach AI provider (${e instanceof Error ? e.message : "network"})`) };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) return { error: "rate_limited" };
    return { error: stripSecrets(`AI provider error ${res.status}: ${body.slice(0, 160)}`) };
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return { error: "AI provider returned an empty response" };
  return { content };
}

/**
 * Streaming chat completion — yields text deltas (OpenAI SSE semantics).
 * Used by the tutor stream route; database mutations happen after completion.
 */
export async function callLlmStream(messages: LlmMessage[]): Promise<ReadableStream<string> | { error: string }> {
  const cfg = await getConfig();
  if (!cfg.hasKey) return { error: "not_configured" };
  if (!cfg.model) return { error: "model_missing" };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4, stream: true }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    return { error: stripSecrets(`Could not reach AI provider (${e instanceof Error ? e.message : "network"})`) };
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) return { error: "rate_limited" };
    return { error: stripSecrets(`AI provider error ${res.status}: ${body.slice(0, 160)}`) };
  }

  const upstream = res.body;
  const reader = upstream.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<string>({
    async start(controller) {
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(delta);
            } catch { /* partial json chunk — skip */ }
          }
        }
      } catch {
        // upstream aborted — close gracefully with what we have
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
