"use server";

import { db } from "@/db";
import { chapters, generatedQuestions, subjects, topics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { buildStudentContext } from "./context";
import { callLlm } from "./llm";
import { validateQuestionSet, withStructuredRetry, type QuestionSet } from "./schemas";
import type { ActionResult } from "@/lib/types";

const GEN_SYSTEM = `You are the question-generation component of Study OS for CBSE/NCERT students.
Design a small adaptive practice set for ONE topic using the student's mastery, band and known misconceptions.
Deliberate progression: 1 fundamental → basic application → application → one misconception-trap → CBSE-style. Scale count to the requested number. Keep the difficulty inside CBSE level — no competitive-exam shortcuts or tricks unless asked.
Never produce repetitive reworded variants of the same question.

Reply with ONLY a JSON object (no prose, no fences):
{
  "questions": [
    {
      "question": "full question text (include all data needed)",
      "difficulty": "easy" | "medium" | "hard",
      "concepts": ["concept-tag"],
      "expectedMethod": "1-2 lines: the intended method",
      "answer": "final answer with units",
      "explanation": "brief worked explanation (2-4 lines)"
    }
  ]
}`;

export interface SafeQuestion {
  id: number;
  question: string;
  difficulty: string;
  concepts: string[];
  attempted: boolean;
}

/**
 * Generate → validate (one retry) → persist with server-side answers →
 * return the safe view (no answers).
 */
export async function generateQuestionSet(input: { topicId: number; count?: number; sessionId?: number | null }): Promise<
  ActionResult<{ questions: SafeQuestion[] }>
> {
  const parsed = z.object({
    topicId: z.number().int(),
    count: z.number().int().min(1).max(8).default(5),
    sessionId: z.number().int().nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid topic" };
  const { topicId, count } = parsed.data;

  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId));
  if (!topic) return { ok: false, error: "Topic not found" };
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, topic.chapterId));
  const [subject] = chapter ? await db.select().from(subjects).where(eq(subjects.id, chapter.subjectId)) : [undefined];

  const ctx = await buildStudentContext();
  const stateTopic = ctx.topics.find((t) => t.id === topicId);
  const errorDetails = ctx.errorLog.filter((e) => e.topic === topic.name && e.status !== "resolved");

  const result = await withStructuredRetry<QuestionSet>(
    (fixNote) => [
      {
        role: "system",
        content:
          GEN_SYSTEM +
          `\n\nTopic: "${topic.name}" (subject: ${subject?.name ?? "unknown"} · chapter: ${chapter?.name ?? "unknown"} · board: ${ctx.profile.board ?? "unknown"} · class: ${ctx.profile.classLevel ?? "unknown"}).\nStudent mastery here: ${stateTopic?.mastery ?? 0}/100 (${stateTopic?.difficulty ?? "medium"} difficulty topic).` +
          (errorDetails.length
            ? `\nStudent's known misconceptions on this topic: ${errorDetails.map((e) => `${e.tag} (${e.detail}, ×${e.count})`).join("; ")}. Include exactly one question that would catch that mistake.`
            : "") +
          `\nGenerate exactly ${count} questions.` +
          (fixNote ? `\n\n${fixNote}` : ""),
      },
      { role: "user", content: `Generate the adaptive set for "${topic.name}".` },
    ],
    validateQuestionSet,
    (msgs) => callLlm(msgs, { temperature: 0.6 })
  );
  if ("error" in result) return { ok: false, error: result.error };

  const safe: SafeQuestion[] = [];
  for (const q of result.data.questions.slice(0, count)) {
    const [row] = await db.insert(generatedQuestions).values({
      topicId,
      subjectId: subject?.id ?? null,
      question: q.question,
      difficulty: q.difficulty,
      concepts: JSON.stringify(q.concepts),
      expectedMethod: q.expectedMethod || null,
      answer: q.answer || null,
      explanation: q.explanation || null,
      tutorSessionId: parsed.data.sessionId ?? null,
    }).returning({ id: generatedQuestions.id });
    safe.push({ id: row.id, question: q.question, difficulty: q.difficulty, concepts: q.concepts, attempted: false });
  }
  return { ok: true, data: { questions: safe } };
}

/** Reveal method/answer/explanation — only after an attempt is recorded for the question. */
export async function revealQuestion(id: number): Promise<ActionResult<{ expectedMethod: string | null; answer: string | null; explanation: string | null }>> {
  if (!Number.isInteger(id)) return { ok: false, error: "Invalid question" };
  const [q] = await db.select().from(generatedQuestions).where(eq(generatedQuestions.id, id));
  if (!q) return { ok: false, error: "Question not found" };
  if (!q.attempted) return { ok: false, error: "Attempt the question first — answers stay hidden until then" };
  return { ok: true, data: { expectedMethod: q.expectedMethod, answer: q.answer, explanation: q.explanation } };
}

export async function markQuestionAttempted(id: number): Promise<ActionResult> {
  if (!Number.isInteger(id)) return { ok: false, error: "Invalid question" };
  await db.update(generatedQuestions).set({ attempted: true }).where(eq(generatedQuestions.id, id));
  return { ok: true };
}
