"use server";

import { db } from "@/db";
import {
  chapters,
  examChapters,
  exams,
  studySessions,
  subjects,
  topics,
} from "@/db/schema";
import { daysBetween, todayStr } from "@/lib/dates";
import type { ActionResult, ExamDTO, SessionDTO, SubjectDTO, TopicMastery } from "@/lib/types";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { awardXp } from "./xp";
import { buildMastery, computeStages, masteryState, type TopicEvidence } from "./mastery";
import { errorLogs, questionAttempts } from "@/db/schema";

export async function collectTopicEvidence(): Promise<{
  evidence: TopicEvidence;
  lastActivity: Map<number, string>;
}> {
  const sessionRows = await db
    .select({
      topicId: studySessions.topicId,
      sessions: sql<number>`count(*)`,
      minutes: sql<number>`coalesce(sum(${studySessions.minutes}),0)`,
      questions: sql<number>`coalesce(sum(${studySessions.questions}),0)`,
      correct: sql<number>`coalesce(sum(${studySessions.correct}),0)`,
    })
    .from(studySessions)
    .where(isNotNull(studySessions.topicId))
    .groupBy(studySessions.topicId);

  const attemptRows = await db
    .select({
      topicId: questionAttempts.topicId,
      rows: sql<number>`count(*)`,
      questions: sql<number>`coalesce(sum(${questionAttempts.maxScore}),0)`,
      correct: sql<number>`coalesce(sum(${questionAttempts.score}),0)`,
    })
    .from(questionAttempts)
    .where(isNotNull(questionAttempts.topicId))
    .groupBy(questionAttempts.topicId);

  const errorRows = await db
    .select({ topicId: errorLogs.topicId, status: errorLogs.status, n: sql<number>`count(*)` })
    .from(errorLogs)
    .where(isNotNull(errorLogs.topicId))
    .groupBy(errorLogs.topicId, errorLogs.status);

  // last activity per topic across sessions + attempts
  const lastActs = new Map<number, string>();
  const sessionDates = await db
    .select({ topicId: studySessions.topicId, d: sql<string>`max(${studySessions.date})` })
    .from(studySessions)
    .where(isNotNull(studySessions.topicId))
    .groupBy(studySessions.topicId);
  for (const r of sessionDates) if (r.topicId) lastActs.set(r.topicId, r.d);
  const attemptDates = await db
    .select({ topicId: questionAttempts.topicId, d: sql<string>`to_char(max(${questionAttempts.createdAt}), 'YYYY-MM-DD')` })
    .from(questionAttempts)
    .where(isNotNull(questionAttempts.topicId))
    .groupBy(questionAttempts.topicId);
  for (const r of attemptDates) {
    if (!r.topicId) continue;
    const prev = lastActs.get(r.topicId);
    if (!prev || r.d > prev) lastActs.set(r.topicId, r.d);
  }

  const evidence: TopicEvidence = { sessions: {}, attempts: {}, errors: {} };
  for (const r of sessionRows)
    if (r.topicId) evidence.sessions[r.topicId] = { sessions: Number(r.sessions), minutes: Number(r.minutes), questions: Number(r.questions), correct: Number(r.correct) };
  for (const r of attemptRows)
    if (r.topicId) evidence.attempts[r.topicId] = { rows: Number(r.rows), questions: Number(r.questions), correct: Number(r.correct) };
  for (const r of errorRows) {
    if (!r.topicId) continue;
    const e = (evidence.errors[r.topicId] ??= { unresolved: 0, improving: 0 });
    if (r.status === "unresolved") e.unresolved = Number(r.n);
    else if (r.status === "improving") e.improving = Number(r.n);
  }
  return { evidence, lastActivity: lastActs };
}

/** Mastery is judged only by evidence from practice — never by status alone.
    buildMastery (pure) lives in ./mastery; re-exported imports stay async here. */

