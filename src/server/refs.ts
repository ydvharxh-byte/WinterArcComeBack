"use server";

import { db } from "@/db";
import { chapters, noteSections, revisionItems, subjects, topicReferences, topics } from "@/db/schema";
import { todayStr } from "@/lib/dates";
import type { ActionResult, TopicReferenceDTO } from "@/lib/types";
import { asc, eq, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callLlm } from "./ai/llm";

function refresh() {
  revalidatePath("/", "layout");
}

export interface RefFilters {
  kind?: "formula" | "derivation" | "all";
  subjectId?: number | null;
  chapterId?: number | null;
  revisionDueOnly?: boolean;
}

export async function getReferences(filters: RefFilters = {}): Promise<TopicReferenceDTO[]> {
  const rows = await db
    .select({
      r: topicReferences,
      topicName: topics.name,
      chapterId: chapters.id,
      chapterName: chapters.name,
      subjectId: subjects.id,
      subjectName: subjects.name,
    })
    .from(topicReferences)
    .innerJoin(topics, eq(topicReferences.topicId, topics.id))
    .innerJoin(chapters, eq(topics.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .orderBy(asc(subjects.name), asc(chapters.sortOrder), asc(topicReferences.id));

  let dueTopicIds = new Set<number>();
  if (filters.revisionDueOnly) {
    const due = await db.select({ topicId: revisionItems.topicId }).from(revisionItems).where(lte(revisionItems.dueDate, todayStr()));
    dueTopicIds = new Set(due.map((d) => d.topicId));
  }

  return rows
    .filter((r) => {
      if (filters.kind && filters.kind !== "all" && r.r.kind !== filters.kind) return false;
      if (filters.subjectId && r.subjectId !== filters.subjectId) return false;
      if (filters.chapterId && r.chapterId !== filters.chapterId) return false;
      if (filters.revisionDueOnly && !dueTopicIds.has(r.r.topicId)) return false;
      return true;
    })
    .map((r) => ({
      id: r.r.id,
      topicId: r.r.topicId,
      topicName: r.topicName,
      chapterId: r.chapterId,
      chapterName: r.chapterName,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      kind: r.r.kind as "formula" | "derivation",
      title: r.r.title,
      formula: r.r.formula,
      symbols: r.r.symbols ? safeParse(r.r.symbols) : null,
      conditions: r.r.conditions,
      commonMistake: r.r.commonMistake,
      source: r.r.source,
    }));
}

function safeParse(s: string): TopicReferenceDTO["symbols"] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function addReference(input: Omit<TopicReferenceDTO, "id" | "topicName" | "chapterId" | "chapterName" | "subjectId" | "subjectName">): Promise<ActionResult> {
  const parsed = z.object({
    topicId: z.number().int(),
    kind: z.enum(["formula", "derivation"]),
    title: z.string().trim().min(1).max(160),
    formula: z.string().trim().min(1).max(6000),
    symbols: z.array(z.object({ symbol: z.string().max(40), meaning: z.string().max(160), unit: z.string().max(40) })).max(12).nullable().optional(),
    conditions: z.string().max(1000).nullable().optional(),
    commonMistake: z.string().max(1000).nullable().optional(),
    source: z.enum(["notes", "ai", "manual"]).default("manual"),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid reference" };
  const d = parsed.data;
  await db.insert(topicReferences).values({
    topicId: d.topicId,
    kind: d.kind,
    title: d.title,
    formula: d.formula,
    symbols: d.symbols && d.symbols.length ? JSON.stringify(d.symbols) : null,
    conditions: d.conditions ?? null,
    commonMistake: d.commonMistake ?? null,
    source: d.source,
  });
  refresh();
  return { ok: true };
}

export async function deleteReference(id: number): Promise<ActionResult> {
  await db.delete(topicReferences).where(eq(topicReferences.id, id));
  refresh();
  return { ok: true };
}

const EXTRACT_SYSTEM = `You extract ALL relevant formulas and/or derivations for ONE school topic (CBSE level) from the provided note sections and your knowledge of the NCERT syllabus.
Rules: use the student's notes FIRST (preserve their formula wording); only add syllabus-standard formulas that are missing. Mark each item's "source" as "notes" or "ai". Never invent exotic formulas outside the syllabus level.

Reply ONLY JSON: {"items":[{"kind":"formula"|"derivation","title":"name","formula":"statement or steps+result","symbols":[{"symbol":"x","meaning":"…","unit":"…"}],"conditions":"when it holds","commonMistake":"typical error","source":"notes"|"ai"}]}`;

/** AI-assisted extraction grounded on the student's mapped notes for a topic. */
export async function extractReferencesForTopic(topicId: number): Promise<ActionResult<{ added: number }>> {
  if (!Number.isInteger(topicId)) return { ok: false, error: "Invalid topic" };
  const [topic] = await db.select().from(topics).where(eq(topics.id, topicId));
  if (!topic) return { ok: false, error: "Topic not found" };

  const noteRows = await db
    .select({ heading: noteSections.heading, content: noteSections.content })
    .from(noteSections)
    .where(eq(noteSections.topicId, topicId))
    .limit(6);
  const grounded = noteRows.length > 0;

  const res = await callLlm([
    { role: "system", content: EXTRACT_SYSTEM + (grounded ? "\n\nStudent note sections for this topic follow in the user message." : "\n\nNo student notes exist for this topic — use NCERT-level standard content only, source \"ai\".") },
    { role: "user", content: `Topic: ${topic.name}.\n\n${noteRows.map((r) => `### ${r.heading}\n${r.content.slice(0, 3000)}`).join("\n\n").slice(0, 12000) || "(no notes)"}` },
  ], { temperature: 0.2 });
  if ("error" in res) return { ok: false, error: res.error === "not_configured" || res.error === "model_missing" ? res.error : `Extraction unavailable: ${res.error}` };

  let items: { kind?: string; title?: string; formula?: string; symbols?: { symbol: string; meaning: string; unit: string }[]; conditions?: string; commonMistake?: string; source?: string }[];
  try {
    const parsed = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { items?: typeof items };
    if (!Array.isArray(parsed.items)) return { ok: false, error: "AI returned no extractable items" };
    items = parsed.items;
  } catch {
    return { ok: false, error: "AI returned invalid JSON" };
  }

  let added = 0;
  for (const item of items.slice(0, 12)) {
    if (!item.title || !item.formula || (item.kind !== "formula" && item.kind !== "derivation")) continue;
    await db.insert(topicReferences).values({
      topicId,
      kind: item.kind,
      title: item.title.slice(0, 160),
      formula: item.formula.slice(0, 6000),
      symbols: Array.isArray(item.symbols) && item.symbols.length ? JSON.stringify(item.symbols.slice(0, 12)) : null,
      conditions: item.conditions?.slice(0, 1000) ?? null,
      commonMistake: item.commonMistake?.slice(0, 1000) ?? null,
      source: item.source === "notes" && grounded ? "notes" : "ai",
    });
    added++;
  }
  refresh();
  return added > 0 ? { ok: true, data: { added } } : { ok: false, error: "Nothing usable was extracted" };
}
