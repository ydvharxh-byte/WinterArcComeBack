"use client";

import { Modal } from "@/components/modal";
import type { NoteDocumentDTO, NoteSectionDTO, SubjectDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteNoteDocument, getDocumentSections, reassignSection, uploadNotes } from "@/server/notes";
import { useAction } from "@/lib/use-action";
import {
  AlertTriangle,
  BookMarked,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  NotebookPen,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, ConfirmDelete, EmptyState, Field, Input, PageHeader, Select } from "./ui";

export function NotesClient({ documents, tree }: { documents: NoteDocumentDTO[]; tree: SubjectDTO[] }) {
  const { run, pending } = useAction();
  const [openDoc, setOpenDoc] = useState<NoteDocumentDTO | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState<string>(tree[0] ? String(tree[0].id) : "");
  const [uploading, setUploading] = useState(false);

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Choose a file first"); return; }
    if (!subjectId) { toast.error("Pick the subject these notes belong to"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("subjectId", subjectId);
      fd.set("file", file);
      const res = await uploadNotes(fd);
      if (res.ok && res.data) {
        toast.success(`Mapped ${res.data.sections} sections${res.data.reviewCount > 0 ? ` · ${res.data.reviewCount} flagged for review` : ""}`);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast.error(res.ok ? "Upload failed" : res.error);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notes"
        sub="Upload a whole subject's notes — chapters, topics and pages are mapped to your syllabus automatically"
      />

      {/* Upload */}
      <div className="mb-6 rounded-xl bg-panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Subject" className="sm:w-56">
            {tree.length === 0 ? (
              <p className="text-xs text-warning rounded-lg bg-warning/10 px-3 py-2">Create a subject first (Study page)</p>
            ) : (
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Notes file — PDF / TXT / MD (max 12 MB)" className="flex-1">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/*"
              className="w-full rounded-lg bg-panel2 px-3 py-2 text-sm text-mute file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white file:cursor-pointer"
            />
          </Field>
          <Button onClick={() => void onUpload()} loading={uploading} disabled={tree.length === 0} className="shrink-0">
            <Upload /> Upload & organize
          </Button>
        </div>
        <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-dim">
          Whole books work best — one file, all chapters. Headings like <code className="rounded bg-panel2 px-1">Chapter 7</code> or <code className="rounded bg-panel2 px-1">9.2 Moment of Inertia</code> are detected automatically;
          when the AI provider is configured, uncertain sections get a refinement pass, otherwise they&apos;re <em>flagged for review</em> rather than guessed wrong. Pages are preserved.
        </p>
      </div>

      {/* Library */}
      {documents.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="No notes yet"
          desc="Upload your notebook as one file — theory on each topic page will be grounded in it, with page references."
        />
      ) : (
        <div className="space-y-2.5">
          {documents.map((d) => (
            <button
              key={d.id}
              onClick={() => setOpenDoc(d)}
              className="flex w-full items-center gap-4 rounded-xl bg-panel px-5 py-4 text-left transition-colors hover:bg-[#16233a] cursor-pointer"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet/12 text-violet-soft"><FolderOpen className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 text-[11px] text-dim">
                  {d.subjectName ?? "No subject"} · {d.sections} sections{d.pageCount ? ` · ~${d.pageCount} pages` : ""} · {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </div>
              {d.reviewCount > 0 ? (
                <Badge variant="amber"><AlertTriangle className="size-3" /> {d.reviewCount} to review</Badge>
              ) : (
                <Badge variant="green"><Check className="size-3" /> mapped</Badge>
              )}
              <ChevronRight className="size-4 text-dim" />
            </button>
          ))}
        </div>
      )}

      {openDoc && (
        <DocumentModal doc={openDoc} tree={tree} onClose={() => setOpenDoc(null)} onDeleted={() => setOpenDoc(null)} />
      )}
    </div>
  );
}

function DocumentModal({ doc, tree, onClose, onDeleted }: { doc: NoteDocumentDTO; tree: SubjectDTO[]; onClose: () => void; onDeleted: () => void }) {
  const { run, pending } = useAction();
  const [sections, setSections] = useState<NoteSectionDTO[] | null>(null);
  const [editFor, setEditFor] = useState<NoteSectionDTO | null>(null);
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (sections === null) {
    void getDocumentSections(doc.id).then(setSections);
  }

  const subject = tree.find((s) => s.id === doc.subjectId);
  const chapters = subject?.chapters ?? [];
  const topicOptions = chapters.flatMap((c) => c.topics.map((t) => ({ id: t.id, name: t.name, chapterId: c.id, chapterName: c.name })));

  return (
    <Modal open onClose={onClose} title={doc.title} sub={`${doc.fileName} · ${doc.sections} sections`} wide>
      {sections === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-mute" /></div>
      ) : sections.length === 0 ? (
        <p className="py-6 text-sm text-mute">No sections in this document.</p>
      ) : (
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {sections.map((s) => (
            <div key={s.id} className={cn("rounded-lg px-3.5 py-2.5", s.needsReview ? "bg-warning/5 border border-warning/20" : "bg-panel2")}>
              <div className="flex items-center gap-2.5">
                <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium cursor-pointer hover:text-accent">
                  {s.heading}
                </button>
                {s.pageStart && <span className="text-[10px] text-dim tabular-nums">p.{s.pageStart}{s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ""}</span>}
                {s.needsReview ? (
                  <button
                    onClick={() => { setEditFor(s); setChapterId(s.chapterId); setTopicId(s.topicId); }}
                    className="flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning cursor-pointer"
                  >
                    <Link2 className="size-3" /> Assign topic
                  </button>
                ) : (
                  <button
                    onClick={() => { setEditFor(s); setChapterId(s.chapterId); setTopicId(s.topicId); }}
                    className="truncate text-[10px] text-mute hover:text-fog cursor-pointer"
                    title="Reassign"
                  >
                    {s.topicName ?? s.chapterName ?? "Unmapped"}
                  </button>
                )}
              </div>
              {expanded === s.id && (
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-line/60 pt-2 text-xs leading-relaxed text-mute">{s.content}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {editFor && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-panel2 p-4">
          <p className="text-sm font-semibold">Assign: <span className="text-accent">{editFor.heading}</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Chapter">
              <Select value={chapterId ?? ""} onChange={(e) => { setChapterId(e.target.value ? Number(e.target.value) : null); setTopicId(null); }}>
                <option value="">—</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Topic">
              <Select value={topicId ?? ""} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {topicOptions.filter((t) => !chapterId || t.chapterId === chapterId).map((t) => (
                  <option key={t.id} value={t.id}>{t.chapterName} · {t.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                run(() => reassignSection({ id: editFor.id, chapterId: editFor ? chapterId : null, topicId }), {
                  success: "Mapped",
                  onSuccess: () => { setEditFor(null); setSections(null); },
                })
              }
            >
              <Check /> Assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditFor(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <ConfirmDelete
          onConfirm={() => run(() => deleteNoteDocument(doc.id), { success: "Document deleted", onSuccess: onDeleted })}
          className="border border-line"
        />
      </div>
    </Modal>
  );
}
