import { db } from "@/db";
import {
  chapters,
  dailyPlans,
  errorLogs,
  exams,
  examChapters,
  revisionItems,
  settings,
  studySessions,
  subjects,
  tasks,
  topics,
} from "@/db/schema";
import { addDays, daysBetween, todayStr } from "@/lib/dates";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { collectTopicEvidence, getExams } from "../study";
import { buildMastery } from "../mastery";

/**
 * The student's real academic state — built from the database on every call.
 * Missing information is explicitly null (the AI must never invent it).
 */
export async function buildStudentContext() {
  const today = todayStr();
  const settingsRows = await db.select().from(settings);
  const smap = new Map(settingsRows.map((r) => [r.key, r.value]));

  const subjectRows = await db.select().from(subjects);
  const chapterRows = await db.select().from(chapters);
  const topicRows = await db.select().from(topics);
  const { evidence, lastActivity } = await collectTopicEvidence();

  const subjectMap = new Map(subjectRows.map((s) => [s.id, s.name]));
  const chapterMap = new Map(chapterRows.map((c) => [c.id, c]));

  // mastery for every topic that has a status or evidence
  const topicList = topicRows.map((t) => ({
    id: t.id,
    name: t.name,
    subject: subjectMap.get(chapterMap.get(t.chapterId)?.subjectId ?? 0) ?? null,
    chapter: chapterMap.get(t.chapterId)?.name ?? null,
    status: t.status,
    difficulty: t.difficulty,
    mastery: buildMastery(t.id, evidence, lastActivity, today).score,
    errors: (evidence.errors[t.id]?.unresolved ?? 0) > 0
      ? `${evidence.errors[t.id]!.unresolved} unresolved misconception(s)`
      : undefined,
  }));

  const errorRows = await db.select().from(errorLogs).orderBy(desc(errorLogs.count), desc(errorLogs.lastSeen)).limit(20);
  const examList = await getExams();
  const taskRows = await db.select().from(tasks).where(sql`${tasks.status} != 'completed'`).orderBy(sql`${tasks.dueDate} asc nulls last`).limit(15);
  const backlogCount = topicRows.filter((t) => t.status !== "done").length;

  const revisionRows = await db
    .select({ r: revisionItems, topic: topics.name, chapter: chapters.name, subject: subjects.name })
    .from(revisionItems)
    .innerJoin(topics, eq(revisionItems.topicId, topics.id))
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(lte(revisionItems.dueDate, today))
    .orderBy(asc(revisionItems.dueDate))
    .limit(10);

  const [weekStudy] = await db
    .select({ total: sql<number>`coalesce(sum(${studySessions.minutes}),0)` })
    .from(studySessions)
    .where(gte(studySessions.date, addDays(today, -6)));

  const planRows = await db.select().from(dailyPlans).where(eq(dailyPlans.date, today)).orderBy(dailyPlans.startMin);

  return {
    generatedAt: today,
    profile: {
      classLevel: smap.get("classLevel") ? Number(smap.get("classLevel")) : null, // unknown if null
      board: smap.get("board") ?? null, // unknown if null
      dailyStudyTargetMin: Number(smap.get("studyTargetMin") ?? 180),
    },
    subjects: subjectRows.map((s) => ({ id: s.id, name: s.name })),
    topics: topicList,
    errorLog: errorRows.map((e) => ({
      tag: e.tag,
      detail: e.detail,
      count: e.count,
      status: e.status,
      topic: e.topicId ? topicRows.find((t) => t.id === e.topicId)?.name ?? null : null,
      subject: e.subjectId ? subjectMap.get(e.subjectId) ?? null : null,
      lastSeen: e.lastSeen,
    })),
    exams: examList.map((e) => ({
      name: e.name,
      date: e.date,
      daysRemaining: e.daysRemaining,
      subject: e.subjectName,
      preparationPct: e.progress,
      weakLinkedTopics: topicList
        .filter((t) => e.chapters.some((c) => c.name === t.chapter))
        .filter((t) => t.mastery < 50)
        .map((t) => ({ name: t.name, mastery: t.mastery })),
    })),
    homework: taskRows.map((t) => ({
      title: t.title, dueDate: t.dueDate, priority: t.priority, estimatedMinutes: t.estimatedMinutes,
    })),
    backlog: { openTopics: backlogCount },
    revisionDueToday: revisionRows.map((r) => ({
      topic: r.topic, chapter: r.chapter, subject: r.subject,
      daysLate: daysBetween(r.r.dueDate, today), intervalDays: r.r.intervalDays,
    })),
    recentStudyMinutes7d: Number(weekStudy.total),
    todayPlanBlocks: planRows.map((b) => ({ title: b.title, done: b.done, type: b.type })),
    unknownNote:
      "Fields that are null are UNKNOWN — do not assume them (e.g. class board, school/tuition schedule, available hours per weekday).",
  };
}

export type StudentContext = Awaited<ReturnType<typeof buildStudentContext>>;
