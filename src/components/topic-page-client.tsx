"use client";

import { fmtDateShort, todayStr } from "@/lib/dates";
import type { getTopicDetail, StageKey } from "@/server/study";
import { logPracticeResult, markStageDone, recordTopicTest, setStageOverride } from "@/server/study";
import { generateLesson, type LessonDTO } from "@/server/ai/lesson";
import { extractReferencesForTopic, addReference, deleteReference } from "@/server/refs";
import { useAction } from "@/lib/use-action";
import { cn, fmtHours } from "@/lib/utils";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FlaskConical,
  Link2,
  ListChecks,
  Lock,
  Minus,
  NotebookText,
  Plus,
  RefreshCw,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, ConfirmDelete, EmptyState, Input, Ring, Select } from "./ui";
import { Modal } from "./modal";

type Detail = NonNullable<Awaited<ReturnType<typeof getTopicDetail>>>;

const STAGE_ICON: Record<StageKey, React.ReactNode> = {
  theory: <BookOpen className="size-3.5" />,
  formulas: <Sigma className="size-3.5" />,
  derivations: <NotebookText className="size-3.5" />,
  ncert: <ListChecks className="size-3.5" />,
  outside: <ListChecks className="size-3.5" />,
  test: <FlaskConical className="size-3.5" />,
  mastery: <Target className="size-3.5" />,
};

const IMPORTANCE_CLS: Record<string, string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-mute",
};

/** Minimal markdown → HTML for generated lessons (headings, lists, bold, code, quotes). */
function lessonHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`); continue;
    }
    if (/^\s*>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`); continue; }
    if (line.trim() === "") { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("");
}

