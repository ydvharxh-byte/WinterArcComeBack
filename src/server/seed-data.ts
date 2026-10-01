import { db } from "@/db";
import {
  chapters,
  dailyPlans,
  examChapters,
  exams,
  habits,
  meals,
  subjects,
  tasks,
  topics,
  settings,
} from "@/db/schema";
import { addDays, todayStr } from "@/lib/dates";

/**
 * Sample workspace for development/demo purposes.
 * ONLY invoked explicitly from Settings → "Load sample data".
 * Never runs on startup — a fresh install opens completely empty.
 */
export async function seedStarter() {
  const today = todayStr();

  /* Settings */
  await db.insert(settings).values([
    { key: "name", value: "Student" },
    { key: "accent", value: "#2196F3" },
    { key: "studyTargetMin", value: "180" },
  ]).onConflictDoNothing();

  /* Subjects → chapters → topics */
  const [math] = await db.insert(subjects).values({ name: "Mathematics", color: "#2196F3", description: "Core maths for semester exams" }).returning();
  const [physics] = await db.insert(subjects).values({ name: "Physics", color: "#90CAF9", description: "Mechanics and thermodynamics" }).returning();
  const [cs] = await db.insert(subjects).values({ name: "Computer Science", color: "#0D47A1", description: "DSA and problem solving" }).returning();

  const [calc] = await db.insert(chapters).values([
    { subjectId: math.id, name: "Calculus", sortOrder: 1 },
    { subjectId: math.id, name: "Linear Algebra", sortOrder: 2 },
  ]).returning();
  const [mech] = await db.insert(chapters).values([
    { subjectId: physics.id, name: "Mechanics", sortOrder: 1 },
    { subjectId: physics.id, name: "Thermodynamics", sortOrder: 2 },
  ]).returning();
  const [ds] = await db.insert(chapters).values([
    { subjectId: cs.id, name: "Data Structures", sortOrder: 1 },
    { subjectId: cs.id, name: "Algorithms", sortOrder: 2 },
  ]).returning();

  const allChapters = await db.select().from(chapters);
  const la = allChapters.find((c) => c.name === "Linear Algebra")!;
  const thermo = allChapters.find((c) => c.name === "Thermodynamics")!;
  const algo = allChapters.find((c) => c.name === "Algorithms")!;

  await db.insert(topics).values([
    { chapterId: calc.id, name: "Limits & Continuity", status: "done", difficulty: "easy", sortOrder: 1 },
    { chapterId: calc.id, name: "Derivatives", status: "in_progress", difficulty: "medium", sortOrder: 2 },
    { chapterId: calc.id, name: "Applications of Derivatives", status: "todo", difficulty: "medium", sortOrder: 3 },
    { chapterId: calc.id, name: "Integrals", status: "todo", difficulty: "hard", sortOrder: 4 },
    { chapterId: la.id, name: "Matrices & Operations", status: "done", difficulty: "easy", sortOrder: 1 },
    { chapterId: la.id, name: "Determinants", status: "todo", difficulty: "medium", sortOrder: 2 },
    { chapterId: mech.id, name: "Kinematics", status: "done", difficulty: "medium", sortOrder: 1 },
    { chapterId: mech.id, name: "Newton's Laws", status: "in_progress", difficulty: "medium", sortOrder: 2 },
    { chapterId: mech.id, name: "Work, Energy & Power", status: "todo", difficulty: "hard", sortOrder: 3 },
    { chapterId: thermo.id, name: "Laws of Thermodynamics", status: "todo", difficulty: "medium", sortOrder: 1 },
    { chapterId: ds.id, name: "Arrays & Strings", status: "done", difficulty: "easy", sortOrder: 1 },
    { chapterId: ds.id, name: "Trees", status: "in_progress", difficulty: "hard", sortOrder: 2 },
    { chapterId: ds.id, name: "Graphs", status: "todo", difficulty: "hard", sortOrder: 3 },
    { chapterId: algo.id, name: "Sorting & Searching", status: "done", difficulty: "easy", sortOrder: 1 },
    { chapterId: algo.id, name: "Dynamic Programming", status: "todo", difficulty: "hard", sortOrder: 2 },
  ]);

  /* Habits */
  await db.insert(habits).values([
    { name: "Wake up at 6:00", color: "#FBBF24" },
    { name: "Read 20 minutes", color: "#34D399" },
    { name: "No sugar", color: "#F87171" },
  ]);

  /* Exams */
  const [mathExam] = await db.insert(exams).values({
    name: "Mathematics Midterm",
    subjectId: math.id,
    date: addDays(today, 21),
    notes: "Covers calculus and linear algebra units 1–3.",
  }).returning();
  const [physExam] = await db.insert(exams).values({
    name: "Physics Final",
    subjectId: physics.id,
    date: addDays(today, 45),
    notes: "Full mechanics + thermodynamics syllabus.",
  }).returning();
  await db.insert(examChapters).values([
    { examId: mathExam.id, chapterId: calc.id },
    { examId: mathExam.id, chapterId: la.id },
    { examId: physExam.id, chapterId: mech.id },
    { examId: physExam.id, chapterId: thermo.id },
  ]);

  /* Tasks */
  await db.insert(tasks).values([
    { title: "Finish derivative practice set", priority: "high", status: "in_progress", dueDate: today, estimatedMinutes: 60, subjectId: math.id, chapterId: calc.id, scheduledDate: today, startMin: 7 * 60 },
    { title: "Solve 20 tree problems", priority: "high", status: "todo", dueDate: addDays(today, 1), estimatedMinutes: 90, subjectId: cs.id, chapterId: ds.id },
    { title: "Revise Newton's laws notes", priority: "medium", status: "todo", dueDate: addDays(today, 2), estimatedMinutes: 45, subjectId: physics.id, chapterId: mech.id },
    { title: "Watch DP lecture and take notes", priority: "medium", status: "todo", dueDate: addDays(today, 4), estimatedMinutes: 75, subjectId: cs.id, chapterId: algo.id },
    { title: "Print formula sheet for midterm", priority: "low", status: "todo", dueDate: addDays(today, 7), estimatedMinutes: 15, subjectId: math.id },
  ]);

  /* Today's plan (custom blocks) */
  await db.insert(dailyPlans).values([
    { date: today, startMin: 6 * 60, endMin: 6 * 60 + 45, type: "habit", title: "Morning routine", color: "#FBBF24" },
    { date: today, startMin: 7 * 60, endMin: 9 * 60, type: "study", title: "Deep work — Calculus", color: "#2196F3" },
    { date: today, startMin: 12 * 60 + 30, endMin: 13 * 60 + 15, type: "meal", title: "Lunch", color: "#34D399" },
    { date: today, startMin: 16 * 60, endMin: 17 * 60 + 30, type: "study", title: "Trees — problem set", color: "#90CAF9" },
    { date: today, startMin: 18 * 60, endMin: 19 * 60, type: "gym", title: "Push day", color: "#FBBF24" },
    { date: today, startMin: 21 * 60 + 30, endMin: 22 * 60, type: "rest", title: "Wind down — no screens", color: "#64748B" },
  ]);
}
