"use client";

import type { SubjectDTO, TopicReferenceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteReference } from "@/server/refs";
import { useAction } from "@/lib/use-action";
import { AlertTriangle, Sigma } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, ConfirmDelete, EmptyState, PageHeader, Select } from "./ui";

export function FormulasClient({ refs, tree }: { refs: TopicReferenceDTO[]; tree: SubjectDTO[] }) {
  const { run } = useAction();
  const [kind, setKind] = useState("all");
  const [subjectId, setSubjectId] = useState("");
  const [dueOnly, setDueOnly] = useState(false);

  // revision-due filter is resolved server-side via a fresh fetch when toggled
  const [dueRefs, setDueRefs] = useState<TopicReferenceDTO[] | null>(null);
  const toggleDue = async () => {
    const next = !dueOnly;
    setDueOnly(next);
    if (next) {
      const { getReferences } = await import("@/server/refs");
      setDueRefs(await getReferences({ revisionDueOnly: true }));
    } else setDueRefs(null);
  };

  const chapters = useMemo(() => {
    const s = tree.find((x) => String(x.id) === subjectId);
    return s ? s.chapters : [];
  }, [tree, subjectId]);
  const [chapterId, setChapterId] = useState("");

  const shown = (dueOnly && dueRefs ? dueRefs : refs).filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (subjectId && r.subjectId !== Number(subjectId)) return false;
    if (chapterId && r.chapterId !== Number(chapterId)) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const m = new Map<string, TopicReferenceDTO[]>();
    for (const r of shown) {
      const key = `${r.subjectName} → ${r.chapterName}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div>
      <PageHeader
        title="Formulas & Derivations"
        sub="Every formula and derivation, source-labeled — inside a topic you see only that topic's"
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-panel p-1">
          {[["all", "All"], ["formula", "Formulas"], ["derivation", "Derivations"]].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setKind(v)}
              className={cn("h-7 rounded-md px-3 text-xs font-medium transition-colors cursor-pointer", kind === v ? "bg-panel2 text-fog" : "text-mute hover:text-fog")}
            >
              {l}
            </button>
          ))}
        </div>
        <Select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setChapterId(""); }} className="w-44">
          <option value="">All subjects</option>
          {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-44" disabled={!subjectId}>
          <option value="">All chapters</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <button
          onClick={() => void toggleDue()}
          className={cn("rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer", dueOnly ? "border-transparent bg-accent-soft text-accent" : "border-line text-mute hover:text-fog")}
        >
          Revision due only
        </button>
        <span className="ml-auto text-xs text-dim">{shown.length} item{shown.length === 1 ? "" : "s"}</span>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Sigma />}
          title="No formulas yet"
          desc="Add them on a topic page (manual or AI extraction from your notes). Each entry records whether it came from your notes, AI, or manual input."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">{group}</p>
              <div className="grid gap-2.5 md:grid-cols-2">
                {items.map((r) => (
                  <div key={r.id} className="rounded-xl bg-panel p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={r.kind === "formula" ? "violet" : "ice"}>{r.kind}</Badge>
                        <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-dim">src: {r.source}</span>
                      </div>
                      <ConfirmDelete onConfirm={() => run(() => deleteReference(r.id), { success: "Removed" })} />
                    </div>
                    <p className="mt-2 text-sm font-semibold">{r.title}</p>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-[15px] font-medium text-fog/95">{r.formula}</pre>
                    {r.symbols && (
                      <p className="mt-1.5 text-xs text-mute">
                        {r.symbols.map((s) => `${s.symbol}=${s.meaning}${s.unit ? ` (${s.unit})` : ""}`).join(" · ")}
                      </p>
                    )}
                    {r.conditions && <p className="mt-1.5 text-xs text-ice">⏱ {r.conditions}</p>}
                    {r.commonMistake && <p className="mt-1 flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {r.commonMistake}</p>}
                    <Link href={`/study/topic/${r.topicId}`} className="mt-2 inline-block text-[11px] font-medium text-accent hover:underline">
                      Open topic → {r.topicName}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
