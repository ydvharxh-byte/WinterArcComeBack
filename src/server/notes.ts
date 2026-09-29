"use server";

import { db } from "@/db";
import {
  chapters,
  noteDocuments,
  noteSections,
  subjects,
  topics,
} from "@/db/schema";
import type { ActionResult, NoteDocumentDTO, NoteSectionDTO } from "@/lib/types";
import { asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callLlm, getConfig } from "./ai/llm";

function refresh() {
  revalidatePath("/", "layout");
}

/* ------------------------------- Extraction -------------------------------- */

interface RawPage {
  page: number;
  text: string;
}

/** pdf-parse (v2) — wrapped defensively; failure degrades to a clear error. */
async function extractPdf(buffer: Buffer): Promise<RawPage[]> {
  const mod = await import("pdf-parse");
  const PDFParse = (mod as { PDFParse?: unknown }).PDFParse ?? (mod as { default?: unknown }).default;
  if (!PDFParse) throw new Error("pdf-parse module shape unsupported");
  const parser = new (PDFParse as new (opts: { data: Buffer }) => {
    getText: () => Promise<{ text?: string; total?: number; pages?: { text: string; num?: number }[] }>;
    destroy?: () => Promise<void>;
  })({ data: buffer });
  try {
    const res = await parser.getText();
    if (res.pages && res.pages.length > 0) {
      const hasText = res.pages.some((p) => p.text && p.text.trim().length > 0);
      if (hasText) {
        return res.pages.map((p, i) => ({ page: p.num ?? i + 1, text: p.text ?? "" }));
      }
    }
    if (res.text && res.text.trim().length > 0) {
      const chunks = res.text.split("\f").filter((c) => c.trim().length > 0);
      return chunks.map((t, i) => ({ page: i + 1, text: t }));
    }
    return [];
  } finally {
    if (parser.destroy) await parser.destroy().catch(() => {});
  }
}

function extractPlain(text: string): RawPage[] {
  const chunks = text.split(/\f|={10,}/).map((c) => c.trim()).filter(Boolean);
  return (chunks.length > 1 ? chunks : [text]).map((t, i) => ({ page: i + 1, text: t }));
}

/* --------------------------- Section segmentation --------------------------- */

interface RawSection {
  heading: string;
  content: string;
  pageStart: number;
  pageEnd: number;
}

const HEADING_RE = /^(chapter|unit)\s+\d+([.:]\s*\S.*)?$|^\d+\.\d+\s+\S.{2,60}|^[A-Z][A-Z &,'–-]{5,60}$/;

function segment(pages: RawPage[]): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;

  const flush = () => {
    if (current && current.content.trim().length > 40) sections.push(current);
    current = null;
  };

  for (const p of pages) {
    const lines = p.text.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isHeading = line.length >= 4 && line.length <= 70 && HEADING_RE.test(line.replace(/^[\d.\s]+/, "")) || (line.length >= 4 && line.length <= 64 && /^chapter|^unit/i.test(line));
      if (line && isHeading) {
        flush();
        current = { heading: line.replace(/\s+/g, " ").slice(0, 80), content: "", pageStart: p.page, pageEnd: p.page };
      } else if (current) {
        current.content += (current.content ? "\n" : "") + rawLine;
        current.pageEnd = p.page;
      }
    }
    if (!current && p.text.trim().length > 80) {
      // pre-heading front matter
      const firstLine = lines.find((l) => l.trim().length > 10)?.trim().slice(0, 60) ?? `Page ${p.page}`;
      current = { heading: firstLine.replace(/\s+/g, " ").slice(0, 80), content: p.text, pageStart: p.page, pageEnd: p.page };
    }
  }
  flush();
  // cap section sizes — keep chunks studyable
  return sections.slice(0, 120).map((s) => ({ ...s, content: s.content.slice(0, 12000) }));
}

/* ------------------------------ Mapping to DB ------------------------------ */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenScore(heading: string, name: string): number {
  const h = new Set(normalize(heading).split(" "));
  const n = normalize(name).split(" ").filter((w) => w.length > 2);
  if (n.length === 0) return 0;
  let hits = 0;
  for (const w of n) if (h.has(w)) hits++;
  return hits / n.length;
}

interface MappedSection extends RawSection {
  chapterId: number | null;
  topicId: number | null;
  confidence: number;
}