function refresh() {
  revalidatePath("/", "layout");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/* --------------------------------- Queries --------------------------------- */

export async function getStudyTree(): Promise<SubjectDTO[]> {
  try {
    const subjectsRows = await db.select().from(subjects).orderBy(asc(subjects.createdAt));
    if (subjectsRows.length === 0) return [];

    const chapterRows = await db.select().from(chapters).orderBy(asc(chapters.sortOrder), asc(chapters.id));
    const topicRows = await db.select().from(topics).orderBy(asc(topics.sortOrder), asc(topics.id));
    const minutesRows = await db
      .select({ subjectId: studySessions.subjectId, total: sql<number>`sum(${studySessions.minutes})` })
      .from(studySessions)
      .groupBy(studySessions.subjectId);
    const minutesMap = new Map(minutesRows.map((r) => [r.subjectId, Number(r.total)]));

    // Mastery: evidence from sessions + evaluated attempts, penalties for repeated mistakes
    const { evidence, lastActivity } = await collectTopicEvidence();
    const today = todayStr();

    return subjectsRows.map((s) => {
      const chs = chapterRows
        .filter((c) => c.subjectId === s.id)
        .map((c) => {
          const tps = topicRows.filter((t) => t.chapterId === c.id);
          const done = tps.filter((t) => t.status === "done").length;
          return {
            id: c.id,
            subjectId: c.subjectId,
            name: c.name,
            progress: tps.length ? Math.round((done / tps.length) * 100) : 0,
            topics: tps.map((t) => ({
              id: t.id,
              chapterId: t.chapterId,
              name: t.name,
              status: t.status as "todo" | "in_progress" | "done",
              difficulty: t.difficulty,
              priority: t.priority as "high" | "medium" | "low",
              prerequisiteId: t.prerequisiteId,
              isCurrent: t.isCurrent,
              notes: t.notes,
              link: t.link,
              mastery: buildMastery(t.id, evidence, lastActivity, today),
            })),
          };
        });
      const totalTopics = chs.reduce((a, c) => a + c.topics.length, 0);
      const doneTopics = chs.reduce((a, c) => a + c.topics.filter((t) => t.status === "done").length, 0);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        description: s.description,
        progress: totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0,
        totalTopics,
        doneTopics,
        minutes: minutesMap.get(s.id) ?? 0,
        chapters: chs,
      };
    });
  } catch (err) {
    console.error("Notice: getStudyTree fallback:", err);
    return [];
  }
}

export async function getRecentSessions(limit = 25): Promise<SessionDTO[]> {
  const rows = await db
    .select({
      id: studySessions.id,
      date: studySessions.date,
      minutes: studySessions.minutes,
      questions: studySessions.questions,
      correct: studySessions.correct,
      notes: studySessions.notes,
      subjectId: studySessions.subjectId,
      chapterId: studySessions.chapterId,
      topicId: studySessions.topicId,
      subjectName: subjects.name,
      subjectColor: subjects.color,
      chapterName: chapters.name,
      topicName: topics.name,
    })
    .from(studySessions)
    .leftJoin(subjects, eq(studySessions.subjectId, subjects.id))
    .leftJoin(chapters, eq(studySessions.chapterId, chapters.id))
    .leftJoin(topics, eq(studySessions.topicId, topics.id))
    .orderBy(desc(studySessions.date), desc(studySessions.id))
    .limit(limit);
  return rows;
}

export async function getExams(): Promise<ExamDTO[]> {
  const examRows = await db
    .select({
      id: exams.id,
      name: exams.name,
      date: exams.date,
      notes: exams.notes,
      subjectId: exams.subjectId,
      subjectName: subjects.name,
      subjectColor: subjects.color,
    })
    .from(exams)
    .leftJoin(subjects, eq(exams.subjectId, subjects.id))
    .orderBy(asc(exams.date));

  const links = await db
    .select({
      examId: examChapters.examId,
      chapterId: examChapters.chapterId,
      chapterName: chapters.name,
      subjectName: subjects.name,
    })
    .from(examChapters)
    .innerJoin(chapters, eq(examChapters.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id));

  const chapterIds = [...new Set(links.map((l) => l.chapterId))];
  const topicRows = chapterIds.length
    ? await db.select().from(topics).where(inArray(topics.chapterId, chapterIds))
    : [];

  const today = todayStr();
  return examRows.map((e) => {
    const myLinks = links.filter((l) => l.examId === e.id);
    const myChapterIds = new Set(myLinks.map((l) => l.chapterId));
    const myTopics = topicRows.filter((t) => myChapterIds.has(t.chapterId));
    const done = myTopics.filter((t) => t.status === "done").length;
    return {
      ...e,
      daysRemaining: daysBetween(today, e.date),
      progress: myTopics.length ? Math.round((done / myTopics.length) * 100) : 0,
      totalTopics: myTopics.length,
      doneTopics: done,
      chapters: myLinks.map((l) => ({ id: l.chapterId, name: l.chapterName, subjectName: l.subjectName })),
    };
  });
}

