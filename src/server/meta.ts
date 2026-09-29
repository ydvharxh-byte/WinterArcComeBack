"use server";

import { db } from "@/db";
import {
  chapters,
  dailyPlans,
  dailyReviews,
  examChapters,
  exams,
  exercises,
  habitLogs,
  habits,
  mealItems,
  meals,
  runs,
  settings,
  studySessions,
  subjects,
  tasks,
  topics,
  winterArc,
  workoutSets,
  workouts,
  xpTransactions,
} from "@/db/schema";
import { addDays, daysBetween, startOfWeekMonday, todayStr } from "@/lib/dates";
import {
  ACHIEVEMENTS,
  ARC_END,
  ARC_START,
  arcSnapshot,
  levelFromXp,
  phaseForDate,
  unlockedAchievements,
  type AchievementStats,
} from "@/lib/gamification";
import type { ActionResult, LevelDTO, SettingsDTO, ShellData } from "@/lib/types";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExams, getStudyTree } from "./study";
import { getNextBestAction } from "./engine";
import { seedStarter } from "./seed-data";
import { activityStreak, totalXp } from "./xp";

function refresh() {
  revalidatePath("/", "layout");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/* --------------------------------- Settings -------------------------------- */

export async function getSettings(): Promise<SettingsDTO> {
  try {
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      name: map.get("name") ?? "Student",
      accent: map.get("accent") ?? "#2563EB",
      studyTargetMin: Number(map.get("studyTargetMin") ?? 180),
      classLevel: map.get("classLevel") ? Number(map.get("classLevel")) : null,
      board: map.get("board") ?? null,
    };
  } catch (err) {
    console.error("Notice: settings read fallback:", err);
    return {
      name: "Student",
      accent: "#2563EB",
      studyTargetMin: 180,
      classLevel: null,
      board: null,
    };
  }
}