async function mapSections(subjectId: number, sections: RawSection[]): Promise<MappedSection[]> {
  const chapterRows = await db.select().from(chapters).where(eq(chapters.subjectId, subjectId));
  const topicRows = chapterRows.length
    ? await db.select({ t: topics, chapterId: topics.chapterId }).from(topics).where(
        sql`${topics.chapterId} in (${sql.join(chapterRows.map((c) => sql`${c.id}`), sql`, `)})`
      )
    : [];

  // strip lines that give a strong deterministic chapter-id like "Chapter 7" 
  const chapterNumber = new Map(chapterRows.map((c) => [c.id, c]));

  return sections.map((s) => {
    const headingNorm = normalize(s.heading);

    // 1. strong chapter match
    let bestChapter: { id: number; score: number } = { id: 0, score: 0 };
    for (const c of chapterRows) {
      let score = tokenScore(headingNorm, c.name);
      const m = s.heading.match(/^(?:chapter|unit)\s+(\d+)/i);
      if (m && chapterNumber.get(c.id)?.sortOrder === Number(m[1])) score = Math.max(score, 0.95);
      if (score > bestChapter.score) bestChapter = { id: c.id, score };
    }

    // 2. topic match (prefer topics from best chapter)
    let bestTopic: { id: number; chapterId: number; score: number } = { id: 0, chapterId: 0, score: 0 };
    for (const t of topicRows) {
      let score = tokenScore(headingNorm, normalize(t.t.name));
      if (bestChapter.id && t.chapterId === bestChapter.id) score *= 1.3;
      if (score > bestTopic.score) bestTopic = { id: t.t.id, chapterId: t.chapterId, score };
    }

    if (bestTopic.score >= 0.6) {
      return { ...s, topicId: bestTopic.id, chapterId: bestTopic.chapterId, confidence: Math.min(0.97, bestTopic.score + 0.2) };
    }
    if (bestChapter.score >= 0.6) {
      return { ...s, topicId: null, chapterId: bestChapter.id, confidence: bestChapter.score };
    }
    return { ...s, topicId: null, chapterId: null, confidence: 0.25 };
  });
}

/** Optional LLM refinement for low-confidence headings — skipped when unconfigured. */
async function refineWithLlm(mapped: MappedSection[], subjectId: number): Promise<MappedSection[]> {
  const cfg = await getConfig();
  if (!cfg.configured) return mapped;
  const unsure = mapped.filter((m) => !m.topicId && (!m.chapterId || m.confidence < 0.6)).slice(0, 12);
  if (unsure.length === 0) return mapped;

  const chapterRows = await db.select().from(chapters).where(eq(chapters.subjectId, subjectId));
  const topicRows = chapterRows.length
    ? await db.select({ t: topics, chapterId: topics.chapterId }).from(topics).where(
        sql`${topics.chapterId} in (${sql.join(chapterRows.map((c) => sql`${c.id}`), sql`, `)})`
      )
    : [];
  const catalog = chapterRows.map((c) => ({
    chapter: c.name,
    chapterId: c.id,
    topics: topicRows.filter((t) => t.chapterId === c.id).map((t) => ({ id: t.t.id, name: t.t.name })),
  }));

  const res = await callLlm(
    [
      {
        role: "system",
        content: `You map note-section headings to an existing syllabus catalog. For each heading return the best chapterId/topicId from the catalog, or null when nothing fits at >=0.6 confidence. Reply ONLY JSON: {"mappings":[{"heading":"...","chapterId":number|null,"topicId":number|null}]} — never invent ids.`,
      },
      { role: "user", content: `Headings: ${JSON.stringify(unsure.map((u) => u.heading))}\nCatalog: ${JSON.stringify(catalog).slice(0, 8000)}` },
    ],
    { temperature: 0.1 }
  );
  if ("error" in res) return mapped;
  try {
    const parsed = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      mappings?: { heading?: string; chapterId?: number | null; topicId?: number | null }[];
    };
    if (!parsed.mappings) return mapped;
    const byHeading = new Map(parsed.mappings.filter((m) => m.heading).map((m) => [m.heading, m]));
    const validTopics = new Set(topicRows.map((t) => t.t.id));
    const validChapters = new Set(chapterRows.map((c) => c.id));
    return mapped.map((m) => {
      const r = byHeading.get(m.heading);
      if (!r) return m;
      const topicId = r.topicId && validTopics.has(r.topicId) ? r.topicId : null;
      const chapterIdRaw = r.chapterId && validChapters.has(r.chapterId) ? r.chapterId : null;
      const chapterId = topicId ? topicRows.find((t) => t.t.id === topicId)?.chapterId ?? chapterIdRaw : chapterIdRaw;
      if (!topicId && !chapterId) return m;
      return { ...m, topicId, chapterId, confidence: 0.8 };
    });
  } catch {
    return mapped;
  }
}

