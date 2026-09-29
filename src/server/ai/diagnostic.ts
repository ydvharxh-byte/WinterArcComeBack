"use server";

import { db } from "@/db";
import { errorLogs, questionAttempts, revisionItems, settings } from "@/db/schema";
import { addDays, todayStr } from "@/lib/dates";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildStudentContext } from "./context";
import { callLlm } from "./llm";
import { validateDiagnostic, withStructuredRetry, type DiagnosticResult } from "./schemas";
import { awardXp } from "../xp";

const DIAGNOSTIC_SYSTEM = `You are the diagnostic component of Study OS, a CBSE/NCERT examiner.
Evaluate the student's answer on: concept understanding, formula selection, method, reasoning, substitution, calculation, units, final answer.
Judge scientific correctness, not wording similarity to a model answer. Never inflate marks; never deduct for harmless phrasing.

Reply with ONLY a JSON object (no prose, no fences):
{
  "correct": boolean,
  "score": number,            // 0..maxScore
  "maxScore": number,         // typically 3 or 5 per question weight
  "conceptUnderstanding": "weak" | "partial" | "strong",
  "methodCorrect": boolean,
  "calculationCorrect": boolean | null,
  "unitCorrect": boolean | null,
  "primaryMisconception": string | null,   // short phrase, e.g. "sign convention"
  "feedback": string,          // 2–4 sentences: what earned marks, where they were lost, why, how to avoid it
  "marksBreakdown": string,    // e.g. "concept 1/1, method 2/2, units 0/1"
  "recommendedAction": "practice" | "revise" | "learn" | "move_on",
  "confidence": number,        // 0..1
  "errorTag": string | null    // kebab-case tag for the misconception, if any
}`;

export interface EvaluateInput {
  question: string;
  answer: string;
  topicId?: number | null;
  subjectId?: number | null;
  sessionId?: number | null;
}

export type EvalOut =
  | { ok: true; data: DiagnosticResult & { attemptId: number } }
  | { ok: false; error: string };

/**
 * ANSWER EVALUATION PIPELINE (§12):
 * submit → AI diagnostic → zod validation (one retry) → question_attempts
 * → error_logs → mastery (dynamic via attempts) → revision_items → next action.
 */
