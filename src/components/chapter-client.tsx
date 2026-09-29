"use client";

import type { ChapterOverview } from "@/server/pcm";
import { cn, fmtHours } from "@/lib/utils";
import { ChevronRight, Clock, Layers, Link2 } from "lucide-react";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, Progress } from "./ui";

const IMP: Record<string, string> = { high: "text-danger", medium: "text-warning", low: "text-mute" };
const STATE_CLS: Record<string, string> = {
  MASTERED: "text-success",
  TESTING: "text-ice",
  PRACTICING: "text-accent",
  LEARNING: "text-warning",
  "REVISION DUE": "text-ice",
  "NOT STARTED": "text-dim",
};

export function ChapterClient({ c }: { c: ChapterOverview }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mute">
        <Link href="/backlog" className="hover:text-fog">Backlog</Link>
        <ChevronRight className="size-3" />
        <span style={{ color: c.subjectColor }}>{c.subjectName}</span>
      </p>
      <PageHeader title={c.name} sub={`${c.totalTopics} topics · ~${fmtHours(c.estimatedMinutes)} total · ~${fmtHours(c.remainingMinutes)} remaining`} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Progress" value={`${c.progress}%`} bar={c.progress} color={c.subjectColor} />
        <Cell label="Completed" value={`${c.doneTopics}/${c.totalTopics}`} />
        <Cell label="Remaining" value={`${c.totalTopics - c.doneTopics} topics`} />
        <Cell label="Est. remaining" value={fmtHours(c.remainingMinutes)} />
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Topics</p>
      {c.topics.length === 0 ? (
        <EmptyState icon={<Layers />} title="No topics in this chapter" desc="Add topics from the Study page to start the learning pipeline." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          {c.topics.map((t, i) => (
            <Link
              key={t.id}
              href={`/study/topic/${t.id}`}
              className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 bg-panel px-4 py-3 transition-colors hover:bg-panel2", i > 0 && "border-t border-line")}
            >
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.isCurrent && <Badge variant="ice">current</Badge>}
                  <span className={cn("text-[10px] font-semibold uppercase", IMP[t.importance])}>{t.importance}</span>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-dim">
                  <span className="flex items-center gap-1"><Clock className="size-3" />~{fmtHours(t.estimatedMinutes)}</span>
                  <span className="capitalize">{t.difficulty}</span>
                  {t.prerequisiteName && <span className="flex items-center gap-1"><Link2 className="size-3" />after {t.prerequisiteName}</span>}
                </p>
              </div>
              <div className="w-28 shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-dim">Stage</p>
                <p className="truncate text-xs font-medium text-fog">{t.currentStage}</p>
              </div>
              <div className="w-24 shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-dim">State</p>
                <p className={cn("truncate text-xs font-semibold", STATE_CLS[t.masteryState] ?? "text-mute")}>{t.masteryState}</p>
              </div>
              <div className="w-28 shrink-0">
                <div className="mb-1 flex justify-between text-[10px] text-dim"><span>mastery</span><span>{t.mastery}</span></div>
                <Progress value={t.mastery} color={c.subjectColor} />
              </div>
              <ChevronRight className="size-4 shrink-0 text-dim" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, bar, color }: { label: string; value: string; bar?: number; color?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-dim">{label}</p>
      <p className="font-display mt-1 text-lg font-bold">{value}</p>
      {bar !== undefined && <Progress value={bar} color={color} className="mt-2" />}
    </div>
  );
}