/* --------------------------------- Subjects -------------------------------- */

export async function createSubject(input: { name: string; color: string; description?: string }): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), description: z.string().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid subject data" };
  await db.insert(subjects).values(parsed.data);
  refresh();
  return { ok: true };
}

export async function deleteSubject(id: number): Promise<ActionResult> {
  await db.delete(subjects).where(eq(subjects.id, id));
  refresh();
  return { ok: true };
}

export async function createChapter(input: { subjectId: number; name: string }): Promise<ActionResult> {
  const parsed = z.object({ subjectId: z.number().int(), name: z.string().trim().min(1).max(120) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid chapter data" };
  const [max] = await db.select({ m: sql<number>`coalesce(max(${chapters.sortOrder}), 0)` }).from(chapters).where(eq(chapters.subjectId, parsed.data.subjectId));
  await db.insert(chapters).values({ ...parsed.data, sortOrder: Number(max.m) + 1 });
  refresh();
  return { ok: true };
}

export async function deleteChapter(id: number): Promise<ActionResult> {
  await db.delete(chapters).where(eq(chapters.id, id));
  refresh();
  return { ok: true };
}

/* ---------------------------------- Topics --------------------------------- */

export async function createTopic(input: { chapterId: number; name: string; difficulty: string }): Promise<ActionResult> {
  const parsed = z.object({
    chapterId: z.number().int(),
    name: z.string().trim().min(1).max(160),
    difficulty: z.enum(["easy", "medium", "hard"]),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid topic data" };
  const [max] = await db.select({ m: sql<number>`coalesce(max(${topics.sortOrder}), 0)` }).from(topics).where(eq(topics.chapterId, parsed.data.chapterId));
  await db.insert(topics).values({ ...parsed.data, sortOrder: Number(max.m) + 1 });
  refresh();
  return { ok: true };
}

export async function setTopicStatus(id: number, status: string): Promise<ActionResult> {
  if (!["todo", "in_progress", "done"].includes(status)) return { ok: false, error: "Invalid status" };
  const [prev] = await db.select().from(topics).where(eq(topics.id, id));
  if (!prev) return { ok: false, error: "Topic not found" };
  await db.update(topics).set({ status, updatedAt: new Date() }).where(eq(topics.id, id));
  if (status === "done" && prev.status !== "done") {
    await awardXp(15, `Completed topic: ${prev.name}`, { key: `topic:${id}:done` });
  }
  refresh();
  return { ok: true };
}

export async function updateTopic(input: { id: number; name?: string; notes?: string | null; link?: string | null; difficulty?: string }): Promise<ActionResult> {
  const parsed = z.object({
    id: z.number().int(),
    name: z.string().trim().min(1).max(160).optional(),
    notes: z.string().max(5000).nullable().optional(),
    link: z.string().max(500).nullable().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid topic data" };
  const { id, ...patch } = parsed.data;
  await db.update(topics).set({ ...patch, updatedAt: new Date() }).where(eq(topics.id, id));
  refresh();
  return { ok: true };
}

export async function deleteTopic(id: number): Promise<ActionResult> {
  await db.delete(topics).where(eq(topics.id, id));
  refresh();
  return { ok: true };
}

/* ---------------------------- Topic detail & stages --------------------------- */

import { noteDocuments, noteSections, questionAttempts as qAttempts, revisionItems as revItems, topicLessons, topicProgress, topicReferences } from "@/db/schema";
import { todayStr as _today } from "@/lib/dates";

export type StageKey = "theory" | "formulas" | "derivations" | "ncert" | "outside" | "test" | "mastery";

export interface StageState {
  key: StageKey;
  label: string;
  state: "done" | "active" | "pending";
  detail: string;          // "12/15", "2/3", "Not attempted"
  locked: boolean;
  lockReason: string | null;
}

export interface TopicDetail {
  id: number;
  name: string;
  status: string;
  difficulty: string;
  priority: string;
  importance: string;
  estimatedMinutes: number;
  isCurrent: boolean;
  stages: StageState[];
  currentStage: StageKey;
  stageOverride: boolean;
  masteryState: string;
  prerequisite: { id: number; name: string; mastery: number } | null;
  chapterId: number;
  chapterName: string;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  notes: string | null;
  link: string | null;
  mastery: TopicMastery;
  progress: {
    theoryDoneAt: string | null;
    derivationsDoneAt: string | null;
    ncertAttempted: number;
    ncertCorrect: number;
    ncertSkipped: number;
    outsideAttempted: number;
    outsideCorrect: number;
    testScore: number | null;
    testAt: string | null;
    stageOverride: boolean;
  };
  mappedNotes: {
    id: number; heading: string; pageStart: number | null; pageEnd: number | null;
    content: string; needsReview: boolean; documentTitle: string;
  }[];
  references: {
    id: number; kind: string; title: string; formula: string; symbols: string | null;
    conditions: string | null; commonMistake: string | null; source: string;
  }[];
  topicErrors: { id: number; tag: string; detail: string; count: number; status: string }[];
  revision: { dueDate: string; intervalDays: number; level: number } | null;
  recentAttempts: { id: number; question: string; correct: boolean; score: number; maxScore: number; createdAt: string }[];
}

export async function getTopicDetail(topicId: number): Promise<TopicDetail | null> {
  const [t] = await db.select().from(topics).where(eq(topics.id, topicId));
  if (!t) return null;
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, t.chapterId));
  const [subject] = chapter ? await db.select().from(subjects).where(eq(subjects.id, chapter.subjectId)) : [undefined];

  const { evidence, lastActivity } = await collectTopicEvidence();
  const today = _today();
  const mastery = buildMastery(t.id, evidence, lastActivity, today);

  let prerequisite: TopicDetail["prerequisite"] = null;
  if (t.prerequisiteId) {
    const [pre] = await db.select().from(topics).where(eq(topics.id, t.prerequisiteId));
    if (pre) prerequisite = { id: pre.id, name: pre.name, mastery: buildMastery(pre.id, evidence, lastActivity, today).score };
  }

  const [prog] = await db.select().from(topicProgress).where(eq(topicProgress.topicId, topicId));
  const noteRows = await db
    .select({ s: noteSections, documentTitle: noteDocuments.title })
    .from(noteSections)
    .innerJoin(noteDocuments, eq(noteSections.documentId, noteDocuments.id))
    .where(eq(noteSections.topicId, topicId))
    .orderBy(noteSections.sortOrder);
  const refRows = await db.select().from(topicReferences).where(eq(topicReferences.topicId, topicId));
  const errRows = await db.select().from(errorLogs).where(eq(errorLogs.topicId, topicId));
  const [rev] = await db.select().from(revItems).where(eq(revItems.topicId, topicId));
  const attemptRows = await db
    .select()
    .from(qAttempts)
    .where(eq(qAttempts.topicId, topicId))
    .orderBy(desc(qAttempts.createdAt))
    .limit(5);

  const progress = prog
    ? {
        ...prog,
        theoryDoneAt: prog.theoryDoneAt?.toISOString() ?? null,
        derivationsDoneAt: prog.derivationsDoneAt?.toISOString() ?? null,
        testAt: prog.testAt?.toISOString() ?? null,
      }
    : {
        theoryDoneAt: null, derivationsDoneAt: null, ncertAttempted: 0, ncertCorrect: 0, ncertSkipped: 0,
        outsideAttempted: 0, outsideCorrect: 0, testScore: null, testAt: null, stageOverride: false,
      };

  const refCounts = {
    formulas: refRows.filter((r) => r.kind === "formula").length,
    derivations: refRows.filter((r) => r.kind === "derivation").length,
  };
  const [lessonRow] = await db.select({ topicId: topicLessons.topicId }).from(topicLessons).where(eq(topicLessons.topicId, topicId));
  const { stages, currentStage } = computeStages(progress, refCounts, mastery.score, Boolean(lessonRow));

  return {
    id: t.id,
    name: t.name,
    status: t.status,
    difficulty: t.difficulty,
    priority: t.priority,
    importance: t.importance,
    estimatedMinutes: t.estimatedMinutes,
    isCurrent: t.isCurrent,
    stages,
    currentStage,
    stageOverride: progress.stageOverride,
    masteryState: masteryState(progress, mastery.score, rev ? rev.dueDate <= today : false),
    prerequisite,
    chapterId: t.chapterId,
    chapterName: chapter?.name ?? "",
    subjectId: subject?.id ?? 0,
    subjectName: subject?.name ?? "",
    subjectColor: subject?.color ?? "#2563EB",
    notes: t.notes,
    link: t.link,
    mastery,
    progress,
    mappedNotes: noteRows.map((r) => ({
      id: r.s.id, heading: r.s.heading, pageStart: r.s.pageStart, pageEnd: r.s.pageEnd,
      content: r.s.content, needsReview: r.s.needsReview, documentTitle: r.documentTitle ?? "Notes",
    })),
    references: refRows,
    topicErrors: errRows,
    revision: rev ? { dueDate: rev.dueDate, intervalDays: rev.intervalDays, level: rev.level } : null,
    recentAttempts: attemptRows.map((a) => ({
      id: a.id, question: a.question, correct: a.correct, score: a.score, maxScore: a.maxScore,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

async function upsertTopicProgress(topicId: number, patch: Partial<typeof topicProgress.$inferInsert>) {
  const [existing] = await db.select().from(topicProgress).where(eq(topicProgress.topicId, topicId));
  if (existing) {
    await db.update(topicProgress).set(patch).where(eq(topicProgress.topicId, topicId));
  } else {
    await db.insert(topicProgress).values({ topicId, ...patch });
  }
}

/** Stage completion is exposure tracking only — mastery still comes from evidence. */
export async function markStageDone(topicId: number, stage: "theory" | "derivations"): Promise<ActionResult> {
  if (!Number.isInteger(topicId) || !["theory", "derivations"].includes(stage)) return { ok: false, error: "Invalid stage" };
  await upsertTopicProgress(topicId, stage === "theory" ? { theoryDoneAt: new Date() } : { derivationsDoneAt: new Date() });
  await awardXp(4, stage === "theory" ? "Theory covered" : "Formulas/derivations covered", { key: `stage:${topicId}:${stage}` });
  refresh();
  return { ok: true };
}

export async function logPracticeResult(
  topicId: number,
  kind: "ncert" | "outside",
  result: "correct" | "wrong" | "skip"
): Promise<ActionResult> {
  if (!Number.isInteger(topicId)) return { ok: false, error: "Invalid topic" };
  const [prog] = await db.select().from(topicProgress).where(eq(topicProgress.topicId, topicId));
  const base = prog ?? { ncertAttempted: 0, ncertCorrect: 0, ncertSkipped: 0, outsideAttempted: 0, outsideCorrect: 0, topicId: 0, theoryDoneAt: null, derivationsDoneAt: null, testScore: null, testAt: null };
  const patch =
    kind === "ncert"
      ? {
          ncertAttempted: base.ncertAttempted + 1,
          ncertCorrect: base.ncertCorrect + (result === "correct" ? 1 : 0),
          ncertSkipped: base.ncertSkipped + (result === "skip" ? 1 : 0),
        }
      : {
          outsideAttempted: base.outsideAttempted + 1,
          outsideCorrect: base.outsideCorrect + (result === "correct" ? 1 : 0),
        };
  await upsertTopicProgress(topicId, patch);
  // Evaluate into the real evidence pool so mastery and revision react
  await db.insert(qAttempts).values({
    topicId,
    question: `Self-marked ${kind.toUpperCase()} question`,
    answer: `self-marked ${result}`,
    correct: result === "correct",
    score: result === "correct" ? 4 : result === "wrong" ? 1 : 0,
    maxScore: 4,
    feedback: "Self-marked practice result",
  });
  if (result === "correct") await awardXp(3, `${kind.toUpperCase()} question correct`, { key: `selfmark:${topicId}:${Date.now()}` });
  refresh();
  return { ok: true };
}

export async function recordTopicTest(topicId: number, scorePct: number, totalQuestions: number): Promise<ActionResult> {
  const parsed = z.object({ topicId: z.number().int(), scorePct: z.number().min(0).max(100), totalQuestions: z.number().int().min(1).max(50) }).safeParse({ topicId, scorePct, totalQuestions });
  if (!parsed.success) return { ok: false, error: "Invalid test data" };
  await upsertTopicProgress(topicId, { testScore: scorePct, testAt: new Date() });
  const sPct = Math.round(scorePct);
  await db.insert(qAttempts).values({
    topicId,
    question: `Topic test (${totalQuestions} questions)`,
    answer: `scored ${sPct}%`,
    correct: sPct >= 60,
    score: Math.min(5, Math.round((sPct / 100) * 5)),
    maxScore: 5,
    feedback: "Topic test result",
  });
  await awardXp(Math.max(5, Math.round(sPct / 10)), `Topic test · ${sPct}%`, { key: `test:${topicId}:${Date.now()}` });
  const { adjustRevision } = await import("./revision");
  await adjustRevision(topicId, scorePct);
  refresh();
  return { ok: true };
}

export async function updateTopicMeta(input: { id: number; priority?: string; prerequisiteId?: number | null; isCurrent?: boolean }): Promise<ActionResult> {
  const parsed = z.object({
    id: z.number().int(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    prerequisiteId: z.number().int().nullable().optional(),
    isCurrent: z.boolean().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid data" };
  const { id, ...patch } = parsed.data;
  await db.update(topics).set({ ...patch, updatedAt: new Date() }).where(eq(topics.id, id));
  refresh();
  return { ok: true };
}

/* --------------------------------- Sessions -------------------------------- */

const sessionSchema = z.object({
  subjectId: z.number().int().nullable(),
  chapterId: z.number().int().nullable(),
  topicId: z.number().int().nullable(),
  date: z.string().regex(dateRe),
  minutes: z.number().int().min(1).max(1440),
  questions: z.number().int().min(0).max(10000),
  correct: z.number().int().min(0).max(10000),
  notes: z.string().max(2000).optional().nullable(),
});

export async function logStudySession(input: z.infer<typeof sessionSchema>): Promise<ActionResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid session data" };
  if (parsed.data.correct > parsed.data.questions) return { ok: false, error: "Correct answers can't exceed total questions" };
  const [row] = await db.insert(studySessions).values({ ...parsed.data, notes: parsed.data.notes ?? null }).returning({ id: studySessions.id });
  await awardXp(Math.max(5, Math.round(parsed.data.minutes / 5)), `Study session · ${parsed.data.minutes} min`, {
    date: parsed.data.date,
    key: `session:${row.id}`,
  });
  refresh();
  return { ok: true };
}

export async function deleteStudySession(id: number): Promise<ActionResult> {
  await db.delete(studySessions).where(eq(studySessions.id, id));
  refresh();
  return { ok: true };
}

export async function getBacklog(): Promise<{
  id: number; name: string; status: string; difficulty: string; isCurrent: boolean; chapterName: string; subjectName: string; subjectColor: string; updatedAt: string;
}[]> {
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      status: topics.status,
      difficulty: topics.difficulty,
      isCurrent: topics.isCurrent,
      chapterName: chapters.name,
      subjectName: subjects.name,
      subjectColor: subjects.color,
      updatedAt: topics.updatedAt,
    })
    .from(topics)
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(sql`${topics.status} != 'done'`)
    .orderBy(desc(topics.isCurrent), desc(topics.updatedAt));
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

/* ---------------------------------- Exams ---------------------------------- */

export async function createExam(input: { name: string; subjectId: number | null; date: string; notes?: string }): Promise<ActionResult> {
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    subjectId: z.number().int().nullable(),
    date: z.string().regex(dateRe),
    notes: z.string().max(2000).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid exam data" };
  await db.insert(exams).values({ ...parsed.data, notes: parsed.data.notes ?? null });
  refresh();
  return { ok: true };
}

export async function updateExam(input: { id: number; name: string; date: string; notes?: string }): Promise<ActionResult> {
  const parsed = z.object({
    id: z.number().int(),
    name: z.string().trim().min(1).max(120),
    date: z.string().regex(dateRe),
    notes: z.string().max(2000).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid exam data" };
  const { id, ...patch } = parsed.data;
  await db.update(exams).set({ ...patch, notes: patch.notes ?? null }).where(eq(exams.id, id));
  refresh();
  return { ok: true };
}

export async function deleteExam(id: number): Promise<ActionResult> {
  await db.delete(exams).where(eq(exams.id, id));
  refresh();
  return { ok: true };
}

export async function setExamChapters(examId: number, chapterIds: number[]): Promise<ActionResult> {
  if (!Number.isInteger(examId)) return { ok: false, error: "Invalid exam" };
  await db.delete(examChapters).where(eq(examChapters.examId, examId));
  if (chapterIds.length) {
    await db.insert(examChapters).values(chapterIds.filter(Number.isInteger).map((chapterId) => ({ examId, chapterId })));
  }
  refresh();
  return { ok: true };
}

/** Deliberate override — recorded honestly, never marks skipped stages as mastered. */
export async function setStageOverride(topicId: number, on: boolean): Promise<ActionResult> {
  if (!Number.isInteger(topicId)) return { ok: false, error: "Invalid topic" };
  await upsertTopicProgress(topicId, { stageOverride: on, overrideAt: on ? new Date() : null });
  refresh();
  return { ok: true };
}