/* --------------------------------- Actions ---------------------------------- */

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function uploadNotes(formData: FormData): Promise<ActionResult<{ documentId: number; sections: number; reviewCount: number }>> {
  const subjectId = Number(formData.get("subjectId"));
  const file = formData.get("file");
  if (!Number.isInteger(subjectId)) return { ok: false, error: "Pick a subject first" };
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId));
  if (!subject) return { ok: false, error: "Subject not found" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Attach a file" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File too large (max 12 MB)" };

  const name = file.name.toLowerCase();
  let pages: RawPage[];
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      pages = await extractPdf(Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      return { ok: false, error: `Could not parse this PDF (${e instanceof Error ? e.message.slice(0, 80) : "unknown"}). Try a text export (.txt/.md).` };
    }
  } else if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith("text/")) {
    pages = extractPlain(await file.text());
  } else {
    return { ok: false, error: "Unsupported format — use PDF, TXT or MD" };
  }
  if (pages.length === 0) return { ok: false, error: "No readable text found (scanned images need OCR, which is not enabled)" };

  const sections = segment(pages);
  if (sections.length === 0) return { ok: false, error: "Could not detect chapters or topics — no clear headings found" };

  let mapped = await mapSections(subjectId, sections);
  mapped = await refineWithLlm(mapped, subjectId);

  const [doc] = await db.insert(noteDocuments).values({
    subjectId,
    title: formData.get("title")?.toString().trim() || file.name.replace(/\.[^.]+$/, "") || "Untitled notes",
    fileName: file.name,
    pageCount: pages.length,
    status: "mapped",
  }).returning({ id: noteDocuments.id });

  let reviewCount = 0;
  for (const [i, m] of mapped.entries()) {
    const needsReview = !m.topicId && (!m.chapterId || m.confidence < 0.6);
    if (needsReview) reviewCount++;
    await db.insert(noteSections).values({
      documentId: doc.id,
      chapterId: m.chapterId,
      topicId: m.topicId,
      heading: m.heading,
      content: m.content,
      pageStart: m.pageStart,
      pageEnd: m.pageEnd,
      confidence: m.confidence,
      needsReview,
      sortOrder: i,
    });
  }

  refresh();
  return { ok: true, data: { documentId: doc.id, sections: mapped.length, reviewCount } };
}

export async function getNotesLibrary(): Promise<{ documents: NoteDocumentDTO[] }> {
  const docs = await db
    .select({
      d: noteDocuments,
      subjectName: subjects.name,
      sections: sql<number>`count(distinct ${noteSections.id})`,
      reviewCount: sql<number>`count(distinct case when ${noteSections.needsReview} then ${noteSections.id} end)`,
    })
    .from(noteDocuments)
    .leftJoin(subjects, eq(noteDocuments.subjectId, subjects.id))
    .leftJoin(noteSections, eq(noteSections.documentId, noteDocuments.id))
    .groupBy(noteDocuments.id, subjects.name)
    .orderBy(desc(noteDocuments.createdAt));
  return {
    documents: docs.map((x) => ({
      id: x.d.id,
      subjectId: x.d.subjectId,
      subjectName: x.subjectName,
      title: x.d.title,
      fileName: x.d.fileName,
      pageCount: x.d.pageCount,
      status: x.d.status,
      sections: Number(x.sections),
      reviewCount: Number(x.reviewCount),
      createdAt: x.d.createdAt.toISOString(),
    })),
  };
}

export async function getDocumentSections(documentId: number): Promise<NoteSectionDTO[]> {
  if (!Number.isInteger(documentId)) return [];
  const rows = await db
    .select({ s: noteSections, chapterName: chapters.name, topicName: topics.name })
    .from(noteSections)
    .leftJoin(chapters, eq(noteSections.chapterId, chapters.id))
    .leftJoin(topics, eq(noteSections.topicId, topics.id))
    .where(eq(noteSections.documentId, documentId))
    .orderBy(asc(noteSections.sortOrder));
  return rows.map((r) => ({
    id: r.s.id,
    documentId: r.s.documentId,
    chapterId: r.s.chapterId,
    topicId: r.s.topicId,
    chapterName: r.chapterName,
    topicName: r.topicName,
    heading: r.s.heading,
    content: r.s.content,
    pageStart: r.s.pageStart,
    pageEnd: r.s.pageEnd,
    confidence: r.s.confidence,
    needsReview: r.s.needsReview,
  }));
}

export async function reassignSection(input: { id: number; chapterId: number | null; topicId: number | null }): Promise<ActionResult> {
  const parsed = z.object({ id: z.number().int(), chapterId: z.number().int().nullable(), topicId: z.number().int().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid assignment" };
  await db.update(noteSections).set({ chapterId: parsed.data.chapterId, topicId: parsed.data.topicId, needsReview: false, confidence: 1 }).where(eq(noteSections.id, parsed.data.id));
  refresh();
  return { ok: true };
}

export async function deleteNoteDocument(id: number): Promise<ActionResult> {
  await db.delete(noteDocuments).where(eq(noteDocuments.id, id));
  refresh();
  return { ok: true };
}
