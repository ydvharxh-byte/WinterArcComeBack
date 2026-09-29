"use server";

import { db } from "@/db";
import {
  chapters,
  dailyPlans,
  examChapters,
  exams,
  revisionItems,
  subjects,
  tasks,
  topics,
} from "@/db/schema";
import { addDays, daysBetween, todayStr } from "@/lib/dates";
import { BLOCK_COLORS } from "@/lib/utils";
import type { ActionResult, NextActionDTO, RevisionItemDTO } from "@/lib/types";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { collectTopicEvidence } from "./study";
import { buildMastery } from "./mastery";

/* ----------------------------- Next best action ------------------------------ */

/**
 * Priority ≈ (100 − mastery) × importance × exam urgency × prerequisite weight.
 * Revision due and mistakes undercut everything else on purpose.
 */
export async function getNextBestAction(): Promise<NextActionDTO | null> {
  const today = todayStr();

  // 1. Revision due is the cheapest high-value win
  const due = await getRevisionDue();
  if (due.length > 0) {
    const r = due[0];
    return {
      type: "revise",
      label: `Revise ${r.topicName}`,
      detail: `${r.subjectName} · ${r.chapterName}${r.daysLate > 0 ? ` · ${r.daysLate}d late` : " · due today"} — spaced repetition keeps it in memory`,
      href: `/tutor?mode=practice&topic=${r.topicId}`,
      score: 1000 - r.daysLate,
      topicId: r.topicId,
    };
  }

  // 2. Exam-critical weak topics (priority × prerequisite-aware)
  const { evidence, lastActivity } = await collectTopicEvidence();
  const examRows = await db
    .select({
      examId: exams.id,
      examName: exams.name,
      date: exams.date,
      topicId: topics.id,
      topicName: topics.name,
      chapterName: chapters.name,
      subjectName: subjects.name,
      status: topics.status,
      priority: topics.priority,
      prerequisiteId: topics.prerequisiteId,
    })
    .from(examChapters)
    .innerJoin(exams, eq(examChapters.examId, exams.id))
    .innerJoin(chapters, eq(examChapters.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .innerJoin(topics, eq(topics.chapterId, chapters.id))
    .where(sql`${exams.date} >= ${today}`)
    .orderBy(asc(exams.date));

  const PRIORITY_W: Record<string, number> = { high: 1.35, medium: 1, low: 0.75 };
  const prereqMap = new Map<number, { id: number; name: string }>();
  for (const r of examRows) if (r.prerequisiteId && !prereqMap.has(r.prerequisiteId)) {
    const [p] = await db.select({ id: topics.id, name: topics.name }).from(topics).where(eq(topics.id, r.prerequisiteId));
    if (p) prereqMap.set(p.id, p);
  }

  let best: NextActionDTO | null = null;
  let bestScore = 0;
  for (const row of examRows) {
    const mastery = buildMastery(row.topicId, evidence, lastActivity, today);
    const unresolvedErrs = evidence.errors[row.topicId]?.unresolved ?? 0;
    const urgency = 14 / Math.max(1, daysBetween(today, row.date));
    const prioW = PRIORITY_W[row.priority] ?? 1;
    const score = ((100 - mastery.score) * urgency + unresolvedErrs * 15 + (row.status === "todo" ? 10 : 0)) * prioW;
    if (score > bestScore) {
      bestScore = score;
      const hasErrors = unresolvedErrs > 0;

      // prerequisite gate: a weak prerequisite outranks the downstream topic
      if (row.prerequisiteId && !hasErrors && mastery.score <= 30) {
        const pre = prereqMap.get(row.prerequisiteId);
        if (pre) {
          const preMastery = buildMastery(pre.id, evidence, lastActivity, today);
          if (preMastery.score < 40) {
            best = {
              type: "return_prerequisite",
              label: `First revisit ${pre.name}`,
              detail: `Prerequisite for ${row.topicName} · its mastery is ${preMastery.score}/100 — fix the base before advancing`,
              href: `/tutor?mode=teach&topic=${pre.id}`,
              score: score + 10,
              topicId: pre.id,
            };
            continue;
          }
        }
      }

      best = {
        type: hasErrors ? "review_mistake" : mastery.score <= 30 ? "learn" : "practice",
        label: `${hasErrors ? "Fix mistakes in" : mastery.score <= 30 ? "Learn" : "Practice"} ${row.topicName}`,
        detail: `${row.subjectName} · ${row.chapterName} · ${row.examName} in ${daysBetween(today, row.date)}d · mastery ${mastery.score}/100${hasErrors ? " · unresolved misconception" : ""}`,
        href: `/tutor?mode=${mastery.score <= 30 ? "teach" : "practice"}&topic=${row.topicId}`,
        score,
        topicId: row.topicId,
      };
    }
  }
  if (best) return best;

  // 3. Backlog: first in-progress topic
  const [inProgress] = await db
    .select({ id: topics.id, name: topics.name, subjectName: subjects.name })
    .from(topics)
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(eq(topics.status, "in_progress"))
    .orderBy(desc(topics.updatedAt))
    .limit(1);
  if (inProgress) {
    return {
      type: "learn",
      label: `Continue ${inProgress.name}`,
      detail: `${inProgress.subjectName} · already in progress — finish what you started`,
      href: `/tutor?mode=teach&topic=${inProgress.id}`,
      score: 10,
      topicId: inProgress.id,
    };
  }
  return null;
}

/* ------------------------------- Revision due -------------------------------- */

export async function getRevisionDue(): Promise<RevisionItemDTO[]> {
  const today = todayStr();
  const rows = await db
    .select({
      r: revisionItems,
      topicName: topics.name,
      chapterName: chapters.name,
      subjectName: subjects.name,
      subjectColor: subjects.color,
    })
    .from(revisionItems)
    .innerJoin(topics, eq(revisionItems.topicId, topics.id))
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(lte(revisionItems.dueDate, today))
    .orderBy(asc(revisionItems.dueDate));
  return rows.map((x) => ({
    id: x.r.id,
    topicId: x.r.topicId,
    topicName: x.topicName,
    chapterName: x.chapterName,
    subjectName: x.subjectName,
    subjectColor: x.subjectColor,
    dueDate: x.r.dueDate,
    intervalDays: x.r.intervalDays,
    level: x.r.level,
    lastScore: x.r.lastScore,
    daysLate: daysBetween(x.r.dueDate, today),
  }));
}

/* ------------------------------ Daily auto-plan ------------------------------ */

interface PlanCandidate {
  title: string;
  minutes: number;
  type: "study" | "task" | "habit";
  reason: string;
  topicId: number | null;
  taskId: number | null;
}

/**
 * Compose a realistic day: revision → exam-critical weak topics → due tasks.
 * Fills free gaps between 06:00–22:00 without overlapping existing blocks.
 * Idempotent: blocks whose title already exists that day are skipped.
 */
export async function generateDailyPlan(targetDate: string): Promise<ActionResult<{ created: number; summary: string[] }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { ok: false, error: "Invalid date" };
  const today = todayStr();
  if (targetDate < addDays(today, -1)) return { ok: false, error: "Pick today or a future date" };

  const existing = await db.select().from(dailyPlans).where(eq(dailyPlans.date, targetDate));
  const existingTitles = new Set(existing.map((b) => b.title.toLowerCase()));

  const candidates: PlanCandidate[] = [];

  // 1. Revision due
  const due = await getRevisionDue();
  for (const r of due.slice(0, 2)) {
    candidates.push({
      title: `Revision: ${r.topicName}`,
      minutes: 30,
      type: "study",
      reason: `Spaced repetition due${r.daysLate > 0 ? ` (${r.daysLate}d late)` : " today"} — ${r.subjectName} · ${r.chapterName}`,
      topicId: r.topicId,
      taskId: null,
    });
  }

  // 2. Exam-critical weak topics
  const { evidence, lastActivity } = await collectTopicEvidence();
  const examRows = await db
    .select({
      examName: exams.name, date: exams.date, topicId: topics.id, topicName: topics.name,
      chapterName: chapters.name, subjectName: subjects.name, subjectColor: subjects.color, status: topics.status,
      priority: topics.priority,
    })
    .from(examChapters)
    .innerJoin(exams, eq(examChapters.examId, exams.id))
    .innerJoin(chapters, eq(examChapters.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .innerJoin(topics, eq(topics.chapterId, chapters.id))
    .where(sql`${exams.date} >= ${today}`)
    .orderBy(asc(exams.date));

  const PRIO_W: Record<string, number> = { high: 1.35, medium: 1, low: 0.75 };
  const ranked = examRows
    .map((row) => {
      const mastery = buildMastery(row.topicId, evidence, lastActivity, today);
      const urgency = 14 / Math.max(1, daysBetween(today, row.date));
      return { row, mastery, score: (100 - mastery.score) * urgency * (PRIO_W[row.priority] ?? 1) };
    })
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.mastery.score < 86)
    .slice(0, 2);

  const seenTopics = new Set<number>();
  for (const { row, mastery } of ranked) {
    if (seenTopics.has(row.topicId)) continue;
    seenTopics.add(row.topicId);
    const needsConcept = mastery.score <= 30;
    candidates.push({
      title: `${needsConcept ? "Learn" : "Practice"}: ${row.topicName}`,
      minutes: needsConcept ? 60 : 45,
      type: "study",
      reason: `${row.subjectName} · ${row.chapterName} · ${row.examName} in ${daysBetween(today, row.date)}d · mastery ${mastery.score}/100 — ${needsConcept ? "concept first, then checks" : "question practice"}`,
      topicId: row.topicId,
      taskId: null,
    });
  }

  // 3. Due/high-priority tasks with estimates
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(sql`${tasks.status} != 'completed'`, sql`(${tasks.dueDate} is null or ${tasks.dueDate} <= ${addDays(targetDate, 1)})`))
    .orderBy(sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 else 2 end`, sql`${tasks.dueDate} asc nulls last`)
    .limit(3);
  for (const t of taskRows) {
    candidates.push({
      title: t.title,
      minutes: t.estimatedMinutes ?? 45,
      type: "task",
      reason: `${t.priority} priority task${t.dueDate ? ` · due ${t.dueDate === today ? "today" : t.dueDate === addDays(today, 1) ? "tomorrow" : t.dueDate}` : ""}`,
      topicId: null,
      taskId: t.id,
    });
  }

  // free gaps 06:00–22:00 in 30-min steps
  const DAY_A = 6 * 60, DAY_B = 22 * 60;
  const busy = existing.map((b) => [b.startMin, b.endMin] as const).sort((a, b) => a[0] - b[0]);
  const freeAt = (start: number, dur: number) =>
    start + dur <= DAY_B && busy.every(([s, e]) => start + dur <= s || start >= e);

  const created: string[] = [];
  let totalMin = 0;
  const MAX_MIN = 240; // never create impossible days

  let cursor = candidates.length > 2 ? 8 * 60 : 16 * 60; // revision-heavy days start earlier
  for (const c of candidates) {
    if (created.length >= 4 || totalMin + c.minutes > MAX_MIN) break;
    if (existingTitles.has(c.title.toLowerCase())) continue;
    const dur = Math.min(90, Math.max(30, Math.round(c.minutes / 15) * 15));
    let start = -1;
    for (let t = Math.max(DAY_A, cursor); t <= DAY_B - dur; t += 30) {
      if (freeAt(t, dur)) {
        start = t;
        break;
      }
    }
    if (start === -1) continue;
    await db.insert(dailyPlans).values({
      date: targetDate,
      startMin: start,
      endMin: Math.min(1440, start + dur),
      type: c.type,
      title: c.title,
      taskId: c.taskId,
      reason: c.reason,
      color: BLOCK_COLORS[c.type] ?? BLOCK_COLORS.study,
    });
    busy.push([start, start + dur]);
    busy.sort((a, b) => a[0] - b[0]);
    cursor = start + dur;
    totalMin += dur;
    created.push(c.title);
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      created: created.length,
      summary: created.length
        ? created
        : ["No room or nothing pending — the day is either full or you're on top of things."],
    },
  };
}

/* ------------------------- Autumn / PCM recovery mode ------------------------
   15–25 October: a focused backlog-recovery block. Meaningful progress, not
   maximum hours — capped daily load, revision protected, evidence-driven. */

const BREAK_START = "2026-10-15";
const BREAK_END = "2026-10-25";

export interface BreakPlanDay {
  date: string;
  blocks: { title: string; minutes: number; reason: string; subject: string }[];
  totalMinutes: number;
}

export async function getBreakWindow(): Promise<{ active: boolean; daysUntil: number; start: string; end: string }> {
  const today = todayStr();
  return {
    active: today >= BREAK_START && today <= BREAK_END,
    daysUntil: daysBetween(today, BREAK_START),
    start: BREAK_START,
    end: BREAK_END,
  };
}

/**
 * Build the Autumn Break recovery plan across 15–25 Oct.
 * Picks weakest × highest-importance backlog topics per subject, rotates PCM,
 * caps 3 focused blocks (~3h) per day and always leaves revision room.
 */
export async function generateBreakPlan(dryRun = false): Promise<ActionResult<{ days: BreakPlanDay[]; created: number }>> {
  const today = todayStr();
  const { evidence, lastActivity } = await collectTopicEvidence();

  const rows = await db
    .select({
      topicId: topics.id, topicName: topics.name, estimated: topics.estimatedMinutes,
      importance: topics.importance, status: topics.status, isCurrent: topics.isCurrent,
      chapterName: chapters.name, subjectName: subjects.name,
    })
    .from(topics)
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(sql`${topics.status} != 'done'`);

  if (rows.length === 0) return { ok: false, error: "No pending topics — set up your backlog first" };

  const IMP_W: Record<string, number> = { high: 1.4, medium: 1, low: 0.7 };
  const ranked = rows
    .map((r) => {
      const m = buildMastery(r.topicId, evidence, lastActivity, today);
      const errs = evidence.errors[r.topicId]?.unresolved ?? 0;
      return { ...r, mastery: m.score, score: (100 - m.score) * (IMP_W[r.importance] ?? 1) + errs * 12 + (r.isCurrent ? 15 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  // rotate subjects so no single subject dominates the break
  const bySubject = new Map<string, typeof ranked>();
  for (const r of ranked) {
    if (!bySubject.has(r.subjectName)) bySubject.set(r.subjectName, []);
    bySubject.get(r.subjectName)!.push(r);
  }
  const subjectNames = [...bySubject.keys()];

  const days: BreakPlanDay[] = [];
  const used = new Set<number>();
  const dayCount = daysBetween(BREAK_START, BREAK_END) + 1;

  for (let i = 0; i < dayCount; i++) {
    const date = addDays(BREAK_START, i);
    const blocks: BreakPlanDay["blocks"] = [];
    let minutes = 0;
    for (let k = 0; k < subjectNames.length && blocks.length < 3; k++) {
      const subject = subjectNames[(i + k) % subjectNames.length];
      const pick = bySubject.get(subject)!.find((t) => !used.has(t.topicId));
      if (!pick) continue;
      used.add(pick.topicId);
      const dur = Math.min(90, Math.max(45, pick.estimated));
      if (minutes + dur > 210) break; // hard daily cap — meaningful, not maximal
      blocks.push({
        title: `${pick.mastery <= 30 ? "Learn" : "Practice"}: ${pick.topicName}`,
        minutes: dur,
        subject: pick.subjectName,
        reason: `${pick.chapterName} · ${pick.importance} importance · mastery ${pick.mastery}/100${pick.isCurrent ? " · current syllabus" : " · backlog"}`,
      });
      minutes += dur;
    }
    if (blocks.length > 0) days.push({ date, blocks, totalMinutes: minutes });
  }

  if (dryRun) return { ok: true, data: { days, created: 0 } };

  let created = 0;
  for (const day of days) {
    const existing = await db.select().from(dailyPlans).where(eq(dailyPlans.date, day.date));
    const titles = new Set(existing.map((b) => b.title.toLowerCase()));
    let cursor = 9 * 60; // break-day start
    for (const b of day.blocks) {
      if (titles.has(b.title.toLowerCase())) continue;
      const overlaps = (s: number, e: number) => existing.some((x) => s < x.endMin && e > x.startMin);
      let start = cursor;
      while (start + b.minutes <= 21 * 60 && overlaps(start, start + b.minutes)) start += 30;
      if (start + b.minutes > 21 * 60) break;
      await db.insert(dailyPlans).values({
        date: day.date,
        startMin: start,
        endMin: start + b.minutes,
        type: "study",
        title: b.title,
        reason: `Autumn break recovery · ${b.reason}`,
        color: BLOCK_COLORS.study,
      });
      cursor = start + b.minutes + 30; // breathing room between blocks
      created++;
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { days, created } };
}