export function TopicPageClient({ d, lesson }: { d: Detail; lesson: LessonDTO | null }) {
  const { run, pending } = useAction();
  const [stage, setStage] = useState<StageKey>(d.currentStage);
  const active = d.stages.find((s) => s.key === stage)!;

  return (
    <div className="space-y-5">
      {/* ---------------------------- TOPIC HEADER ---------------------------- */}
      <div className="rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-mute">
              <Link href="/backlog" className="hover:text-fog">Backlog</Link>
              <ChevronRight className="size-3" />
              <span style={{ color: d.subjectColor }}>{d.subjectName}</span>
              <ChevronRight className="size-3" />
              <Link href={`/backlog/chapter/${d.chapterId}`} className="hover:text-fog">{d.chapterName}</Link>
            </p>
            <h1 className="font-display mt-1.5 text-2xl font-bold tracking-tight">{d.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
              <span className="text-mute">Importance <strong className={IMPORTANCE_CLS[d.importance]}>{d.importance.toUpperCase()}</strong></span>
              <span className="text-mute">Difficulty <strong className="text-fog capitalize">{d.difficulty}</strong></span>
              <span className="flex items-center gap-1 text-mute"><Clock className="size-3" /> ~{fmtHours(d.estimatedMinutes)}</span>
              {d.isCurrent ? <Badge variant="ice">Current syllabus</Badge> : <Badge>Backlog</Badge>}
              {d.prerequisite && (
                <span className="flex items-center gap-1 text-mute">
                  <Link2 className="size-3" /> Prerequisite:
                  <Link href={`/study/topic/${d.prerequisite.id}`} className="text-accent hover:underline">{d.prerequisite.name}</Link>
                  <strong className={d.prerequisite.mastery >= 60 ? "text-success" : "text-warning"}>{d.prerequisite.mastery}/100</strong>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs">
              <p className="font-semibold tracking-wide text-accent">{d.masteryState}</p>
              <p className="mt-0.5 text-mute">Current stage</p>
              <p className="font-display text-sm font-bold text-fog">{d.stages.find((s) => s.key === d.currentStage)?.label}</p>
            </div>
            <Ring value={d.mastery.score} size={72} stroke={6}>
              <div className="text-center">
                <p className="font-display text-base font-bold leading-none">{d.mastery.score}</p>
                <p className="mt-0.5 text-[8px] uppercase tracking-wider text-dim">mastery</p>
              </div>
            </Ring>
          </div>
        </div>

        {/* Pipeline strip */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-3">
          {d.stages.map((s) => (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors cursor-pointer",
                stage === s.key ? "text-fog" : "text-mute hover:text-fog"
              )}
            >
              <span className={s.state === "done" ? "text-success" : s.locked ? "text-dim" : s.state === "active" ? "text-accent" : "text-dim"}>
                {s.state === "done" ? <CheckCircle2 className="size-3.5" /> : s.locked ? <Lock className="size-3.5" /> : STAGE_ICON[s.key]}
              </span>
              <span className={cn("font-medium", stage === s.key && "underline underline-offset-4 decoration-accent")}>{s.label}</span>
              <span className="tabular-nums text-dim">{s.detail}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------ STAGE BODY ---------------------------- */}
      {active.locked ? (
        <div className="rounded-xl border border-line bg-panel px-6 py-10 text-center">
          <Lock className="mx-auto size-6 text-dim" />
          <p className="mt-3 font-display text-base font-bold">{active.lockReason}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-mute">
            Stages run in sequence so foundations hold. You can override this if you genuinely already know the material —
            the override is recorded, and skipped stages are never counted as mastered.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            onClick={() => run(() => setStageOverride(d.id, true), { success: "Override recorded — stages unlocked" })}
          >
            I already know this — unlock
          </Button>
        </div>
      ) : (
        <div className="anim-fade-up" key={stage}>
          {stage === "theory" && <TheoryStage d={d} lesson={lesson} run={run} pending={pending} />}
          {(stage === "formulas" || stage === "derivations") && <RefsStage d={d} kind={stage} run={run} pending={pending} />}
          {(stage === "ncert" || stage === "outside") && <PracticeStage d={d} kind={stage} run={run} />}
          {stage === "test" && <TestStage d={d} run={run} />}
          {stage === "mastery" && <MasteryStage d={d} />}
        </div>
      )}

      {d.stageOverride && (
        <p className="flex items-center gap-2 text-[11px] text-warning">
          <AlertTriangle className="size-3.5" /> Stage locks overridden for this topic — mastery still requires real evidence.
          <button className="underline cursor-pointer" onClick={() => run(() => setStageOverride(d.id, false), { success: "Locks restored" })}>Re-enable locks</button>
        </p>
      )}
    </div>
  );
}

type RunFn = ReturnType<typeof useAction>["run"];

function StageHeader({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-0.5 text-xs text-mute">{sub}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- THEORY ---------------------------------- */

function TheoryStage({ d, lesson, run, pending }: { d: Detail; lesson: LessonDTO | null; run: RunFn; pending: boolean }) {
  const [busy, setBusy] = useState(false);
  const regenerate = () => {
    setBusy(true);
    run(() => generateLesson(d.id), { success: "Lesson built from your notes", onSuccess: () => setBusy(false) });
    setTimeout(() => setBusy(false), 12000);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0">
        <StageHeader
          title="Theory"
          sub="A structured lesson built from your notes — AI additions are labelled inline"
          action={
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" loading={busy || pending} onClick={regenerate}>
                <Sparkles /> {lesson ? "Rebuild lesson" : "Build lesson"}
              </Button>
              {!d.progress.theoryDoneAt && (
                <Button size="sm" onClick={() => run(() => markStageDone(d.id, "theory"), { success: "Theory covered · +4 XP" })}>
                  <Check /> Mark covered
                </Button>
              )}
            </div>
          }
        />

        {lesson ? (
          <div className="rounded-xl border border-line bg-panel p-6">
            {!lesson.hasNotes && (
              <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Supplemental lesson — you have no notes mapped to this topic yet, so this is NCERT-level material, not your notes.
              </p>
            )}
            <article className="lesson" dangerouslySetInnerHTML={{ __html: lessonHtml(lesson.lesson) }} />
            {lesson.sourceRefs.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">Source</p>
                {lesson.sourceRefs.map((r, i) => (
                  <p key={i} className="mt-1 text-xs text-mute">
                    <FileText className="mr-1.5 inline size-3" />
                    {r.document} · pages {r.pages} · <span className="text-dim">{r.heading}</span>
                  </p>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-dim">Generated {fmtDateShort(lesson.generatedAt.slice(0, 10))}</p>
          </div>
        ) : d.mappedNotes.length > 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="Lesson not built yet"
            desc={`${d.mappedNotes.length} note section(s) are mapped to this topic. Build the structured lesson to study from them.`}
            action={<Button size="sm" onClick={regenerate} loading={busy}><Sparkles /> Build lesson</Button>}
          />
        ) : (
          <EmptyState
            icon={<FileText />}
            title="No notes mapped to this topic"
            desc="Upload your whole-subject notes — they're auto-organized per topic with page references, and the lesson here will be built from them."
            action={<Link href="/notes"><Button size="sm" variant="secondary"><Plus /> Upload notes</Button></Link>}
          />
        )}
      </div>

      {/* Raw source chunks */}
      <aside className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">Your note sections</p>
        {d.mappedNotes.length === 0 ? (
          <p className="text-xs text-mute">None mapped.</p>
        ) : (
          d.mappedNotes.map((n) => (
            <details key={n.id} className="rounded-lg border border-line bg-panel px-3 py-2">
              <summary className="cursor-pointer truncate text-xs font-medium text-fog">{n.heading}</summary>
              <p className="mt-1 text-[10px] text-dim">
                {n.documentTitle}{n.pageStart ? ` · p.${n.pageStart}${n.pageEnd && n.pageEnd !== n.pageStart ? `–${n.pageEnd}` : ""}` : ""}
              </p>
              <p className="mt-1.5 max-h-52 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-mute">{n.content}</p>
            </details>
          ))
        )}
        {d.link && (
          <a href={d.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-accent hover:underline">
            <ExternalLink className="size-3" /> Resource link
          </a>
        )}
      </aside>
    </div>
  );
}

/* ----------------------------- FORMULAS / DERIVATIONS ---------------------- */

function RefsStage({ d, kind, run, pending }: { d: Detail; kind: "formulas" | "derivations"; run: RunFn; pending: boolean }) {
  const want = kind === "formulas" ? "formula" : "derivation";
  const items = d.references.filter((r) => r.kind === want);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [formula, setFormula] = useState("");
  const [conditions, setConditions] = useState("");

  const subjectWord =
    d.subjectName.toLowerCase().startsWith("chem") ? "Reactions, mechanisms & derivations"
    : d.subjectName.toLowerCase().startsWith("math") ? "Proofs, identities & results"
    : "Derivations, laws & results";

  return (
    <div>
      <StageHeader
        title={kind === "formulas" ? "Formulas" : subjectWord}
        sub={kind === "formulas"
          ? "Symbols, SI units, conditions and the usual mistake — this topic only"
          : "Concept → given → steps → result → conditions → common mistakes. Your notes first, supplements labelled."}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus /> Add</Button>
            <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => extractReferencesForTopic(d.id), { success: "Extracted from your notes" })}>
              <Sparkles /> Extract
            </Button>
            {!d.progress.derivationsDoneAt && (
              <Button size="sm" onClick={() => run(() => markStageDone(d.id, "derivations"), { success: "Stage covered · +4 XP" })}>
                <Check /> Mark covered
              </Button>
            )}
          </div>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<Sigma />}
          title={`No ${want}s recorded for this topic`}
          desc="Add them manually, or extract from your mapped notes — each entry records its source (notes / ai / manual)."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border border-line bg-panel p-4 card-hover">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dim">
                      {r.source === "notes" ? "from your notes" : r.source === "ai" ? "supplemental" : "manual"}
                    </span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-[15px] font-medium leading-relaxed text-fog">{r.formula}</pre>
                  {r.symbols && (() => {
                    try {
                      const syms = JSON.parse(r.symbols) as { symbol: string; meaning: string; unit: string }[];
                      return (
                        <div className="mt-2.5 grid gap-1 sm:grid-cols-2">
                          {syms.map((s, i) => (
                            <p key={i} className="text-xs text-mute"><strong className="text-fog">{s.symbol}</strong> — {s.meaning}{s.unit && <span className="text-dim"> ({s.unit})</span>}</p>
                          ))}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                  {r.conditions && <p className="mt-2 text-xs text-ice">Conditions: {r.conditions}</p>}
                  {r.commonMistake && <p className="mt-1 flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{r.commonMistake}</p>}
                </div>
                <ConfirmDelete onConfirm={() => run(() => deleteReference(r.id), { success: "Removed" })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={`Add ${want}`}>
        <div className="space-y-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-fog focus:outline-none focus:ring-2 ring-accent"
            placeholder={want === "formula" ? "I = (1/12) M L²" : "Step-by-step…"}
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
          />
          <Input placeholder="Conditions (optional)" value={conditions} onChange={(e) => setConditions(e.target.value)} />
          <Button
            className="w-full"
            disabled={!title.trim() || !formula.trim()}
            onClick={() =>
              run(() => addReference({ topicId: d.id, kind: want as "formula" | "derivation", title: title.trim(), formula: formula.trim(), symbols: null, conditions: conditions || null, commonMistake: null, source: "manual" }), {
                success: "Saved",
                onSuccess: () => { setAdding(false); setTitle(""); setFormula(""); setConditions(""); },
              })
            }
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* --------------------------------- PRACTICE --------------------------------- */

function PracticeStage({ d, kind, run }: { d: Detail; kind: "ncert" | "outside"; run: RunFn }) {
  const p = d.progress;
  const attempted = kind === "ncert" ? p.ncertAttempted : p.outsideAttempted;
  const correct = kind === "ncert" ? p.ncertCorrect : p.outsideCorrect;
  const acc = attempted ? Math.round((correct / attempted) * 100) : 0;
  const target = 10;

  return (
    <div>
      <StageHeader
        title={kind === "ncert" ? "NCERT questions" : "Outside questions"}
        sub={kind === "ncert"
          ? "In-text questions, solved examples and exercises — self-mark honestly, only evidence counts"
          : "Basic → standard → application → CBSE-style → mixed. Class 11 school level by default."}
        action={
          <Link href={`/tutor?mode=practice&topic=${d.id}`}>
            <Button size="sm"><ListChecks /> Practice with tutor</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Attempted" value={`${attempted}/${target}`} />
        <Cell label="Correct" value={correct} tone="text-success" />
        <Cell label="Incorrect" value={attempted - correct} tone={attempted - correct > 0 ? "text-danger" : undefined} />
        <Cell label="Accuracy" value={attempted ? `${acc}%` : "—"} tone={acc >= 70 ? "text-success" : acc >= 40 ? "text-warning" : undefined} />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-panel p-5">
        <p className="text-sm font-semibold">Solved one? Record the outcome</p>
        <p className="mt-0.5 text-xs text-mute">Each result becomes mastery evidence and adjusts your revision schedule.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => run(() => logPracticeResult(d.id, kind, "correct"), { success: "Recorded · +3 XP" })}>
            <Check className="text-success" /> Correct
          </Button>
          <Button size="sm" variant="secondary" onClick={() => run(() => logPracticeResult(d.id, kind, "wrong"), { success: "Recorded" })}>
            <Minus className="text-danger" /> Incorrect
          </Button>
          {kind === "ncert" && (
            <Button size="sm" variant="ghost" onClick={() => run(() => logPracticeResult(d.id, kind, "skip"), {})}>Skipped</Button>
          )}
        </div>
      </div>

      {d.recentAttempts.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-dim">Recent evaluated work</p>
          <div className="space-y-1">
            {d.recentAttempts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2">
                <span className={cn("size-1.5 rounded-full", a.correct ? "bg-success" : "bg-danger")} />
                <p className="min-w-0 flex-1 truncate text-xs text-mute">{a.question}</p>
                <span className="text-xs tabular-nums text-dim">{a.score}/{a.maxScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- TEST ----------------------------------- */

function TestStage({ d, run }: { d: Detail; run: RunFn }) {
  const [score, setScore] = useState(d.progress.testScore?.toString() ?? "");
  const [count, setCount] = useState("8");
  return (
    <div>
      <StageHeader title="Topic test" sub="Concept · formula selection · reasoning · application · calculation · misconceptions" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="font-display text-sm font-semibold">Take it with the tutor</p>
          <p className="mt-1 text-xs leading-relaxed text-mute">Adaptive CBSE-style set with misconception traps; every answer is marked and recorded as evidence.</p>
          <Link href={`/tutor?mode=practice&topic=${d.id}`} className="mt-3 inline-block">
            <Button size="sm"><FlaskConical /> Start test</Button>
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="font-display text-sm font-semibold">Record a test you took</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} className="w-16" />
            <span className="text-xs text-mute">Qs</span>
            <Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} className="w-16" placeholder="%" />
            <span className="text-xs text-mute">%</span>
            <Button size="sm" variant="secondary" disabled={score === ""} onClick={() => run(() => recordTopicTest(d.id, Number(score), Number(count) || 8), { success: "Test recorded" })}>
              Save
            </Button>
          </div>
          {d.progress.testScore != null && (
            <p className="mt-3 text-xs text-mute">
              Last: <strong className={d.progress.testScore >= 60 ? "text-success" : "text-warning"}>{Math.round(d.progress.testScore)}%</strong>
              {d.progress.testAt ? ` · ${fmtDateShort(d.progress.testAt.slice(0, 10))}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- MASTERY --------------------------------- */

function MasteryStage({ d }: { d: Detail }) {
  return (
    <div>
      <StageHeader title="Mastery & revision" sub="Scored from evidence only — theory read or time spent never counts as mastery" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="State" value={d.masteryState} />
        <Cell label="Score" value={`${d.mastery.score}/100`} />
        <Cell label="Questions" value={`${d.mastery.correct}/${d.mastery.questions}`} />
        <Cell label="Accuracy" value={d.mastery.accuracyPct !== null ? `${d.mastery.accuracyPct}%` : "—"} />
        <Cell label="Sessions" value={d.mastery.sessions} />
        <Cell label="Time" value={fmtHours(d.mastery.minutes)} />
      </div>

      {d.revision && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-5 py-3.5">
          <TrendingUp className="size-4 text-ice" />
          <p className="text-sm">
            Revision <strong>{d.revision.dueDate <= todayStr() ? "due now" : `due ${fmtDateShort(d.revision.dueDate)}`}</strong>
            <span className="text-mute"> · interval {d.revision.intervalDays}d · level {d.revision.level}</span>
          </p>
          <Link href={`/tutor?mode=practice&topic=${d.id}`} className="ml-auto">
            <Button size="sm" variant="secondary"><RefreshCw /> Revise now</Button>
          </Link>
        </div>
      )}

      {d.topicErrors.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-dim">
            <AlertTriangle className="size-3.5 text-warning" /> Mistakes on record
          </p>
          <div className="space-y-1">
            {d.topicErrors.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2.5 text-sm">
                <Badge variant={e.status === "resolved" ? "green" : e.status === "improving" ? "amber" : "red"}>{e.status}</Badge>
                <span className="font-medium">{e.tag.replace(/-/g, " ")}</span>
                <span className="text-xs text-dim">×{e.count}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-mute">{e.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-dim">{label}</p>
      <p className={cn("font-display mt-1 text-base font-bold", tone)}>{value}</p>
    </div>
  );
}

void Select;
