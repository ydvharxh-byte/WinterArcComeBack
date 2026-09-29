"use client";

import type { ErrorLogDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setErrorStatus } from "@/server/tutor";
import { useAction } from "@/lib/use-action";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ShieldAlert, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, EmptyState, PageHeader, Stat } from "./ui";

const STATUS_FLOW: Record<string, string> = { unresolved: "improving", improving: "resolved", resolved: "unresolved" };

export function MistakesClient({ errors }: { errors: ErrorLogDTO[] }) {
  const { run } = useAction();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const open = errors.filter((e) => e.status !== "resolved");
  const shown = filter === "open" ? open : errors;

  const stats = {
    unresolved: errors.filter((e) => e.status === "unresolved").length,
    improving: errors.filter((e) => e.status === "improving").length,
    resolved: errors.filter((e) => e.status === "resolved").length,
    total: errors.reduce((a, e) => a + e.count, 0),
  };

  return (
    <div>
      <PageHeader
        title="Mistake Book"
        sub="Every recurring misconception, with its recurrence count — practice until they stop coming back"
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Unresolved" value={stats.unresolved} icon={<ShieldAlert />} tone="#F87171" />
        <Stat label="Improving" value={stats.improving} icon={<RefreshCw />} tone="#FBBF24" />
        <Stat label="Resolved" value={stats.resolved} icon={<CheckCircle2 />} tone="#34D399" />
      </div>

      <div className="mb-4 flex items-center gap-1 rounded-lg bg-panel p-1 w-fit">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("h-7 rounded-md px-3 text-xs font-medium capitalize transition-colors cursor-pointer", filter === f ? "bg-panel2 text-fog" : "text-mute hover:text-fog")}
          >
            {f === "open" ? `Open (${open.length})` : `All (${errors.length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={filter === "open" ? "No open mistakes" : "No mistakes recorded yet"}
          desc="When the tutor evaluates your answers, repeated errors become tracked misconceptions — and future practice targets them."
        />
      ) : (
        <div className="space-y-2">
          {shown.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-panel px-5 py-3.5">
              <Badge variant={e.status === "unresolved" ? "red" : e.status === "improving" ? "amber" : "green"}>
                {e.status}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{e.tag.replace(/-/g, " ")}</p>
                <p className="truncate text-xs text-mute">{e.detail}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-warning"><AlertTriangle className="size-3.5" /> ×{e.count}</span>
              <span className="text-xs text-dim">
                {e.subjectName ?? "General"}{e.topicName ? ` · ${e.topicName}` : ""} · {e.lastSeen}
              </span>
              <div className="flex items-center gap-1.5">
                <Link href={`/tutor?mode=practice${e.topicName ? "" : ""}`}>
                  <Button size="sm" variant="secondary"><Wand2 /> Drill it</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  title={`Mark ${STATUS_FLOW[e.status]}`}
                  onClick={() => run(() => setErrorStatus(e.id, STATUS_FLOW[e.status]), { success: "Updated" })}
                >
                  <ArrowRight /> {STATUS_FLOW[e.status]}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
