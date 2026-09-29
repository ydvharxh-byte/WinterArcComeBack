"use client";

import { Modal } from "@/components/modal";
import { StudyForm } from "@/components/forms";
import { fmtDateShort } from "@/lib/dates";
import type { SessionDTO, SubjectDTO, TopicDTO } from "@/lib/types";
import { fmtHours, SUBJECT_COLORS, cn } from "@/lib/utils";
import {
  createChapter,
  createSubject,
  createTopic,
  deleteChapter,
  deleteStudySession,
  deleteSubject,
  deleteTopic,
  setTopicStatus,
  updateTopic,
  updateTopicMeta,
} from "@/server/study";
import { useAction } from "@/lib/use-action";
import {
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  ExternalLink,
  ListChecks,
  NotebookPen,
  Plus,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Badge, Button, Card, ConfirmDelete, EmptyState, Field, Input, PageHeader,
  Progress, Select, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from "./ui";

type BacklogItem = {
  id: number; name: string; status: string; difficulty: string; isCurrent: boolean;
  chapterName: string; subjectName: string; subjectColor: string; updatedAt: string;
};

const STATUS_META = {
  todo: { label: "Todo", icon: Circle, cls: "text-dim border-line2 hover:border-warning" },
  in_progress: { label: "In progress", icon: CircleDot, cls: "text-warning border-warning/40 bg-warning/10" },
  done: { label: "Done", icon: Check, cls: "text-success border-success/40 bg-success/10" },
} as const;

const MASTERY_META: Record<string, { label: string; cls: string }> = {
  mastered: { label: "Mastered", cls: "text-success" },
  strong: { label: "Strong", cls: "text-success" },
  basic: { label: "Basic", cls: "text-ice" },
  developing: { label: "Developing", cls: "text-warning" },
  not_learned: { label: "Not learned", cls: "text-dim" },
};

function nextStatus(s: string) {
  return s === "todo" ? "in_progress" : s === "in_progress" ? "done" : "todo";
}

function StatusButton({ status, onCycle, xp }: { status: string; onCycle: () => void; xp?: boolean }) {
  const meta = STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.todo;
  const Icon = meta.icon;
  return (
    <button
      onClick={onCycle}
      className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-all cursor-pointer", meta.cls)}
      title="Click to advance status"
    >
      <Icon className="size-3.5" />
      {meta.label}
      {xp && status !== "done" && <span className="text-[9px] text-emerald-500/70">+15</span>}
    </button>
  );
}

export function StudyClient({ tree, sessions, backlog }: { tree: SubjectDTO[]; sessions: SessionDTO[]; backlog: BacklogItem[] }) {
  const { run } = useAction();
  const [selectedId, setSelectedId] = useState<number | null>(tree[0]?.id ?? null);
  const [tab, setTab] = useState("syllabus");
  const [subjectModal, setSubjectModal] = useState(false);
  const [logModal, setLogModal] = useState(false);
  const [chapterFor, setChapterFor] = useState<number | null>(null);
  const [editTopic, setEditTopic] = useState<TopicDTO | null>(null);
  const [quickTopic, setQuickTopic] = useState<Record<number, string>>({});

  // new subject form state
  const [sName, setSName] = useState("");
  const [sColor, setSColor] = useState(SUBJECT_COLORS[0]);
  const [sDesc, setSDesc] = useState("");
  const [cName, setCName] = useState("");

  const subject = tree.find((s) => s.id === selectedId) ?? tree[0] ?? null;

  const totalMinutes = tree.reduce((a, s) => a + s.minutes, 0);
  const totalQuestions = sessions.reduce((a, s) => a + s.questions, 0);
  const totalCorrect = sessions.reduce((a, s) => a + s.correct, 0);

  return (
    <div>
      <PageHeader
        title="Study"
        sub={`${fmtHours(totalMinutes)} logged all-time · ${backlog.length} topics in backlog`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSubjectModal(true)}><Plus /> Subject</Button>
            <Button size="sm" onClick={() => setLogModal(true)}><BookOpen /> Log session</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Subjects rail */}
        <div className="space-y-1.5">
          {tree.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedId(s.id); setTab("syllabus"); }}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-all cursor-pointer",
                subject?.id === s.id && tab === "syllabus" ? "border-line2 bg-panel" : "border-transparent hover:bg-panel2/60"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                <ChevronRight className={cn("size-3.5 transition-transform", subject?.id === s.id && tab === "syllabus" ? "rotate-90 text-fog" : "text-dim")} />
              </div>
              <div className="mt-2 flex items-center gap-2 pl-5">
                <Progress value={s.progress} color={s.color} className="h-1" />
                <span className="text-[10px] font-medium text-mute">{s.progress}%</span>
              </div>
            </button>
          ))}
          <div className="pt-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="backlog" className="w-full justify-center">Backlog</TabsTrigger>
                <TabsTrigger value="sessions" className="w-full justify-center">Sessions</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Main */}
        <div>
          <Tabs value={tab} onValueChange={setTab}>
            {/* Syllabus */}
            <TabsContent value="syllabus">
              {tree.length === 0 ? (
                <EmptyState
                  icon={<BookOpen />}
                  title="No subjects yet"
                  desc="Create your first subject, then break it into chapters and topics."
                  action={<Button size="sm" onClick={() => setSubjectModal(true)}><Plus /> Create subject</Button>}
                />
              ) : subject && (
                <div className="space-y-4 anim-fade-up">
                  <Card className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${subject.color}22`, color: subject.color }}>
                          <BookOpen className="size-5" />
                        </span>
                        <div>
                          <h2 className="font-display text-lg font-bold">{subject.name}</h2>
                          {subject.description && <p className="text-xs text-mute">{subject.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-5 text-center">
                        <div><p className="font-display text-lg font-bold">{subject.doneTopics}/{subject.totalTopics}</p><p className="text-[10px] uppercase tracking-wider text-dim">Topics</p></div>
                        <div><p className="font-display text-lg font-bold">{fmtHours(subject.minutes)}</p><p className="text-[10px] uppercase tracking-wider text-dim">Studied</p></div>
                        <div><p className="font-display text-lg font-bold">{subject.chapters.length}</p><p className="text-[10px] uppercase tracking-wider text-dim">Chapters</p></div>
                        <ConfirmDelete onConfirm={() => run(() => deleteSubject(subject.id), { success: "Subject deleted" })} />
                      </div>
                    </div>
                    <Progress value={subject.progress} color={subject.color} className="mt-4" />
                  </Card>

                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setChapterFor(subject.id); setCName(""); }}><Plus /> Add chapter</Button>
                  </div>

                  {subject.chapters.length === 0 && (
                    <EmptyState icon={<ListChecks />} title="No chapters" desc="Add chapters to structure this subject." />
                  )}

                  {subject.chapters.map((c) => {
                    const done = c.topics.filter((t) => t.status === "done").length;
                    return (
                      <Card key={c.id}>
                        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <h3 className="truncate text-sm font-semibold">{c.name}</h3>
                            <span className="text-[11px] text-dim">{done}/{c.topics.length} done</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden w-28 sm:block"><Progress value={c.progress} color={subject.color} /></div>
                            <ConfirmDelete onConfirm={() => run(() => deleteChapter(c.id), { success: "Chapter deleted" })} />
                          </div>
                        </div>
                        <div className="divide-y divide-line/60">
                          {c.topics.map((t) => (
                            <div key={t.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-panel2/40">
                              <StatusButton status={t.status} xp onCycle={() => run(() => setTopicStatus(t.id, nextStatus(t.status)), { success: nextStatus(t.status) === "done" ? "Topic done · +15 XP" : undefined })} />
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                title={`${t.difficulty} difficulty`}
                                style={{ backgroundColor: t.difficulty === "hard" ? "#F87171" : t.difficulty === "medium" ? "#FBBF24" : "#34D399" }}
                              />
                              <Link href={`/study/topic/${t.id}`} className={cn("min-w-0 flex-1 truncate text-left text-sm cursor-pointer hover:text-accent transition-colors", t.status === "done" ? "text-mute line-through" : "font-medium")}>
                                {t.name}
                              </Link>
                              <button onClick={() => setEditTopic(t)} className="shrink-0 rounded p-1 text-dim hover:text-fog cursor-pointer" title="Edit topic (notes, resource link, difficulty)">
                                <NotebookPen className="size-3.5" />
                              </button>
                              {t.mastery.score > 0 && (
                                <span
                                  className={cn("hidden shrink-0 text-[10px] font-semibold sm:block", MASTERY_META[t.mastery.label].cls)}
                                  title={`Mastery ${t.mastery.score}/100 · ${t.mastery.sessions} session${t.mastery.sessions === 1 ? "" : "s"}, ${fmtHours(t.mastery.minutes)}${t.mastery.questions > 0 ? `, ${t.mastery.correct}/${t.mastery.questions} correct` : ""}`}
                                >
                                  {MASTERY_META[t.mastery.label]?.label} · {t.mastery.score}
                                </span>
                              )}
                              {t.notes && <NotebookPen className="size-3.5 shrink-0 text-dim" />}
                              {t.link && (
                                <a href={t.link} target="_blank" rel="noreferrer" className="shrink-0 text-dim hover:text-accent" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="size-3.5" />
                                </a>
                              )}
                              <ConfirmDelete onConfirm={() => run(() => deleteTopic(t.id), { success: "Topic deleted" })} />
                            </div>
                          ))}
                          <div className="flex items-center gap-2 px-4 py-2.5">
                            <Plus className="size-3.5 text-dim" />
                            <input
                              value={quickTopic[c.id] ?? ""}
                              onChange={(e) => setQuickTopic((q) => ({ ...q, [c.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                const v = (quickTopic[c.id] ?? "").trim();
                                if (e.key === "Enter" && v) {
                                  run(() => createTopic({ chapterId: c.id, name: v, difficulty: "medium" }), { success: "Topic added" });
                                  setQuickTopic((q) => ({ ...q, [c.id]: "" }));
                                }
                              }}
                              placeholder="Add topic… (Enter)"
                              className="w-full bg-transparent text-sm text-fog placeholder:text-dim focus:outline-none"
                            />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Backlog */}
            <TabsContent value="backlog">
              <Card>
                <div className="border-b border-line px-5 py-3.5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Backlog — unfinished topics</h3>
                  <Badge>{backlog.length}</Badge>
                </div>
                {backlog.length === 0 ? (
                  <div className="p-5"><EmptyState icon={<Target />} title="Backlog is empty" desc="Every topic is done. Impressive." /></div>
                ) : (
                  <div className="divide-y divide-line/60">
                    {backlog.some((b) => b.isCurrent) && (
                      <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-ice bg-ice/5">Currently taught (school/tuition)</p>
                    )}
                    {backlog.filter((b) => b.isCurrent).map((b) => (
                      <BacklogRow key={b.id} b={b} run={run} />
                    ))}
                    {backlog.some((b) => b.isCurrent) && backlog.some((b) => !b.isCurrent) && (
                      <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-mute">Backlog</p>
                    )}
                    {backlog.filter((b) => !b.isCurrent).map((b) => (
                      <BacklogRow key={b.id} b={b} run={run} />
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Sessions */}
            <TabsContent value="sessions">
              <Card>
                <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                  <h3 className="text-sm font-semibold">Recent sessions</h3>
                  <div className="flex items-center gap-4 text-xs text-mute">
                    <span>{sessions.length} shown</span>
                    {totalQuestions > 0 && (
                      <span className="flex items-center gap-1"><Target className="size-3.5" /> {totalCorrect}/{totalQuestions} correct ({Math.round((totalCorrect / totalQuestions) * 100)}%)</span>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setLogModal(true)}><Plus /> Log</Button>
                  </div>
                </div>
                {sessions.length === 0 ? (
                  <div className="p-5"><EmptyState icon={<BookOpen />} title="No sessions logged" desc="Log your first study session to start earning XP." action={<Button size="sm" onClick={() => setLogModal(true)}>Log session</Button>} /></div>
                ) : (
                  <div className="divide-y divide-line/60">
                    {sessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-14 shrink-0 text-xs font-medium text-mute">{fmtDateShort(s.date)}</span>
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.subjectColor ?? "#64748B" }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.subjectName ?? "Study"}{s.topicName ? ` · ${s.topicName}` : s.chapterName ? ` · ${s.chapterName}` : ""}</p>
                          {s.notes && <p className="truncate text-[11px] text-dim">{s.notes}</p>}
                        </div>
                        <Badge variant="violet">{fmtHours(s.minutes)}</Badge>
                        {s.questions > 0 && <Badge variant="ice">{s.correct}/{s.questions} Q</Badge>}
                        <ConfirmDelete onConfirm={() => run(() => deleteStudySession(s.id), { success: "Session deleted" })} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modals */}
      <Modal open={subjectModal} onClose={() => setSubjectModal(false)} title="New subject">
        <div className="space-y-4">
          <Field label="Name">
            <Input autoFocus value={sName} onChange={(e) => setSName(e.target.value)} placeholder="e.g. Chemistry" />
          </Field>
          <Field label="Description">
            <Input value={sDesc} onChange={(e) => setSDesc(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Color">
            <div className="flex gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button key={c} onClick={() => setSColor(c)} className={cn("size-7 rounded-full cursor-pointer transition-transform", sColor === c && "scale-110 ring-2 ring-white/40")} style={{ backgroundColor: c }} />
              ))}
            </div>
          </Field>
          <Button
            className="w-full"
            disabled={!sName.trim()}
            onClick={() => run(() => createSubject({ name: sName.trim(), color: sColor, description: sDesc || undefined }), {
              success: "Subject created",
              onSuccess: () => { setSubjectModal(false); setSName(""); setSDesc(""); },
            })}
          >Create subject</Button>
        </div>
      </Modal>

      <Modal open={chapterFor !== null} onClose={() => setChapterFor(null)} title="New chapter">
        <div className="space-y-4">
          <Field label="Chapter name">
            <Input autoFocus value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Organic Chemistry" onKeyDown={(e) => { if (e.key === "Enter" && cName.trim() && chapterFor) run(() => createChapter({ subjectId: chapterFor, name: cName.trim() }), { success: "Chapter added", onSuccess: () => setChapterFor(null) }); }} />
          </Field>
          <Button className="w-full" disabled={!cName.trim()} onClick={() => chapterFor && run(() => createChapter({ subjectId: chapterFor, name: cName.trim() }), { success: "Chapter added", onSuccess: () => setChapterFor(null) })}>
            Add chapter
          </Button>
        </div>
      </Modal>

      <Modal open={!!editTopic} onClose={() => setEditTopic(null)} title="Edit topic" sub={editTopic && STATUS_META[editTopic.status as keyof typeof STATUS_META] ? `Status: ${STATUS_META[editTopic.status as keyof typeof STATUS_META].label}` : undefined}>
        {editTopic && <TopicEditor topic={editTopic} onDone={() => setEditTopic(null)} />}
      </Modal>

      <Modal open={logModal} onClose={() => setLogModal(false)} title="Log study session" sub="Earn 1 XP per 5 minutes">
        <StudyForm tree={tree} onDone={() => setLogModal(false)} />
      </Modal>
    </div>
  );
}

function TopicEditor({ topic, onDone }: { topic: TopicDTO; onDone: () => void }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(topic.name);
  const [difficulty, setDifficulty] = useState(topic.difficulty);
  const [priority, setPriority] = useState(topic.priority);
  const [notes, setNotes] = useState(topic.notes ?? "");
  const [link, setLink] = useState(topic.link ?? "");
  return (
    <div className="space-y-4">
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Difficulty">
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
        <Field label="Study OS priority" hint="Not official CBSE weightage">
          <Select
            value={priority}
            onChange={(e) => run(() => updateTopicMeta({ id: topic.id, priority: e.target.value }), { success: "Priority updated" })}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
      </div>
      <button
        onClick={() => run(() => updateTopicMeta({ id: topic.id, isCurrent: !topic.isCurrent }), { success: topic.isCurrent ? "Moved to backlog" : "Marked as current" })}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
          topic.isCurrent ? "border-ice/40 bg-ice/10 text-fog" : "border-line text-mute hover:text-fog"
        )}
      >
        Currently taught in school/tuition
        <span className={cn("h-4 w-7 rounded-full p-0.5 transition-colors", topic.isCurrent ? "bg-ice" : "bg-line")}>
          <span className={cn("block size-3 rounded-full bg-white transition-transform", topic.isCurrent && "translate-x-3")} />
        </span>
      </button>
      <Field label="Resource link"><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></Field>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key formulas, reminders, page numbers…" className="min-h-[120px]" /></Field>
      <Button
        className="w-full"
        loading={pending}
        disabled={!name.trim()}
        onClick={() => run(() => updateTopic({ id: topic.id, name: name.trim(), difficulty: difficulty as "easy" | "medium" | "hard", notes: notes || null, link: link || null }), { success: "Topic saved", onSuccess: onDone })}
      >Save topic</Button>
    </div>
  );
}

function BacklogRow({ b, run }: { b: BacklogItem; run: ReturnType<typeof useAction>["run"] }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel2/40">
      <StatusButton status={b.status} onCycle={() => run(() => setTopicStatus(b.id, nextStatus(b.status)), { success: nextStatus(b.status) === "done" ? "Topic done · +15 XP" : undefined })} />
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: b.difficulty === "hard" ? "#F87171" : b.difficulty === "medium" ? "#FBBF24" : "#34D399" }} />
      <div className="min-w-0 flex-1">
        <Link href={`/study/topic/${b.id}`} className="truncate text-sm font-medium hover:text-accent transition-colors block">{b.name}</Link>
        <p className="text-[11px] text-dim">{b.chapterName}</p>
      </div>
      <Badge variant="default" className="shrink-0"><span className="size-1.5 rounded-full" style={{ backgroundColor: b.subjectColor }} />{b.subjectName}</Badge>
    </div>
  );
}
