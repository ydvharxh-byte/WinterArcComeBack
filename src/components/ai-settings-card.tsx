"use client";

import { cn } from "@/lib/utils";
import { Check, Cpu, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader, Select } from "./ui";

interface ModelResponse {
  hasKey: boolean;
  baseUrl: string;
  model: string | null;
  configured: boolean;
  models: string[];
  catalogError: string | null;
}

export function AiSettingsCard() {
  const [data, setData] = useState<ModelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/models", { cache: "no-store" });
      if (res.ok) {
        const d = (await res.json()) as ModelResponse;
        setData(d);
        setSelected(d.model ?? "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetch("/api/ai/models", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d: ModelResponse | null) => {
        if (!ignore && d) {
          setData(d);
          setSelected(d.model ?? "");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await fetch("/api/ai/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: selected }),
    });
    setSaving(false);
    if (res.ok) {
      const d = (await res.json()) as { envOverride?: boolean };
      toast.success(d.envOverride ? "Saved (warning: AI_MODEL env overrides this choice)" : "Model saved — tutor is live");
      void load();
    } else toast.error("Could not save model");
  };

  const status = !data ? null
    : data.configured ? { label: "Online", cls: "green" as const }
    : !data.hasKey ? { label: "Missing key", cls: "amber" as const }
    : !data.model ? { label: "Pick a model", cls: "amber" as const }
    : { label: "Check config", cls: "red" as const };

  return (
    <Card>
      <CardHeader title="AI provider" icon={<Cpu />} sub="OpenAI-compatible gateway — key lives server-side, never in the browser" className="pb-4" />
      <div className="space-y-4 px-5 pb-5">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-mute"><Loader2 className="size-3.5 animate-spin" /> Checking provider…</div>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={status!.cls}>{status!.label}</Badge>
              <span className="text-mute tabular-nums">{data.baseUrl.replace("https://", "")}</span>
              {data.model && <span className="rounded-md bg-panel2 px-2 py-0.5 font-medium text-fog">{data.model}</span>}
              <button onClick={() => void load()} className="ml-auto text-dim hover:text-fog cursor-pointer" title="Re-check"><RefreshCw className="size-3.5" /></button>
            </div>

            {!data.hasKey && (
              <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs leading-relaxed text-warning">
                No <code className="rounded bg-panel2 px-1">AI_API_KEY</code> in the server environment. Add it to your deployment secrets to bring the tutor online. The key is never exposed to the browser.
              </p>
            )}

            {data.hasKey && data.models.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Model catalog</p>
                <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Choose a model…</option>
                  {data.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
                <Button size="sm" onClick={save} loading={saving} disabled={!selected || selected === data.model}>
                  <Check /> Use this model
                </Button>
              </div>
            )}
            {data.hasKey && data.catalogError && data.models.length === 0 && (
              <p className="text-xs text-mute">Catalog unavailable ({data.catalogError}) — set <code className="rounded bg-panel2 px-1">AI_MODEL</code> in the environment directly.</p>
            )}
          </>
        ) : (
          <p className="text-xs text-mute">Could not reach the AI status endpoint.</p>
        )}
      </div>
    </Card>
  );
}