export async function updateSettings(input: Partial<SettingsDTO>): Promise<ActionResult> {
  const parsed = z.object({
    name: z.string().trim().min(1).max(40).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    studyTargetMin: z.number().int().min(15).max(960).optional(),
    classLevel: z.number().int().min(6).max(12).nullable().optional(),
    board: z.string().max(20).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings" };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    await db.insert(settings).values({ key: k, value: String(v) }).onConflictDoUpdate({ target: settings.key, set: { value: String(v) } });
  }
  refresh();
  return { ok: true };
}

/* ---------------------------------- Shell ---------------------------------- */

export async function getShellData(): Promise<ShellData> {
  try {
    const [s, xp, streak] = await Promise.all([
      getSettings().catch(() => ({ name: "Student", accent: "#2563EB", studyTargetMin: 180, classLevel: null, board: null })),
      totalXp().catch(() => 0),
      activityStreak().catch(() => ({ current: 0, longest: 0, todayActive: false })),
    ]);
    return {
      settings: s,
      level: levelFromXp(xp) as LevelDTO,
      streak: streak.current,
      arc: arcSnapshot(todayStr()),
      today: todayStr(),
    };
  } catch (err) {
    console.error("Notice: shell data fallback:", err);
    return {
      settings: {
        name: "Student",
        accent: "#2563EB",
        studyTargetMin: 180,
        classLevel: null,
        board: null,
      },
      level: levelFromXp(0) as LevelDTO,
      streak: 0,
      arc: arcSnapshot(todayStr()),
      today: todayStr(),
    };
  }
}

/* --------------------------------- Dashboard -------------------------------- */

export async function getDashboard() {
  const today = todayStr();
  const weekStart = addDays(today, -6);

  try {
    const s = await getSettings();
    const xp = await totalXp().catch(() => 0);
    const streak = await activityStreak().catch(() => ({ current: 0, longest: 0, todayActive: false }));
    const todayBlocks = await db.select().from(dailyPlans).where(eq(dailyPlans.date, today)).orderBy(asc(dailyPlans.startMin)).catch(() => []);
    const allHabits = await db.select().from(habits).orderBy(asc(habits.createdAt)).catch(() => []);
    const habitLogRows = await db.select().from(habitLogs).where(eq(habitLogs.date, today)).catch(() => []);
    const priorityTasks = await db.select().from(tasks).where(sql`${tasks.status} != 'completed'`).orderBy(sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 else 2 end`, sql`${tasks.dueDate} asc nulls last`).limit(6).catch(() => []);
    const dueTasks = await db.select().from(tasks).where(eq(tasks.dueDate, today)).catch(() => []);
    const examList = await getExams().catch(() => []);
    const [studyToday] = await db.select({ total: sql<number>`coalesce(sum(${studySessions.minutes}),0)` }).from(studySessions).where(eq(studySessions.date, today)).catch(() => [{ total: 0 }]);
    const [studyWeek] = await db.select({ total: sql<number>`coalesce(sum(${studySessions.minutes}),0)` }).from(studySessions).where(gte(studySessions.date, weekStart)).catch(() => [{ total: 0 }]);
    const studyByDayRows = await db.select({ date: studySessions.date, total: sql<number>`sum(${studySessions.minutes})` }).from(studySessions).where(gte(studySessions.date, weekStart)).groupBy(studySessions.date).catch(() => []);
    const lastWorkout = await db.select().from(workouts).orderBy(desc(workouts.date), desc(workouts.id)).limit(1).catch(() => []);
    const runRows = await db.select().from(runs).where(gte(runs.date, weekStart)).catch(() => []);
    const reviewToday = await db.select().from(dailyReviews).where(eq(dailyReviews.date, today)).catch(() => []);
    const [workoutsWeek] = await db.select({ n: sql<number>`count(*)` }).from(workouts).where(gte(workouts.date, startOfWeekMonday(today))).catch(() => [{ n: 0 }]);
    const subjectRows = await db.select().from(subjects).catch(() => []);
    const subjectMap = new Map(subjectRows.map((x) => [x.id, { name: x.name, color: x.color }]));
    const nextAction = await getNextBestAction().catch(() => null);
    const { getBacklogTree } = await import("./pcm");
    const { getBreakWindow } = await import("./engine");
    const pcm = await getBacklogTree().catch(() => []);
    const breakWindow = await getBreakWindow().catch(() => null);
    const { getRevisionDue } = await import("./engine");
    const revisionDue = await getRevisionDue().catch(() => []);
    const tree = await getStudyTree().catch(() => []);
    const weakTopics = tree
      .flatMap((s) => s.chapters.flatMap((c) => c.topics.map((x) => ({ ...x, subjectName: s.name, subjectColor: s.color }))))
      .filter((x) => x.mastery.score > 0 && x.mastery.score < 50)
      .sort((a, b) => a.mastery.score - b.mastery.score)
      .slice(0, 5);

    const blocks = todayBlocks;
    const blocksDone = blocks.filter((b) => b.done).length;
    const dueDone = dueTasks.filter((t) => t.status === "completed").length;
    const totalItems = blocks.length + dueTasks.length;
    const completion = totalItems ? Math.round(((blocksDone + dueDone) / totalItems) * 100) : 0;

    const studyWeekMap = new Map(studyByDayRows.map((r) => [r.date, Number(r.total)]));
    const study7d = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, minutes: Number(studyWeekMap.get(d) ?? 0) };
    });

    const runsThisWeekKm = runRows.filter((r) => r.type === "run").reduce((a, r) => a + (r.distanceKm ?? 0), 0);

    return {
      today,
      settings: s,
      level: levelFromXp(xp),
      streak: streak.current,
      blocks,
      completion,
      habits: allHabits.map((h) => ({ ...h, doneToday: habitLogRows.some((l) => l.habitId === h.id) })),
      priorityTasks: priorityTasks.map((t) => ({ ...t, subjectName: t.subjectId ? subjectMap.get(t.subjectId)?.name ?? null : null, subjectColor: t.subjectId ? subjectMap.get(t.subjectId)?.color ?? null : null })),
      exams: examList.filter((e) => e.daysRemaining >= 0).slice(0, 3),
      studyTodayMin: Number(studyToday?.total ?? 0),
      studyWeekMin: Number(studyWeek?.total ?? 0),
      study7d,
      lastWorkout: lastWorkout[0] ?? null,
      runsThisWeekKm: Math.round(runsThisWeekKm * 100) / 100,
      workoutsThisWeek: Number(workoutsWeek?.n ?? 0),
      review: reviewToday[0] ?? null,
      arc: arcSnapshot(today),
      nextAction,
      pcm,
      breakWindow,
      revisionDueCount: revisionDue.length,
      weakTopics,
    };
  } catch (err) {
    console.error("Notice: getDashboard fallback:", err);
    return {
      today,
      settings: { name: "Student", accent: "#2563EB", studyTargetMin: 180, classLevel: null, board: null },
      level: levelFromXp(0),
      streak: 0,
      blocks: [],
      completion: 0,
      habits: [],
      priorityTasks: [],
      exams: [],
      studyTodayMin: 0,
      studyWeekMin: 0,
      study7d: [],
      lastWorkout: null,
      runsThisWeekKm: 0,
      workoutsThisWeek: 0,
      review: null,
      arc: arcSnapshot(today),
      nextAction: null,
      pcm: [],
      breakWindow: null,
      revisionDueCount: 0,
      weakTopics: [],
    };
  }
}

/* --------------------------------- Analytics -------------------------------- */

export async function getStats() {
  const today = todayStr();
  const d14 = addDays(today, -13);
  const d30 = addDays(today, -29);

  const studyRows = await db.select({ date: studySessions.date, total: sql<number>`sum(${studySessions.minutes})` }).from(studySessions).where(gte(studySessions.date, d14)).groupBy(studySessions.date);
  const [sessionTotal] = await db.select({ total: sql<number>`coalesce(sum(${studySessions.minutes}),0)` }).from(studySessions);
  const [questionsTotal] = await db.select({ total: sql<number>`coalesce(sum(${studySessions.questions}),0)` }).from(studySessions);
  const taskRows = await db.select().from(tasks);
  const workoutRows = await db.select().from(workouts);
  const volumeRows = await db
    .select({ date: workouts.date, vol: sql<number>`coalesce(sum(${workoutSets.reps} * ${workoutSets.weightKg}),0)` })
    .from(workouts)
    .leftJoin(exercises, eq(exercises.workoutId, workouts.id))
    .leftJoin(workoutSets, eq(workoutSets.exerciseId, exercises.id))
    .groupBy(workouts.date);
  const runRows = await db.select().from(runs);
  const habitRows = await db.select().from(habits);
  const habitLogRows = await db.select().from(habitLogs);
  const xpStreak = await activityStreak();
  const xp = await totalXp();
  const subjectTree = await getStudyTree();
  const examList = await getExams();
  const nutritionRows = await db
    .select({ date: meals.date, calories: sql<number>`coalesce(sum(${mealItems.calories}),0)`, protein: sql<number>`coalesce(sum(${mealItems.protein}),0)` })
    .from(meals)
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(and(gte(meals.date, d14), eq(meals.status, "eaten")))
    .groupBy(meals.date);
  const xpRows = await db.select({ date: xpTransactions.date, total: sql<number>`sum(${xpTransactions.amount})` }).from(xpTransactions).groupBy(xpTransactions.date).orderBy(asc(xpTransactions.date));

  const studyMap = new Map(studyRows.map((r) => [r.date, Number(r.total)]));
  const studyByDay = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(d14, i);
    return { date: d, minutes: Number(studyMap.get(d) ?? 0) };
  });

  const doneByDay = new Map<string, number>();
  for (const t of taskRows) {
    if (t.completedAt) {
      const d = t.completedAt.toISOString().slice(0, 10);
      if (d >= d14) doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1);
    }
  }
  const tasksByDay = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(d14, i);
    return { date: d, count: doneByDay.get(d) ?? 0 };
  });

  const weeks: { start: string; label: string }[] = [];
  let w = startOfWeekMonday(today);
  for (let i = 0; i < 8; i++) {
    weeks.unshift({ start: w, label: w.slice(5).replace("-", "/") });
    w = addDays(w, -7);
  }
  const workoutsByWeek = weeks.map(({ start, label }) => {
    const end = addDays(start, 6);
    const count = workoutRows.filter((x) => x.date >= start && x.date <= end).length;
    const vol = volumeRows.filter((v) => v.date >= start && v.date <= end).reduce((a, v) => a + Number(v.vol), 0);
    return { week: label, count, volume: Math.round(vol) };
  });
  const runByWeek = weeks.map(({ start, label }) => {
    const end = addDays(start, 6);
    const km = runRows.filter((x) => x.type === "run" && x.date >= start && x.date <= end).reduce((a, x) => a + (x.distanceKm ?? 0), 0);
    return { week: label, km: Math.round(km * 100) / 100 };
  });

  const yesterday = addDays(today, -1);
  const habitStats = habitRows.map((h) => {
    const dates = new Set(habitLogRows.filter((l) => l.habitId === h.id).map((l) => l.date));
    let streak = 0;
    let cursor = dates.has(today) ? today : yesterday;
    while (dates.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    const last30 = [...dates].filter((d) => d >= d30).length;
    return { id: h.id, name: h.name, color: h.color, streak, rate30: Math.round((last30 / 30) * 100) };
  });

  let cum = 0;
  const xpHistory = xpRows.map((r) => {
    cum += Number(r.total);
    return { date: r.date, xp: Number(r.total), cumulative: cum };
  });

  const tasksCompleted = taskRows.filter((t) => t.status === "completed").length;
  const runKm = Math.round(runRows.reduce((a, r) => a + (r.type === "run" ? r.distanceKm ?? 0 : 0), 0) * 10) / 10;
  const level = levelFromXp(xp);
  const achievementStats: AchievementStats = {
    totalXp: xp,
    tasksCompleted,
    studyMinutes: Number(sessionTotal?.total ?? 0),
    questions: Number(questionsTotal?.total ?? 0),
    workouts: workoutRows.length,
    runKm,
    maxStreak: xpStreak.max,
    habitChecks: habitLogRows.length,
    level: level.level,
  };
  const unlocked = unlockedAchievements(achievementStats);

  return {
    studyByDay,
    tasksByDay,
    workoutsByWeek,
    runByWeek,
    habitStats,
    nutrition: nutritionRows.map((r) => ({ date: r.date, calories: Number(r.calories), protein: Number(r.protein) })),
    subjectTree,
    exams: examList,
    xpHistory,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlocked.includes(a.id) })),
    totals: {
      studyMinutes: achievementStats.studyMinutes,
      questions: achievementStats.questions,
      tasksCompleted,
      tasksTodo: taskRows.filter((t) => t.status === "todo").length,
      tasksInProgress: taskRows.filter((t) => t.status === "in_progress").length,
      workouts: workoutRows.length,
      runKm,
      habitChecks: habitLogRows.length,
      streakCurrent: xpStreak.current,
      streakMax: xpStreak.max,
      level,
    },
  };
}

/* --------------------------------- Winter Arc ------------------------------- */

export interface ArcDayData {
  date: string;
  day: number;
  score: number;
  done: boolean;
  studyMin: number;
  tasksDone: number;
  fitness: boolean;
  habitsRatio: number;
  xp: number;
  note: string;
  phase: string;
  phaseColor: string;
}

export async function getWinterData() {
  const today = todayStr();
  const snap = arcSnapshot(today);
  const effectiveEnd = snap.status === "pre" ? addDays(ARC_START, -1) : today > ARC_END ? ARC_END : today;

  const sessionRows = await db.select({ date: studySessions.date, total: sql<number>`sum(${studySessions.minutes})` }).from(studySessions).groupBy(studySessions.date);
  const taskRows = await db.select().from(tasks);
  const workoutRows = await db.select({ date: workouts.date }).from(workouts);
  const runRows = await db.select({ date: runs.date }).from(runs).where(eq(runs.type, "run"));
  const habitRows = await db.select().from(habits);
  const logRows = await db.select().from(habitLogs);
  const xpRows = await db.select({ date: xpTransactions.date, total: sql<number>`sum(${xpTransactions.amount})` }).from(xpTransactions).groupBy(xpTransactions.date);
  const noteRows = await db.select().from(winterArc);

  const studyMap = new Map(sessionRows.map((r) => [r.date, Number(r.total)]));
  const workoutDates = new Set(workoutRows.map((r) => r.date));
  const runDates = new Set(runRows.map((r) => r.date));
  const habitTotal = habitRows.length;
  const habitMap = new Map<string, number>();
  for (const l of logRows) habitMap.set(l.date, (habitMap.get(l.date) ?? 0) + 1);
  const taskMap = new Map<string, number>();
  for (const t of taskRows) {
    if (t.completedAt) {
      const d = t.completedAt.toISOString().slice(0, 10);
      taskMap.set(d, (taskMap.get(d) ?? 0) + 1);
    }
  }
  const xpMap = new Map(xpRows.map((r) => [r.date, Number(r.total)]));
  const noteMap = new Map(noteRows.map((r) => [r.date, r.note ?? ""]));

  const days: ArcDayData[] = [];
  if (effectiveEnd >= ARC_START) {
    const n = daysBetween(ARC_START, effectiveEnd);
    for (let i = 0; i <= n; i++) {
      const date = addDays(ARC_START, i);
      const studyMin = Number(studyMap.get(date) ?? 0);
      const tasksDone = taskMap.get(date) ?? 0;
      const fitness = workoutDates.has(date) || runDates.has(date);
      const habitsDone = habitMap.get(date) ?? 0;
      const habitsRatio = habitTotal ? habitsDone / habitTotal : 0;
      const score = Math.round(
        Math.min(40, (studyMin / 90) * 40) +
        Math.min(20, tasksDone * 10) +
        (fitness ? 20 : 0) +
        Math.min(20, habitsRatio * 20)
      );
      const phase = phaseForDate(date);
      days.push({
        date,
        day: i + 1,
        score,
        done: score >= 50,
        studyMin,
        tasksDone,
        fitness,
        habitsRatio: Math.round(habitsRatio * 100),
        xp: xpMap.get(date) ?? 0,
        note: noteMap.get(date) ?? "",
        phase: phase.name,
        phaseColor: phase.color,
      });
    }
  }

  let arcStreak = 0;
  if (days.length) {
    let idx = days[days.length - 1].done ? days.length - 1 : days.length - 2;
    while (idx >= 0 && days[idx]) {
      if (!days[idx].done) break;
      arcStreak++;
      idx--;
    }
  }
  const doneDays = days.filter((d) => d.done).length;
  const arcXp = days.reduce((a, d) => a + d.xp, 0);
  const avgScore = days.length ? Math.round(days.reduce((a, d) => a + d.score, 0) / days.length) : 0;

  return { snap, days, arcStreak, doneDays, arcXp, avgScore, today };
}

export async function setArcNote(date: string, note: string): Promise<ActionResult> {
  if (!dateRe.test(date) || note.length > 2000) return { ok: false, error: "Invalid note" };
  const [existing] = await db.select().from(winterArc).where(eq(winterArc.date, date));
  if (existing) {
    await db.update(winterArc).set({ note }).where(eq(winterArc.id, existing.id));
  } else {
    await db.insert(winterArc).values({ date, note });
  }
  refresh();
  return { ok: true };
}

/* ----------------------------------- Data ----------------------------------- */

async function clearAllTables() {
  await db.delete(workoutSets);
  await db.delete(exercises);
  await db.delete(workouts);
  await db.delete(runs);
  await db.delete(mealItems);
  await db.delete(meals);
  await db.delete(dailyReviews);
  await db.delete(habitLogs);
  await db.delete(habits);
  await db.delete(dailyPlans);
  await db.delete(examChapters);
  await db.delete(exams);
  await db.delete(studySessions);
  await db.delete(tasks);
  await db.delete(topics);
  await db.delete(chapters);
  await db.delete(subjects);
  await db.delete(winterArc);
  await db.delete(xpTransactions);
  await db.delete(settings);
}

/** Wipe everything — the fresh-app state. */
export async function clearAllData(): Promise<ActionResult> {
  await clearAllTables();
  refresh();
  return { ok: true };
}

/** Development helper: wipe and load sample content. Never runs automatically. */
export async function loadSampleData(): Promise<ActionResult> {
  await clearAllTables();
  await seedStarter();
  refresh();
  return { ok: true };
}