export async function evaluateAnswer(input: EvaluateInput): Promise<EvalOut> {
  const parsed = z.object({
    question: z.string().trim().min(1).max(6000),
    answer: z.string().trim().min(1).max(6000),
    topicId: z.number().int().nullable().optional(),
    subjectId: z.number().int().nullable().optional(),
    sessionId: z.number().int().nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Question and answer are required" };
  const { question, answer, topicId, subjectId, sessionId } = parsed.data;

  // Targeted context only — never the whole database
  let contextNote = "";
  if (topicId) {
    const ctx = await buildStudentContext();
    const t = ctx.topics.find((x) => x.id === topicId);
    const errs = ctx.errorLog.filter((e) => e.topic === t?.name);
    if (t) {
      contextNote = `Student state for this topic: subject "${t.subject}", chapter "${t.chapter}", mastery ${t.mastery}/100, difficulty ${t.difficulty}.`;
      if (errs.length) contextNote += ` Active misconception(s): ${errs.map((e) => `${e.tag} (×${e.count})`).join(", ")} — check whether the same mistake reappears.`;
    }
  }
  const profile = await db.select().from(settings);

  const result = await withStructuredRetry<DiagnosticResult>(
    (fixNote) => [
      {
        role: "system",
        content:
          DIAGNOSTIC_SYSTEM +
          (contextNote ? `\n\n${contextNote}` : "") +
          `\nStudent board/class: ${profile.find((p) => p.key === "board")?.value ?? "unknown"}, class ${profile.find((p) => p.key === "classLevel")?.value ?? "unknown"} (if unknown, evaluate at a senior-school CBSE level).` +
          (fixNote ? `\n\n${fixNote}` : ""),
      },
      { role: "user", content: `QUESTION:\n${question}\n\nSTUDENT'S ANSWER:\n${answer}` },
    ],
    validateDiagnostic,
    (msgs) => callLlm(msgs, { temperature: 0.2 })
  );
  if ("error" in result) return { ok: false, error: result.error === "model_missing" ? "model_missing" : result.error };

  const d = result.data;

  // persist evidence
  const [attempt] = await db.insert(questionAttempts).values({
    topicId: topicId ?? null,
    subjectId: subjectId ?? null,
    question: question.slice(0, 4000),
    answer: answer.slice(0, 4000),
    correct: d.correct,
    score: Math.min(d.score, d.maxScore),
    maxScore: d.maxScore,
    feedback: `${d.feedback}${d.marksBreakdown ? ` [${d.marksBreakdown}]` : ""}`,
    errorTag: d.errorTag ?? d.primaryMisconception?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) ?? null,
    tutorSessionId: sessionId ?? null,
  }).returning({ id: questionAttempts.id });

  if (d.correct && d.score / d.maxScore >= 0.8) {
    await awardXp(8, "Correct evaluated answer", { key: `diag:${attempt.id}` });
  }

  // misconception persistence — (topicId, tag) unique, compounding counts
  const tag = d.errorTag ?? d.primaryMisconception?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) ?? null;
  if (tag && !d.correct) {
    const today = todayStr();
    const [existing] = await db.select().from(errorLogs).where(
      (topicId ?? null)
        ? and(eq(errorLogs.topicId, topicId!), eq(errorLogs.tag, tag))
        : and(isNull(errorLogs.topicId), eq(errorLogs.tag, tag))
    );
    if (existing) {
      await db.update(errorLogs).set({
        count: existing.count + 1,
        lastSeen: today,
        detail: d.primaryMisconception ?? existing.detail,
        status: "unresolved",
      }).where(eq(errorLogs.id, existing.id));
    } else {
      await db.insert(errorLogs).values({
        topicId: topicId ?? null,
        subjectId: subjectId ?? null,
        tag,
        detail: d.primaryMisconception ?? tag.replace(/-/g, " "),
        lastSeen: today,
      });
    }
  } else if (tag && d.correct && d.score / d.maxScore >= 0.8 && topicId) {
    // strong correct answer on a previously weak tag → improving (not instantly resolved)
    const [existing] = await db.select().from(errorLogs).where(and(eq(errorLogs.topicId, topicId), eq(errorLogs.tag, tag)));
    if (existing && existing.status === "unresolved") {
      await db.update(errorLogs).set({ status: "improving", lastSeen: todayStr() }).where(eq(errorLogs.id, existing.id));
    }
  }

  // revision intervals react deterministically
  if (topicId) {
    const pct = (d.score / d.maxScore) * 100;
    const today = todayStr();
    const [cur] = await db.select().from(revisionItems).where(eq(revisionItems.topicId, topicId));
    let interval: number, level: number;
    if (!cur) {
      level = pct >= 50 ? 1 : 0;
      interval = pct >= 85 ? 4 : pct >= 50 ? 2 : 1;
    } else if (pct >= 85) {
      level = cur.level + 1;
      interval = Math.min(21, Math.round(cur.intervalDays * 2.2));
    } else if (pct >= 50) {
      level = cur.level + 1;
      interval = Math.max(1, Math.round(cur.intervalDays * 1.5));
    } else {
      level = 0;
      interval = 1;
    }
    await db.insert(revisionItems).values({
      topicId, intervalDays: interval, dueDate: addDays(today, interval), level, lastScore: Math.round(pct), lastRevisedAt: new Date(),
    }).onConflictDoUpdate({
      target: revisionItems.topicId,
      set: { intervalDays: interval, dueDate: addDays(today, interval), level, lastScore: Math.round(pct), lastRevisedAt: new Date() },
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { ...d, attemptId: attempt.id } };
}
