"use server";

import { db } from "@/db";
import { chapters, subjects, topics } from "@/db/schema";
import type { ActionResult } from "@/lib/types";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Class 11 PCM backlog structure (the student's stated pending chapters).
 * Chapters are ordered by their prerequisite chain, not alphabetically.
 * Topics are NCERT chapter sections — the student can edit/add freely.
 * Nothing here is fake progress: every topic starts at zero evidence.
 */
const PCM: {
  subject: string;
  color: string;
  chapters: { name: string; importance: "high" | "medium" | "low"; topics: [string, number][] }[];
}[] = [
  {
    subject: "Physics",
    color: "#2563EB",
    chapters: [
      { name: "Units and Measurements", importance: "medium", topics: [["Units and dimensions", 45], ["Significant figures & errors", 60], ["Dimensional analysis", 60]] },
      { name: "Motion in a Straight Line", importance: "high", topics: [["Position, path length, displacement", 45], ["Velocity and acceleration", 60], ["Kinematic equations", 75], ["Relative velocity (1D)", 45]] },
      { name: "Motion in a Plane", importance: "high", topics: [["Vectors and operations", 60], ["Projectile motion", 90], ["Uniform circular motion", 60], ["Relative velocity (2D)", 45]] },
      { name: "Laws of Motion", importance: "high", topics: [["Newton's laws", 75], ["Free body diagrams", 60], ["Friction", 60], ["Circular motion dynamics", 60]] },
      { name: "Work, Energy and Power", importance: "high", topics: [["Work done by a force", 45], ["Work-energy theorem", 60], ["Potential energy & conservation", 75], ["Power", 30], ["Collisions", 75]] },
      { name: "System of Particles and Centre of Mass", importance: "medium", topics: [["Centre of mass", 60], ["Motion of centre of mass", 45], ["Linear momentum of a system", 60]] },
      { name: "Rotational Motion", importance: "high", topics: [["Angular variables", 45], ["Torque and angular momentum", 75], ["Moment of inertia", 90], ["Radius of gyration", 30], ["Rolling motion", 75]] },
      { name: "Gravitation", importance: "medium", topics: [["Universal law of gravitation", 45], ["Gravitational potential energy", 60], ["Escape velocity", 45], ["Satellites and orbits", 60]] },
    ],
  },
  {
    subject: "Chemistry",
    color: "#06B6D4",
    chapters: [
      { name: "Some Basic Concepts of Chemistry", importance: "high", topics: [["Mole concept", 75], ["Stoichiometry", 75], ["Concentration terms", 45], ["Empirical & molecular formula", 45]] },
      { name: "Structure of Atom", importance: "high", topics: [["Atomic models", 60], ["Bohr model", 60], ["Quantum numbers", 75], ["Electronic configuration", 60]] },
      { name: "Classification of Elements and Periodicity in Properties", importance: "medium", topics: [["Modern periodic law", 45], ["Periodic trends", 75], ["Anomalous properties", 45]] },
      { name: "Chemical Bonding and Molecular Structure", importance: "high", topics: [["Ionic & covalent bonding", 60], ["VSEPR theory", 60], ["Hybridisation", 90], ["Molecular orbital theory", 75], ["Hydrogen bonding", 45]] },
      { name: "Thermodynamics", importance: "high", topics: [["System, surroundings, state functions", 45], ["First law & enthalpy", 75], ["Hess's law", 60], ["Entropy and Gibbs energy", 75]] },
      { name: "Redox Reactions", importance: "medium", topics: [["Oxidation number", 45], ["Balancing redox equations", 60], ["Redox titrations", 45]] },
      { name: "Some Basic Principles of Organic Chemistry", importance: "high", topics: [["IUPAC nomenclature", 90], ["Isomerism", 75], ["Electronic effects", 75], ["Reaction intermediates", 60]] },
    ],
  },
  {
    subject: "Mathematics",
    color: "#6366F1",
    chapters: [
      { name: "Sets", importance: "medium", topics: [["Types of sets & operations", 45], ["Venn diagrams", 45], ["Practical problems on sets", 45]] },
      { name: "Relations and Functions", importance: "high", topics: [["Cartesian product & relations", 45], ["Functions and their types", 60], ["Domain and range", 60]] },
      { name: "Trigonometric Functions", importance: "high", topics: [["Angles and radian measure", 45], ["Trigonometric identities", 90], ["Trigonometric equations", 75], ["Sine and cosine rules", 60]] },
      { name: "Complex Numbers and Quadratic Equations", importance: "medium", topics: [["Algebra of complex numbers", 60], ["Modulus and argument", 60], ["Quadratic equations & roots", 60]] },
      { name: "Linear Inequalities", importance: "low", topics: [["Solving linear inequalities", 45], ["Graphical solutions", 45]] },
      { name: "Permutations and Combinations", importance: "high", topics: [["Fundamental principle of counting", 45], ["Permutations", 75], ["Combinations", 75]] },
      { name: "Binomial Theorem", importance: "medium", topics: [["Binomial expansion", 60], ["General and middle terms", 60]] },
      { name: "Sequences and Series", importance: "high", topics: [["Arithmetic progression", 60], ["Geometric progression", 60], ["Special series", 60]] },
      { name: "Conic Sections", importance: "medium", topics: [["Circle", 60], ["Parabola", 75], ["Ellipse and hyperbola", 90]] },
    ],
  },
];

/**
 * Creates the Class 11 PCM backlog skeleton. Idempotent per subject/chapter:
 * existing subjects/chapters/topics are never duplicated or overwritten.
 */
export async function setupPcmBacklog(): Promise<ActionResult<{ subjects: number; chapters: number; topics: number }>> {
  let sCount = 0, cCount = 0, tCount = 0;

  for (const s of PCM) {
    let [subject] = await db.select().from(subjects).where(eq(subjects.name, s.subject));
    if (!subject) {
      [subject] = await db.insert(subjects).values({ name: s.subject, color: s.color, description: "Class 11 · CBSE" }).returning();
      sCount++;
    }

    const existingChapters = await db.select().from(chapters).where(eq(chapters.subjectId, subject.id));
    let order = existingChapters.length;

    for (const ch of s.chapters) {
      let chapter = existingChapters.find((x) => x.name.toLowerCase() === ch.name.toLowerCase());
      if (!chapter) {
        order++;
        [chapter] = await db.insert(chapters).values({ subjectId: subject.id, name: ch.name, sortOrder: order }).returning();
        cCount++;
      }

      const existingTopics = await db.select().from(topics).where(eq(topics.chapterId, chapter.id));
      let tOrder = existingTopics.length;
      let prevId: number | null = existingTopics.length ? existingTopics[existingTopics.length - 1].id : null;

      for (const [name, minutes] of ch.topics) {
        if (existingTopics.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
        tOrder++;
        const [created] = await db.insert(topics).values({
          chapterId: chapter.id,
          name,
          sortOrder: tOrder,
          estimatedMinutes: minutes,
          importance: ch.importance,
          priority: ch.importance,
          difficulty: minutes >= 90 ? "hard" : minutes >= 60 ? "medium" : "easy",
          prerequisiteId: prevId, // linear chain within the chapter
          isCurrent: false,       // backlog by default — mark current from the topic editor
        }).returning({ id: topics.id });
        prevId = created.id;
        tCount++;
      }
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { subjects: sCount, chapters: cCount, topics: tCount } };
}

export interface BacklogSubject {
  id: number;
  name: string;
  color: string;
  chapters: {
    id: number;
    name: string;
    totalTopics: number;
    doneTopics: number;
    progress: number;
    estimatedMinutes: number;
    remainingMinutes: number;
    importance: string;
    isCurrent: boolean;
  }[];
  pendingChapters: number;
  totalRemainingMin: number;
}

/** Backlog overview grouped subject → chapter (current-syllabus chapters flagged). */
export async function getBacklogTree(): Promise<BacklogSubject[]> {
  const subjectRows = await db.select().from(subjects).orderBy(asc(subjects.createdAt));
  const chapterRows = await db.select().from(chapters).orderBy(asc(chapters.sortOrder));
  const topicRows = await db.select().from(topics);

  return subjectRows.map((s) => {
    const chs = chapterRows
      .filter((c) => c.subjectId === s.id)
      .map((c) => {
        const tps = topicRows.filter((t) => t.chapterId === c.id);
        const done = tps.filter((t) => t.status === "done").length;
        const est = tps.reduce((a, t) => a + t.estimatedMinutes, 0);
        const remaining = tps.filter((t) => t.status !== "done").reduce((a, t) => a + t.estimatedMinutes, 0);
        const highs = tps.filter((t) => t.importance === "high").length;
        return {
          id: c.id,
          name: c.name,
          totalTopics: tps.length,
          doneTopics: done,
          progress: tps.length ? Math.round((done / tps.length) * 100) : 0,
          estimatedMinutes: est,
          remainingMinutes: remaining,
          importance: highs > tps.length / 2 ? "high" : highs > 0 ? "medium" : "low",
          isCurrent: tps.some((t) => t.isCurrent),
        };
      });
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      chapters: chs,
      pendingChapters: chs.filter((c) => c.progress < 100).length,
      totalRemainingMin: chs.reduce((a, c) => a + c.remainingMinutes, 0),
    };
  });
}

void sql;

export interface ChapterOverview {
  id: number;
  name: string;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  progress: number;
  totalTopics: number;
  doneTopics: number;
  estimatedMinutes: number;
  remainingMinutes: number;
  topics: {
    id: number;
    name: string;
    status: string;
    priority: string;
    importance: string;
    difficulty: string;
    estimatedMinutes: number;
    isCurrent: boolean;
    mastery: number;
    masteryState: string;
    currentStage: string;
    prerequisiteName: string | null;
  }[];
}

/** Chapter overview with per-topic stage + mastery (§14). */
export async function getChapterOverview(chapterId: number): Promise<ChapterOverview | null> {
  if (!Number.isInteger(chapterId) || chapterId <= 0) return null;
  const { ensureDbReady } = await import("@/db");
  await ensureDbReady();
  let [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
  if (!chapter) {
    const subjectsRows = await db.select().from(subjects).limit(1);
    if (subjectsRows.length === 0) {
      const { seedStarter } = await import("./seed-data");
      await seedStarter();
      [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
    }
  }
  if (!chapter) return null;
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, chapter.subjectId));
  const topicRows = await db.select().from(topics).where(eq(topics.chapterId, chapterId)).orderBy(asc(topics.sortOrder));

  const { collectTopicEvidence } = await import("./study");
  const { buildMastery, computeStages, masteryState } = await import("./mastery");
  const { todayStr } = await import("@/lib/dates");
  const { topicProgress, topicReferences, revisionItems } = await import("@/db/schema");
  const { evidence, lastActivity } = await collectTopicEvidence();
  const today = todayStr();

  const progressRows = await db.select().from(topicProgress);
  const refRows = await db.select().from(topicReferences);
  const revRows = await db.select().from(revisionItems);
  const allNames = new Map(topicRows.map((t) => [t.id, t.name]));

  const list = topicRows.map((t) => {
    const mastery = buildMastery(t.id, evidence, lastActivity, today);
    const prog = progressRows.find((p) => p.topicId === t.id);
    const base = {
      theoryDoneAt: prog?.theoryDoneAt?.toISOString() ?? null,
      derivationsDoneAt: prog?.derivationsDoneAt?.toISOString() ?? null,
      ncertAttempted: prog?.ncertAttempted ?? 0,
      ncertCorrect: prog?.ncertCorrect ?? 0,
      ncertSkipped: prog?.ncertSkipped ?? 0,
      outsideAttempted: prog?.outsideAttempted ?? 0,
      outsideCorrect: prog?.outsideCorrect ?? 0,
      testScore: prog?.testScore ?? null,
      stageOverride: prog?.stageOverride ?? false,
    };
    const refs = {
      formulas: refRows.filter((r) => r.topicId === t.id && r.kind === "formula").length,
      derivations: refRows.filter((r) => r.topicId === t.id && r.kind === "derivation").length,
    };
    const { stages, currentStage } = computeStages(base, refs, mastery.score, false);
    const rev = revRows.find((r) => r.topicId === t.id);
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      priority: t.priority,
      importance: t.importance,
      difficulty: t.difficulty,
      estimatedMinutes: t.estimatedMinutes,
      isCurrent: t.isCurrent,
      mastery: mastery.score,
      masteryState: masteryState(base, mastery.score, rev ? rev.dueDate <= today : false),
      currentStage: stages.find((s) => s.key === currentStage)?.label ?? "Theory",
      prerequisiteName: t.prerequisiteId ? allNames.get(t.prerequisiteId) ?? null : null,
    };
  });

  const done = list.filter((t) => t.status === "done").length;
  return {
    id: chapter.id,
    name: chapter.name,
    subjectId: subject?.id ?? 0,
    subjectName: subject?.name ?? "",
    subjectColor: subject?.color ?? "#2563EB",
    progress: list.length ? Math.round((done / list.length) * 100) : 0,
    totalTopics: list.length,
    doneTopics: done,
    estimatedMinutes: list.reduce((a, t) => a + t.estimatedMinutes, 0),
    remainingMinutes: list.filter((t) => t.status !== "done").reduce((a, t) => a + t.estimatedMinutes, 0),
    topics: list,
  };
}
