"use server";

import { db } from "@/db";
import { chapters, dailyPlans, habitLogs, habits, subjects, tasks } from "@/db/schema";
import { addDays, todayStr } from "@/lib/dates";
import type { ActionResult, HabitDTO, PlanBlockDTO, TaskDTO } from "@/lib/types";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { awardXp } from "./xp";

function refresh() {
  revalidatePath("/", "layout");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const priorityXp: Record<string, number> = { low: 8, medium: 12, high: 20 };

const blockLinkSchema = z.object({
  taskId: z.number().int().nullable().optional(),
  studySessionId: z.number().int().nullable().optional(),
  examId: z.number().int().nullable().optional(),
  workoutId: z.number().int().nullable().optional(),
  runId: z.number().int().nullable().optional(),
  mealId: z.number().int().nullable().optional(),
  habitId: z.number().int().nullable().optional(),
});

/* ---------------------------------- Tasks ---------------------------------- */

export async function getTasks(): Promise<TaskDTO[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      status: tasks.status,
      dueDate: tasks.dueDate,
      scheduledDate: tasks.scheduledDate,
      startMin: tasks.startMin,
      estimatedMinutes: tasks.estimatedMinutes,
      subjectId: tasks.subjectId,
      chapterId: tasks.chapterId,
      topicId: tasks.topicId,
      subjectName: subjects.name,
      subjectColor: subjects.color,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(subjects, eq(tasks.subjectId, subjects.id))
    .orderBy(
      sql`case ${tasks.status} when 'in_progress' then 0 when 'todo' then 1 else 2 end`,
      sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 else 2 end`,
      sql`${tasks.dueDate} asc nulls last`,
      desc(tasks.createdAt)
    );
  return rows.map((r) => ({ ...r, priority: r.priority as TaskDTO["priority"], status: r.status as TaskDTO["status"] }));
}

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().regex(dateRe).nullable().optional(),
  scheduledDate: z.string().regex(dateRe).nullable().optional(),
  startMin: z.number().int().min(0).max(1439).nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  subjectId: z.number().int().nullable().optional(),
  chapterId: z.number().int().nullable().optional(),
  topicId: z.number().int().nullable().optional(),
});

export async function createTask(input: z.infer<typeof taskSchema>): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid task data" };
  const d = parsed.data;
  await db.insert(tasks).values({
    title: d.title,
    description: d.description ?? null,
    priority: d.priority,
    dueDate: d.dueDate ?? null,
    scheduledDate: d.scheduledDate ?? null,
    startMin: d.startMin ?? null,
    estimatedMinutes: d.estimatedMinutes ?? null,
    subjectId: d.subjectId ?? null,
    chapterId: d.chapterId ?? null,
    topicId: d.topicId ?? null,
  });
  refresh();
  return { ok: true };
}

export async function updateTask(id: number, input: Partial<z.infer<typeof taskSchema>>): Promise<ActionResult> {
  const parsed = taskSchema.partial().safeParse(input);
  if (!parsed.success || !Number.isInteger(id)) return { ok: false, error: "Invalid task data" };
  const d = parsed.data;
  await db.update(tasks).set({
    ...(d.title !== undefined && { title: d.title }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.priority !== undefined && { priority: d.priority }),
    ...(d.dueDate !== undefined && { dueDate: d.dueDate }),
    ...(d.scheduledDate !== undefined && { scheduledDate: d.scheduledDate }),
    ...(d.startMin !== undefined && { startMin: d.startMin }),
    ...(d.estimatedMinutes !== undefined && { estimatedMinutes: d.estimatedMinutes }),
    ...(d.subjectId !== undefined && { subjectId: d.subjectId }),
    ...(d.chapterId !== undefined && { chapterId: d.chapterId }),
    ...(d.topicId !== undefined && { topicId: d.topicId }),
  }).where(eq(tasks.id, id));
  refresh();
  return { ok: true };
}

export async function setTaskStatus(id: number, status: string): Promise<ActionResult> {
  if (!["todo", "in_progress", "completed"].includes(status)) return { ok: false, error: "Invalid status" };
  const [prev] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!prev) return { ok: false, error: "Task not found" };
  const becomingDone = status === "completed" && prev.status !== "completed";
  await db.update(tasks).set({
    status,
    completedAt: status === "completed" ? new Date() : null,
  }).where(eq(tasks.id, id));
  if (becomingDone) {
    // Mark linked plan blocks done as well (planned → actual, single source of truth).
    await db
      .update(dailyPlans)
      .set({ done: true, doneAt: new Date() })
      .where(and(eq(dailyPlans.taskId, id), eq(dailyPlans.done, false)));
    await awardXp(priorityXp[prev.priority] ?? 10, `Completed task: ${prev.title}`, { key: `task:${id}:completed` });
  }
  refresh();
  return { ok: true };
}

export async function deleteTask(id: number): Promise<ActionResult> {
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh();
  return { ok: true };
}

/* ------------------------------- Plan blocks ------------------------------- */

export async function getPlanRange(start: string, end: string): Promise<PlanBlockDTO[]> {
  return db
    .select()
    .from(dailyPlans)
    .where(and(gte(dailyPlans.date, start), lte(dailyPlans.date, end)))
    .orderBy(asc(dailyPlans.date), asc(dailyPlans.startMin));
}

const blockSchema = z
  .object({
    date: z.string().regex(dateRe),
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(1).max(1440),
    type: z.enum(["task", "study", "exam", "gym", "run", "meal", "habit", "rest", "other"]),
    title: z.string().trim().min(1).max(160),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  })
  .merge(blockLinkSchema);

export async function createPlanBlock(input: z.infer<typeof blockSchema>): Promise<ActionResult> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid block data" };
  if (parsed.data.endMin <= parsed.data.startMin) return { ok: false, error: "End time must be after start time" };
  const d = parsed.data;
  await db.insert(dailyPlans).values({
    date: d.date,
    startMin: d.startMin,
    endMin: d.endMin,
    type: d.type,
    title: d.title,
    color: d.color ?? null,
    taskId: d.taskId ?? null,
    studySessionId: d.studySessionId ?? null,
    examId: d.examId ?? null,
    workoutId: d.workoutId ?? null,
    runId: d.runId ?? null,
    mealId: d.mealId ?? null,
    habitId: d.habitId ?? null,
  });
  refresh();
  return { ok: true };
}

export async function updatePlanBlock(
  id: number,
  input: Partial<z.infer<typeof blockSchema>> & { done?: boolean; actualMinutes?: number | null }
): Promise<ActionResult> {
  const parsed = blockSchema.partial().extend({ done: z.boolean().optional(), actualMinutes: z.number().int().min(0).max(1440).nullable().optional() }).safeParse(input);
  if (!parsed.success || !Number.isInteger(id)) return { ok: false, error: "Invalid block data" };
  const [existing] = await db.select().from(dailyPlans).where(eq(dailyPlans.id, id));
  if (!existing) return { ok: false, error: "Block not found" };
  const next = { ...existing, ...parsed.data };
  if (next.endMin <= next.startMin) return { ok: false, error: "End time must be after start time" };
  await db.update(dailyPlans).set({
    date: next.date,
    startMin: next.startMin,
    endMin: next.endMin,
    type: next.type,
    title: next.title,
    color: next.color ?? null,
    done: parsed.data.done ?? existing.done,
    actualMinutes: parsed.data.actualMinutes !== undefined ? parsed.data.actualMinutes : existing.actualMinutes,
    taskId: parsed.data.taskId !== undefined ? parsed.data.taskId : existing.taskId,
  }).where(eq(dailyPlans.id, id));
  refresh();
  return { ok: true };
}

export async function toggleBlockDone(id: number): Promise<ActionResult> {
  const [block] = await db.select().from(dailyPlans).where(eq(dailyPlans.id, id));
  if (!block) return { ok: false, error: "Block not found" };
  const next = !block.done;
  await db.update(dailyPlans).set({
    done: next,
    doneAt: next ? new Date() : null,
    // Default the actual duration to the planned one; user can adjust afterwards.
    actualMinutes: next && block.actualMinutes == null ? block.endMin - block.startMin : block.actualMinutes,
  }).where(eq(dailyPlans.id, id));
  if (next) {
    if (block.type === "task" && block.taskId) {
      const [t] = await db.select().from(tasks).where(eq(tasks.id, block.taskId));
      if (t && t.status !== "completed") {
        await db.update(tasks).set({ status: "completed", completedAt: new Date() }).where(eq(tasks.id, t.id));
        await awardXp(priorityXp[t.priority] ?? 10, `Completed task: ${t.title}`, { key: `task:${t.id}:completed` });
      } else {
        await awardXp(5, `Completed block: ${block.title}`, { date: block.date, key: `block:${block.id}:done` });
      }
    } else {
      await awardXp(5, `Completed block: ${block.title}`, { date: block.date, key: `block:${block.id}:done` });
    }
  }
  refresh();
  return { ok: true };
}

export async function deletePlanBlock(id: number): Promise<ActionResult> {
  await db.delete(dailyPlans).where(eq(dailyPlans.id, id));
  refresh();
  return { ok: true };
}

export async function rescheduleBlock(id: number, date: string, startMin: number): Promise<ActionResult> {
  if (!dateRe.test(date)) return { ok: false, error: "Invalid date" };
  const [block] = await db.select().from(dailyPlans).where(eq(dailyPlans.id, id));
  if (!block) return { ok: false, error: "Block not found" };
  const dur = block.endMin - block.startMin;
  const clampedStart = Math.max(0, Math.min(1439, startMin));
  const clampedEnd = Math.min(1440, clampedStart + dur);
  if (clampedEnd <= clampedStart) return { ok: false, error: "Invalid time" };
  await db.update(dailyPlans).set({ date, startMin: clampedStart, endMin: clampedEnd }).where(eq(dailyPlans.id, id));
  refresh();
  return { ok: true };
}

export async function planTask(taskId: number, date: string, startMin: number): Promise<ActionResult> {
  if (!dateRe.test(date)) return { ok: false, error: "Invalid date" };
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!t) return { ok: false, error: "Task not found" };
  const est = t.estimatedMinutes ?? 45;
  const endMin = Math.min(1440, startMin + est);
  if (endMin <= startMin) return { ok: false, error: "Invalid time" };
  await db.insert(dailyPlans).values({
    date,
    startMin,
    endMin,
    type: "task",
    title: t.title,
    taskId: t.id,
    color: t.priority === "high" ? "#F87171" : t.priority === "medium" ? "#FBBF24" : "#34D399",
  });
  await db.update(tasks).set({ scheduledDate: date, startMin }).where(eq(tasks.id, taskId));
  refresh();
  return { ok: true };
}

/* ---------------------------------- Habits --------------------------------- */

export async function getHabits(rangeDays = 42): Promise<HabitDTO[]> {
  const habitRows = await db.select().from(habits).orderBy(asc(habits.createdAt));
  const since = addDays(todayStr(), -(rangeDays - 1));
  const logs = await db.select().from(habitLogs).where(gte(habitLogs.date, since));
  const today = todayStr();
  const yesterday = addDays(today, -1);

  return habitRows.map((h) => {
    const dates = logs.filter((l) => l.habitId === h.id).map((l) => l.date);
    const set = new Set(dates);
    let streak = 0;
    let cursor = set.has(today) ? today : yesterday;
    while (set.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    const last30 = dates.filter((d) => d >= addDays(today, -29)).length;
    return {
      id: h.id,
      name: h.name,
      color: h.color,
      streak,
      rate30: Math.round((last30 / 30) * 100),
      logs: dates,
    };
  });
}

export async function createHabit(input: { name: string; color: string }): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid habit data" };
  await db.insert(habits).values(parsed.data);
  refresh();
  return { ok: true };
}

export async function deleteHabit(id: number): Promise<ActionResult> {
  await db.delete(habits).where(eq(habits.id, id));
  refresh();
  return { ok: true };
}

export async function toggleHabit(habitId: number, date: string): Promise<ActionResult> {
  if (!dateRe.test(date)) return { ok: false, error: "Invalid date" };
  const [existing] = await db.select().from(habitLogs).where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)));
  if (existing) {
    await db.delete(habitLogs).where(eq(habitLogs.id, existing.id));
  } else {
    const [h] = await db.select().from(habits).where(eq(habits.id, habitId));
    if (!h) return { ok: false, error: "Habit not found" };
    await db.insert(habitLogs).values({ habitId, date }).onConflictDoNothing();
    await awardXp(5, `Habit: ${h.name}`, { date, key: `habit:${habitId}:${date}` });
  }
  refresh();
  return { ok: true };
}

/* --------------------------------- Chapters -------------------------------- */

export async function getChapterOptions(): Promise<{ id: number; name: string; subjectName: string }[]> {
  const rows = await db
    .select({ id: chapters.id, name: chapters.name, subjectName: subjects.name })
    .from(chapters)
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .orderBy(asc(subjects.name), asc(chapters.sortOrder));
  return rows;
}
