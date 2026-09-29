"use server";

import { db } from "@/db";
import { chapters, noteSections, subjects, topicLessons, topics } from "@/db/schema";
import type { ActionResult } from "@/lib/types";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { callLlm } from "./llm";

export interface LessonDTO {
  lesson: string;
  sourceRefs: { document: string; pages: string; heading: string }[];
  hasNotes: boolean;
  generatedAt: string;
}

export async function getLesson(topicId: number): Promise<LessonDTO | null> {
  const [row] = await db.select().from(topicLessons).where(eq(topicLessons.topicId, topicId));
  if (!row) return null;
  let refs: LessonDTO["sourceRefs"] = [];
  try {
    refs = JSON.parse(row.sourceRefs);
  } catch { /* keep empty */ }
  return { lesson: row.lesson, sourceRefs: refs, hasNotes: row.hasNotes, generatedAt: row.generatedAt.toISOString() };
}

/**
 * CHUNKED RETRIEVAL (§26): exact topic → exact chapter (topic-less chunks) only.
 * Never the whole subject PDF. Prerequisite material is fetched separately and labelled.
 */
async function retrieveChunks(topicId: number, chapterId: number) {
  const exact = await db
    .select({ heading: noteSections.heading, content: noteSections.content, pageStart: noteSections.pageStart, pageEnd: noteSections.pageEnd, docId: noteSections.documentId })
    .from(noteSections)
    .where(eq(noteSections.topicId, topicId))
    .limit(6);
  if (exact.length >= 2) return { chunks: exact, scope: "topic" as const };

  const chapterLevel = await db
    .select({ heading: noteSections.heading, content: noteSections.content, pageStart: noteSections.pageStart, pageEnd: noteSections.pageEnd, docId: noteSections.documentId })
    .from(noteSections)
    .where(and(eq(noteSections.chapterId, chapterId), isNull(noteSections.topicId)))
    .limit(4);
  return { chunks: [...exact, ...chapterLevel], scope: exact.length ? ("topic" as const) : ("chapter" as const) };
}

const LESSON_SYSTEM = `You convert a Class 11 CBSE/NCERT student's own notes into a STRUCTURED LESSON for ONE topic.

Output GitHub-flavoured markdown with exactly these sections (omit a section only when it genuinely does not apply to the topic):

# <Topic name>
## 1. Concept
## 2. Mathematical meaning
## 3. Physical interpretation   (for Maths use "Interpretation"; for Chemistry use "What it means chemically")
## 4. Important cases
## 5. Diagram
## 6. Example
## 7. Quick check

RULES
- The student's note chunks are the PRIMARY source. Preserve their definitions, symbols and examples.
- You MAY add clarification, correct errors and fill syllabus gaps — but mark every such passage inline as **[Study OS addition]** at the start of that paragraph or bullet. Anything not marked must genuinely come from their notes.
- If their notes are missing/thin, write the lesson from NCERT-level knowledge and mark the whole body with a single line at the top: **[Study OS supplemental — not from your notes]**.
- NEVER invent page numbers, note text, or claim AI content came from the notes.
- Section 5 (Diagram): describe the diagram in words or an ASCII sketch — do not fabricate an image link. Omit if a diagram adds nothing.
- Section 7 (Quick check): exactly 2–3 short questions, no answers.
- Class 11 CBSE level. No JEE-level extensions. Concise — this is a lesson, not a textbook chapter.`;

export async function generateLesson(topicId: number): Promise<ActionResult<{ hasNotes: boolean }>> {
  if (!Number.isInteger(topicId)) return { ok: false, error: "Invalid topic" };
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId));
  if (!topic) return { ok: false, error: "Topic not found" };
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, topic.chapterId));
  const [subject] = chapter ? await db.select().from(subjects).where(eq(subjects.id, chapter.subjectId)) : [undefined];

  const { chunks } = await retrieveChunks(topicId, topic.chapterId);
  const hasNotes = chunks.length > 0;

  const docIds = [...new Set(chunks.map((c) => c.docId))];
  const docs = docIds.length
    ? await db.select().from((await import("@/db/schema")).noteDocuments).where(sql`id in (${sql.join(docIds.map((i) => sql`${i}`), sql`, `)})`)
    : [];
  const docName = (id: number) => docs.find((d) => d.id === id)?.fileName ?? docs.find((d) => d.id === id)?.title ?? "Notes";

  const sourceRefs = chunks.map((c) => ({
    document: docName(c.docId),
    pages: c.pageStart ? `${c.pageStart}${c.pageEnd && c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ""}` : "—",
    heading: c.heading,
  }));

  const notesBlock = hasNotes
    ? chunks.map((c) => `### ${c.heading} (pages ${c.pageStart ?? "?"}${c.pageEnd && c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ""})\n${c.content.slice(0, 4000)}`).join("\n\n").slice(0, 16000)
    : "(The student has no notes mapped to this topic.)";

  const res = await callLlm(
    [
      { role: "system", content: LESSON_SYSTEM },
      {
        role: "user",
        content: `Subject: ${subject?.name ?? "unknown"}\nChapter: ${chapter?.name ?? "unknown"}\nTopic: ${topic.name}\nDifficulty: ${topic.difficulty}\n\nSTUDENT NOTE CHUNKS:\n${notesBlock}`,
      },
    ],
    { temperature: 0.3 }
  );
  if ("error" in res) {
    return { ok: false, error: res.error === "not_configured" || res.error === "model_missing" ? res.error : `Lesson unavailable: ${res.error}` };
  }

  await db
    .insert(topicLessons)
    .values({ topicId, lesson: res.content.trim(), sourceRefs: JSON.stringify(sourceRefs), hasNotes, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: topicLessons.topicId,
      set: { lesson: res.content.trim(), sourceRefs: JSON.stringify(sourceRefs), hasNotes, generatedAt: new Date() },
    });

  revalidatePath("/", "layout");
  return { ok: true, data: { hasNotes } };
}

void or;
