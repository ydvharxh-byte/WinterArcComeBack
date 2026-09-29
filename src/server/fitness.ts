"use server";

import { db } from "@/db";
import {
  dailyReviews,
  exercises,
  mealItems,
  meals,
  runs,
  workoutSets,
  workouts,
} from "@/db/schema";
import { addDays, todayStr } from "@/lib/dates";
import type { ActionResult, MealDTO, ReviewDTO, RunDTO, WorkoutDTO } from "@/lib/types";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { awardXp } from "./xp";

function refresh() {
  revalidatePath("/", "layout");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/* --------------------------------- Workouts -------------------------------- */

export async function getWorkouts(limit = 40): Promise<WorkoutDTO[]> {
  const workoutRows = await db.select().from(workouts).orderBy(desc(workouts.date), desc(workouts.id)).limit(limit);
  if (workoutRows.length === 0) return [];

  const ids = workoutRows.map((w) => w.id);
  const exerciseRows = await db.select().from(exercises).where(sql`${exercises.workoutId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`).orderBy(asc(exercises.sortOrder), asc(exercises.id));
  const exIds = exerciseRows.map((e) => e.id);
  const setRows = exIds.length
    ? await db.select().from(workoutSets).where(sql`${workoutSets.exerciseId} in (${sql.join(exIds.map((i) => sql`${i}`), sql`, `)})`).orderBy(asc(workoutSets.sortOrder), asc(workoutSets.id))
    : [];

  // historical max weight per exercise name (case-insensitive) across all workouts
  const prRows = await db
    .select({ name: sql<string>`lower(${exercises.name})`, maxW: sql<number>`max(${workoutSets.weightKg})` })
    .from(workoutSets)
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .groupBy(sql`lower(${exercises.name})`);
  const prMap = new Map(prRows.map((r) => [r.name, Number(r.maxW)]));

  return workoutRows.map((w) => {
    const exs = exerciseRows
      .filter((e) => e.workoutId === w.id)
      .map((e) => ({
        id: e.id,
        workoutId: e.workoutId,
        name: e.name,
        sets: setRows
          .filter((s) => s.exerciseId === e.id)
          .map((s) => ({
            id: s.id,
            exerciseId: s.exerciseId,
            reps: s.reps,
            weightKg: s.weightKg,
            isPR: s.weightKg > 0 && Math.abs(s.weightKg - (prMap.get(e.name.toLowerCase()) ?? 0)) < 0.001,
          })),
      }));
    const volume = exs.reduce((a, e) => a + e.sets.reduce((x, s) => x + s.reps * s.weightKg, 0), 0);
    return {
      id: w.id,
      date: w.date,
      name: w.name,
      notes: w.notes,
      durationMin: w.durationMin,
      exercises: exs,
      volume: Math.round(volume),
    };
  });
}

export async function createWorkout(input: { date: string; name: string; notes?: string }): Promise<ActionResult<{ id: number }>> {
  const parsed = z.object({ date: z.string().regex(dateRe), name: z.string().trim().min(1).max(100), notes: z.string().max(2000).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid workout data" };
  const [row] = await db.insert(workouts).values({ ...parsed.data, notes: parsed.data.notes ?? null }).returning({ id: workouts.id });
  await awardXp(20, `Workout: ${parsed.data.name}`, { date: parsed.data.date, key: `workout:${row.id}` });
  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function updateWorkout(id: number, input: { name?: string; notes?: string; durationMin?: number | null }): Promise<ActionResult> {
  const parsed = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().max(2000).optional(),
    durationMin: z.number().int().min(1).max(600).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid data" };
  await db.update(workouts).set(parsed.data).where(eq(workouts.id, id));
  refresh();
  return { ok: true };
}

export async function deleteWorkout(id: number): Promise<ActionResult> {
  await db.delete(workouts).where(eq(workouts.id, id));
  refresh();
  return { ok: true };
}

export async function addExercise(workoutId: number, name: string): Promise<ActionResult<{ id: number }>> {
  const parsed = z.object({ workoutId: z.number().int(), name: z.string().trim().min(1).max(100) }).safeParse({ workoutId, name });
  if (!parsed.success) return { ok: false, error: "Invalid exercise" };
  const [max] = await db.select({ m: sql<number>`coalesce(max(${exercises.sortOrder}),0)` }).from(exercises).where(eq(exercises.workoutId, workoutId));
  const [row] = await db.insert(exercises).values({ workoutId, name, sortOrder: Number(max.m) + 1 }).returning({ id: exercises.id });
  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function deleteExercise(id: number): Promise<ActionResult> {
  await db.delete(exercises).where(eq(exercises.id, id));
  refresh();
  return { ok: true };
}

export async function addSet(input: { exerciseId: number; reps: number; weightKg: number }): Promise<ActionResult> {
  const parsed = z.object({
    exerciseId: z.number().int(),
    reps: z.number().int().min(0).max(1000),
    weightKg: z.number().min(0).max(1000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid set" };
  const [max] = await db.select({ m: sql<number>`coalesce(max(${workoutSets.sortOrder}),0)` }).from(workoutSets).where(eq(workoutSets.exerciseId, parsed.data.exerciseId));
  await db.insert(workoutSets).values({ ...parsed.data, sortOrder: Number(max.m) + 1 });
  refresh();
  return { ok: true };
}

export async function updateSet(id: number, input: { reps: number; weightKg: number }): Promise<ActionResult> {
  const parsed = z.object({ reps: z.number().int().min(0).max(1000), weightKg: z.number().min(0).max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid set" };
  await db.update(workoutSets).set(parsed.data).where(eq(workoutSets.id, id));
  refresh();
  return { ok: true };
}

export async function deleteSet(id: number): Promise<ActionResult> {
  await db.delete(workoutSets).where(eq(workoutSets.id, id));
  refresh();
  return { ok: true };
}

/* ---------------------------------- Running --------------------------------- */

export async function getRuns(limit = 60): Promise<RunDTO[]> {
  const rows = await db.select().from(runs).orderBy(desc(runs.date), desc(runs.id)).limit(limit);
  return rows.map((r) => ({ ...r, type: r.type as "run" | "rest" }));
}

export async function createRun(input: { date: string; type: string; distanceKm?: number | null; durationMin?: number | null; effort?: number | null; notes?: string }): Promise<ActionResult> {
  const parsed = z.object({
    date: z.string().regex(dateRe),
    type: z.enum(["run", "rest"]),
    distanceKm: z.number().min(0).max(500).nullable().optional(),
    durationMin: z.number().min(0).max(2000).nullable().optional(),
    effort: z.number().int().min(1).max(10).nullable().optional(),
    notes: z.string().max(1000).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid run data" };
  const d = parsed.data;
  if (d.type === "run" && (!d.distanceKm || d.distanceKm <= 0)) return { ok: false, error: "Distance is required for a run" };
  const [row] = await db.insert(runs).values({
    date: d.date,
    type: d.type,
    distanceKm: d.type === "run" ? d.distanceKm ?? null : null,
    durationMin: d.type === "run" ? d.durationMin ?? null : null,
    effort: d.effort ?? null,
    notes: d.notes ?? null,
  }).returning({ id: runs.id });
  await awardXp(d.type === "run" ? 15 : 4, d.type === "run" ? `Run · ${d.distanceKm} km` : "Rest day honoured", {
    date: d.date,
    key: `run:${row.id}`,
  });
  refresh();
  return { ok: true };
}

export async function deleteRun(id: number): Promise<ActionResult> {
  await db.delete(runs).where(eq(runs.id, id));
  refresh();
  return { ok: true };
}

/* --------------------------------- Recovery --------------------------------- */

export async function getRecovery(days = 14): Promise<ReviewDTO[]> {
  const since = addDays(todayStr(), -(days - 1));
  const rows = await db.select().from(dailyReviews).where(gte(dailyReviews.date, since)).orderBy(desc(dailyReviews.date));
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    sleepHours: r.sleepHours,
    energy: r.energy,
    restDay: r.restDay,
    note: r.note,
  }));
}

export async function upsertReview(input: { date: string; sleepHours?: number | null; energy?: number | null; restDay?: boolean; note?: string | null }): Promise<ActionResult> {
  const parsed = z.object({
    date: z.string().regex(dateRe),
    sleepHours: z.number().min(0).max(24).nullable().optional(),
    energy: z.number().int().min(1).max(10).nullable().optional(),
    restDay: z.boolean().optional(),
    note: z.string().max(2000).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid review data" };
  const d = parsed.data;
  const [existing] = await db.select().from(dailyReviews).where(eq(dailyReviews.date, d.date));
  if (existing) {
    await db.update(dailyReviews).set({
      sleepHours: d.sleepHours !== undefined ? d.sleepHours : existing.sleepHours,
      energy: d.energy !== undefined ? d.energy : existing.energy,
      restDay: d.restDay !== undefined ? d.restDay : existing.restDay,
      note: d.note !== undefined ? d.note : existing.note,
    }).where(eq(dailyReviews.id, existing.id));
  } else {
    await db.insert(dailyReviews).values({
      date: d.date,
      sleepHours: d.sleepHours ?? null,
      energy: d.energy ?? null,
      restDay: d.restDay ?? false,
      note: d.note ?? null,
    });
    await awardXp(10, "Daily check-in logged", { date: d.date, key: `review:${d.date}` });
  }
  refresh();
  return { ok: true };
}

/* --------------------------------- Nutrition -------------------------------- */

const SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;

export async function getMeals(date: string): Promise<MealDTO[]> {
  const mealRows = await db
    .select()
    .from(meals)
    .where(eq(meals.date, date))
    .orderBy(sql`case ${meals.slot} when 'breakfast' then 0 when 'lunch' then 1 when 'snack' then 2 else 3 end`);
  if (mealRows.length === 0) return [];
  const ids = mealRows.map((m) => m.id);
  const itemRows = await db
    .select()
    .from(mealItems)
    .where(sql`${mealItems.mealId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    .orderBy(asc(mealItems.id));
  return mealRows.map((m) => {
    const items = itemRows.filter((i) => i.mealId === m.id);
    const t = items.reduce(
      (a, i) => ({
        calories: a.calories + i.calories,
        protein: Math.round((a.protein + i.protein) * 10) / 10,
        carbs: Math.round((a.carbs + i.carbs) * 10) / 10,
        fat: Math.round((a.fat + i.fat) * 10) / 10,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return { id: m.id, date: m.date, slot: m.slot, status: m.status as "planned" | "eaten", name: m.name, items, totals: t };
  });
}

export async function ensureMeal(date: string, slot: string, name?: string): Promise<ActionResult<{ id: number }>> {
  if (!dateRe.test(date) || !SLOTS.includes(slot as (typeof SLOTS)[number])) return { ok: false, error: "Invalid meal" };
  const [existing] = await db.select().from(meals).where(and(eq(meals.date, date), eq(meals.slot, slot)));
  if (existing) {
    if (name) await db.update(meals).set({ name }).where(eq(meals.id, existing.id));
    refresh();
    return { ok: true, data: { id: existing.id } };
  }
  // Unique(date, slot) — insert conflict means another request created it concurrently.
  const inserted = await db.insert(meals).values({ date, slot, name: name ?? null }).onConflictDoNothing().returning({ id: meals.id });
  if (inserted.length > 0) {
    refresh();
    return { ok: true, data: { id: inserted[0].id } };
  }
  const [winner] = await db.select().from(meals).where(and(eq(meals.date, date), eq(meals.slot, slot)));
  if (winner) {
    if (name) await db.update(meals).set({ name }).where(eq(meals.id, winner.id));
    refresh();
    return { ok: true, data: { id: winner.id } };
  }
  return { ok: false, error: "Could not create meal" };
}

export async function setMealStatus(id: number, status: string): Promise<ActionResult> {
  if (!["planned", "eaten"].includes(status)) return { ok: false, error: "Invalid status" };
  const [m] = await db.select().from(meals).where(eq(meals.id, id));
  if (!m) return { ok: false, error: "Meal not found" };
  await db.update(meals).set({ status }).where(eq(meals.id, id));
  if (status === "eaten" && m.status !== "eaten") {
    await awardXp(5, `Logged ${m.slot}`, { date: m.date, key: `meal:${id}:eaten` });
  }
  refresh();
  return { ok: true };
}

export async function addMealItem(input: { mealId: number; name: string; portion?: string; calories: number; protein: number; carbs: number; fat: number }): Promise<ActionResult> {
  const parsed = z.object({
    mealId: z.number().int(),
    name: z.string().trim().min(1).max(120),
    portion: z.string().max(80).optional(),
    calories: z.number().int().min(0).max(10000),
    protein: z.number().min(0).max(1000),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(1000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid food item" };
  const { portion, ...rest } = parsed.data;
  await db.insert(mealItems).values({ ...rest, portion: portion ?? null });
  refresh();
  return { ok: true };
}

export async function deleteMealItem(id: number): Promise<ActionResult> {
  await db.delete(mealItems).where(eq(mealItems.id, id));
  refresh();
  return { ok: true };
}

export async function deleteMeal(id: number): Promise<ActionResult> {
  await db.delete(meals).where(eq(meals.id, id));
  refresh();
  return { ok: true };
}

export async function getNutritionRange(start: string, end: string): Promise<{ date: string; calories: number; protein: number }[]> {
  const rows = await db
    .select({
      date: meals.date,
      calories: sql<number>`coalesce(sum(${mealItems.calories}),0)`,
      protein: sql<number>`coalesce(sum(${mealItems.protein}),0)`,
    })
    .from(meals)
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(gte(meals.date, start), lte(meals.date, end), eq(meals.status, "eaten")))
    .groupBy(meals.date)
    .orderBy(meals.date);
  return rows.map((r) => ({ date: r.date, calories: Number(r.calories), protein: Number(r.protein) }));
}
