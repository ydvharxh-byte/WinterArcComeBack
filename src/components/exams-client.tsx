"use client";

import { ExamForm } from "@/components/forms";
import { Modal } from "@/components/modal";
import { fmtDateLong, fmtDateShort } from "@/lib/dates";
import type { ExamDTO, SubjectDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteExam, setExamChapters } from "@/server/study";
import { useAction } from "@/lib/use-action";
import { CalendarClock, GraduationCap, Link2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ConfirmDelete, EmptyState, PageHeader, Ring } from "./ui";

function countdownVariant(days: number): "red" | "amber" | "default" {
  if (days <= 7) return "red";
  if (days <= 21) return "amber";
  return "default";
}

export function ExamsClient({ exams, tree }: { exams: ExamDTO[]; tree: SubjectDTO[] }) {
  const { run } = useAction();
  const [modal, setModal] = useState<"new" | ExamDTO | null>(null);
  const [linkFor, setLinkFor] = useState<ExamDTO | null>(null);

  const upcoming = exams.filter((e) => e.daysRemaining >= 0);
  const past = exams.filter((e) => e.daysRemaining < 0);

  return (
    <div>
      <PageHeader
        title="Exams"
        sub="Countdowns and preparation progress, driven by your syllabus"
        actions={<Button size="sm" onClick={() => setModal("new")}><Plus /> Add exam</Button>}
      />

      {exams.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title="No exams scheduled"
          desc="Add an exam and link its chapters to track preparation automatically."
          action={<Button size="sm" onClick={() => setModal("new")}><Plus /> Add exam</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((e) => (
            <Card key={e.id} className="flex flex-col overflow-hidden">
              <div className="h-1" style={{ backgroundColor: e.subjectColor ?? "#2563EB" }} />
              <div className="flex items-start justify-between gap-3 p-5 pb-3">
                <div className="min-w-0">
                  <h3 className="font-display truncate text-base font-bold">{e.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
                    <span className="size-2 rounded-full" style={{ backgroundColor: e.subjectColor ?? "#64748B" }} />
                    {e.subjectName ?? "General"} · {fmtDateLong(e.date)}
                  </p>
                </div>
                <Badge variant={countdownVariant(e.daysRemaining)} className="shrink-0 text-sm px-2.5 py-1 font-display font-bold">
                  {e.daysRemaining === 0 ? "Today" : `${e.daysRemaining}d`}
                </Badge>
              </div>

              <div className="flex items-center gap-4 px-5 pb-4">
                <Ring value={e.progress} size={64} stroke={6} color={e.subjectColor ?? "#2563EB"}>
                  <span className="font-display text-sm font-bold">{e.progress}%</span>
                </Ring>
                <div className="text-xs text-mute">
                  <p className="text-sm font-semibold text-fog">{e.doneTopics}/{e.totalTopics} topics ready</p>
                  <p className="mt-0.5">Preparation = done topics across linked chapters</p>
                </div>
              </div>

              <div className="flex-1 px-5 pb-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">Linked chapters</p>
                {e.chapters.length === 0 ? (
                  <p className="text-xs text-mute">None linked yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {e.chapters.map((c) => (
                      <Badge key={c.id}>{c.subjectName} · {c.name}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 border-t border-line px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => setLinkFor(e)}><Link2 /> Chapters</Button>
                <Button variant="ghost" size="sm" onClick={() => setModal(e)}><Pencil /> Edit</Button>
                <div className="ml-auto"><ConfirmDelete onConfirm={() => run(() => deleteExam(e.id), { success: "Exam deleted" })} /></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Past exams</p>
          <Card className="divide-y divide-line/60">
            {past.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                <CalendarClock className="size-4 text-dim" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                <Badge>{fmtDateShort(e.date)}</Badge>
                <Badge variant={e.progress === 100 ? "green" : "default"}>{e.progress}% prep</Badge>
                <ConfirmDelete onConfirm={() => run(() => deleteExam(e.id), { success: "Exam deleted" })} />
              </div>
            ))}
          </Card>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "new" ? "Add exam" : "Edit exam"}>
        {modal !== null && <ExamForm tree={tree} exam={modal === "new" ? null : modal} onDone={() => setModal(null)} />}
      </Modal>

      <Modal open={!!linkFor} onClose={() => setLinkFor(null)} title="Link chapters" sub="Preparation progress is computed from topics in these chapters" wide>
        {linkFor && <ChapterLinker exam={linkFor} tree={tree} onDone={() => setLinkFor(null)} onSave={(ids) => run(() => setExamChapters(linkFor.id, ids), { success: "Chapters updated", onSuccess: () => setLinkFor(null) })} />}
      </Modal>
    </div>
  );
}

function ChapterLinker({ exam, tree, onDone, onSave }: { exam: ExamDTO; tree: SubjectDTO[]; onDone: () => void; onSave: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set(exam.chapters.map((c) => c.id)));
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  void onDone;

  return (
    <div className="space-y-4">
      {tree.length === 0 && <p className="text-sm text-mute">Create subjects and chapters first.</p>}
      {tree.map((s) => (
        <div key={s.id}>
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute">
            <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}
          </p>
          <div className="space-y-1">
            {s.chapters.map((c) => {
              const on = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer",
                    on ? "border-accent bg-accent-soft text-fog" : "border-line text-mute hover:text-fog"
                  )}
                >
                  <span>{c.name}</span>
                  <span className="text-[10px]">{c.topics.filter((t) => t.status === "done").length}/{c.topics.length} topics</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Button className="w-full" onClick={() => onSave([...selected])}>Save links</Button>
    </div>
  );
}
