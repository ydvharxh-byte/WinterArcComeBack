"use client";

import type { BacklogSubject } from "@/server/pcm";
import { setupPcmBacklog } from "@/server/pcm";
import { useAction } from "@/lib/use-action";
import { cn, fmtHours } from "@/lib/utils";
import { ChevronRight, GraduationCap, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { Badge, Button, EmptyState, PageHeader, Progress } from "./ui";

const IMP: Record<string, string> = { high: "text-danger", medium: "text-warning", low: "text-mute" };

export function BacklogClient({ tree }: { tree: BacklogSubject[] }) {
  const { run, pending } = useAction();
  const totalRemaining = tree.reduce((a, s) => a + s.totalRemainingMin, 0);
  const totalPending = tree.reduce((a, s) => a + s.pendingChapters, 0);

  if (tree.length === 0) {
    return (
      <div>
        <PageHeader title="Backlog" sub="Pending chapters and topics, separate from the current syllabus" />
        <EmptyState
          icon={<Layers />}
          title="No subjects yet"
          desc="Load the Class 11 PCM structure (Physics, Chemistry, Mathematics with their chapters and topics) — or create subjects manually on the Study page."
          action={
            <Button size="sm" loading={pending} onClick={() => run(() => setupPcmBacklog(), { success: "Class 11 PCM backlog created" })}>
              <Plus /> Set up Class 11 PCM
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Backlog"
        sub={`${totalPending} chapters pending · ~${fmtHours(totalRemaining)} of estimated work remaining`}
        actions={
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setupPcmBacklog(), { success: "PCM structure synced (existing content untouched)" })}>
            <Plus /> Sync PCM chapters
          </Button>
        }
      />

      {/* Subject overview */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {tree.map((s) => (
          <div key={s.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <p className="font-display text-sm font-bold">{s.name}</p>
            </div>
            <p className="font-display mt-2 text-2xl font-bold">{s.pendingChapters}<span className="ml-1.5 text-xs font-medium text-mute">chapters pending</span></p>
            <p className="mt-0.5 text-xs text-mute">~{fmtHours(s.totalRemainingMin)} remaining</p>
          </div>
        ))}
      </div>

      {/* Chapters per subject */}
      <div className="space-y-6">
        {tree.map((s) => (
          <section key={s.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              <h2 className="font-display text-sm font-bold uppercase tracking-wide">{s.name}</h2>
              <span className="text-xs text-dim">{s.chapters.length} chapters</span>
            </div>
            {s.chapters.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-mute">No chapters yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line">
                {s.chapters.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/backlog/chapter/${c.id}`}
                    className={cn(
                      "flex items-center gap-4 bg-panel px-4 py-3 transition-colors hover:bg-panel2",
                      i > 0 && "border-t border-line"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        {c.isCurrent && <Badge variant="ice">current</Badge>}
                        <span className={cn("text-[10px] font-semibold uppercase", IMP[c.importance])}>{c.importance}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-dim">
                        {c.doneTopics}/{c.totalTopics} topics · ~{fmtHours(c.remainingMinutes)} left
                      </p>
                    </div>
                    <div className="hidden w-40 sm:block">
                      <div className="mb-1 flex justify-between text-[10px] text-dim"><span>progress</span><span>{c.progress}%</span></div>
                      <Progress value={c.progress} color={s.color} />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-dim" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-dim">
        <GraduationCap className="mt-0.5 size-3.5 shrink-0" />
        Importance and estimated times are <strong className="text-mute">Study OS priorities</strong> for planning — they are not official CBSE chapter weightage.
      </p>
    </div>
  );
}
