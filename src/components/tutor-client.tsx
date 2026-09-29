"use client";

import type { ErrorLogDTO, RevisionItemDTO, SubjectDTO, TutorMessageDTO, TutorSessionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { classifyIntent } from "@/server/ai/orchestrator";
import { useAction } from "@/lib/use-action";
import {
  createTutorSession,
  deleteTutorSession,
  getSessionMessages,
  setErrorStatus,
} from "@/server/tutor";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ClipboardCheck,
  GraduationCap,
  Lightbulb,
  Loader2,
  RefreshCw,
  Send,
  Sparkle,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Select } from "./ui";

const MODES = [
  { id: "chat", label: "Ask anything", icon: <Sparkle />, hint: "Open conversation" },
  { id: "teach", label: "Teach me", icon: <BookOpen />, hint: "Concept → example → check" },
  { id: "practice", label: "Practice me", icon: <Wand2 />, hint: "Adaptive questions" },
  { id: "examine", label: "Examine my answer", icon: <ClipboardCheck />, hint: "CBSE-style marking" },
  { id: "plan", label: "Plan my studies", icon: <BrainCircuit />, hint: "What to do next" },
] as const;

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Explain simpler", prompt: "Explain that more simply, with one easier example." },
  { label: "Give an example", prompt: "Give me a concrete worked example." },
  { label: "Quiz me", prompt: "Quiz me on this — one question at a time, adapted to my level." },
  { label: "Hint only", prompt: "Give me a hint only — not the full solution." },
  { label: "Full solution", prompt: "Show me the complete solution with working." },
  { label: "Harder question", prompt: "Give me a slightly harder question on the same concept." },
];

/* Minimal markdown-ish renderer: bold, code, line breaks, list items */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const bullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+[.)]\s/.test(trimmed);
        const content = bullet ? trimmed.replace(/^([-*]|\d+[.)])\s+/, "") : trimmed;
        const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
        return (
          <div key={i} className={cn(trimmed === "" ? "h-3" : bullet ? "pl-3 relative" : "", "leading-relaxed")}>
            {bullet && <span className="absolute left-0 text-accent">•</span>}
            {parts.map((p, j) => {
              if (p.startsWith("**") && p.endsWith("**")) return <strong key={j} className="font-semibold text-fog">{p.slice(2, -2)}</strong>;
              if (p.startsWith("`") && p.endsWith("`")) return <code key={j} className="rounded bg-panel2 px-1 py-0.5 text-[0.9em] text-violet-soft">{p.slice(1, -1)}</code>;
              return <span key={j}>{p}</span>;
            })}
          </div>
        );
      })}
    </>
  );
}

export function TutorClient({
  sessions,
  tree,
  errorLog,
  revisionDue,
  configured,
  modelName,
  baseUrl,
  initialMode,
  initialTopicId,
}: {
  sessions: TutorSessionDTO[];
  tree: SubjectDTO[];
  errorLog: ErrorLogDTO[];
  revisionDue: RevisionItemDTO[];
  configured: boolean;
  modelName: string | null;
  baseUrl: string;
  initialMode: string;
  initialTopicId: number | null;
}) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [mode, setMode] = useState<string>(initialMode);
  const [messages, setMessages] = useState<TutorMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [focusOpen, setFocusOpen] = useState(!!initialTopicId);
  const [focusSubject, setFocusSubject] = useState<number | null>(null);
  const [focusTopic, setFocusTopic] = useState<number | null>(initialTopicId);

  const allTopics = tree.flatMap((s) => s.chapters.flatMap((c) => c.topics.map((t) => ({ ...t, subjectName: s.name, chapterName: c.name }))));
  const suggestedTopic = allTopics.filter((t) => t.mastery.score < 70).sort((a, b) => a.mastery.score - b.mastery.score)[0];
  const focusTopicData = focusTopic ? allTopics.find((t) => t.id === focusTopic) ?? null : null;

  const { run } = useAction();
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  useEffect(() => {
    if (initialTopicId || initialMode !== "chat") {
      void startSession(initialMode, initialTopicId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSession = async (id: number) => {
    setSessionId(id);
    setLoadingMsgs(true);
    const msgs = await getSessionMessages(id);
    setMessages(msgs);
    setLoadingMsgs(false);
  };

  const startSession = async (m: string, topicId: number | null = null, silent = false) => {
    if (!silent && !configured) {
      toast.error(modelName ? "AI needs AI_API_KEY in the server environment" : "Pick a model — Settings → AI, or set AI_MODEL");
    }
    setMode(m);
    setThinking(true);
    const res = await createTutorSession({ mode: m as "chat" | "teach" | "practice" | "examine" | "plan", topicId });
    if (res.ok && res.data) {
      setSessionId(res.data.id);
      setMessages([]);
      const kick =
        m === "teach" && topicId ? "Teach me this topic. Start with the prerequisites and intuition, then check my understanding."
        : m === "practice" ? "Run adaptive practice for me. One question at a time — wait for my answer before continuing."
        : m === "examine" ? "I want you to mark my answer CBSE-style. Ask me for the question and my answer."
        : m === "plan" ? "Given my current state, what should I study next and why? Keep it realistic."
        : null;
      if (kick) await send(res.data.id, kick, m);
      else {
        setMessages([{ id: 0, role: "assistant", content: greetingFor(m, suggestedTopic?.name), nextAction: null, createdAt: new Date().toISOString() }]);
      }
    }
    setThinking(false);
  };

  /** Streaming tutor turn with graceful fallback. */
  const send = async (sid: number, text: string, forMode?: string) => {
    const cls = classifyIntent(text, forMode ?? mode);
    setThinking(true);
    setStreaming(false);
    setStage(cls.stageLabel);
    setMessages((m) => [...m, { id: Date.now(), role: "user", content: text, nextAction: null, createdAt: new Date().toISOString() }]);

    const assistantId = Date.now() + 1;
    try {
      const res = await fetch("/api/ai/tutor/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if ((data as { error?: string }).error === "not_configured") {
          setMessages((m) => [...m, { id: assistantId, role: "assistant", content: CONFIG_HELP, nextAction: null, createdAt: new Date().toISOString() }]);
        } else if ((data as { error?: string }).error === "model_missing") {
          toast.error("AI_MODEL is not set — pick one in Settings → AI");
        } else {
          toast.error((data as { error?: string }).error ?? "AI unavailable");
        }
        setThinking(false);
        setStage(null);
        return;
      }

      setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "", nextAction: null, createdAt: new Date().toISOString() }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDelta = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.trim().replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const parsed = JSON.parse(line) as { t: string; d: unknown };
            if (parsed.t === "delta") {
              const chunk = String(parsed.d);
              // hide the trailing ```meta block while streaming
              if (!sawDelta) { setStreaming(true); setStage(null); }
              sawDelta = true;
              setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content + chunk } : x)));
            } else if (parsed.t === "done") {
              const d = parsed.d as { reply: string; nextAction: { type: string; label: string } | null };
              setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: d.reply, nextAction: d.nextAction } : x)));
              router.refresh(); // state panel / mastery / planner changed
            } else if (parsed.t === "error") {
              toast.error(String(parsed.d));
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch {
      toast.error("Network error — the conversation is safe, try again");
      setMessages((m) => m.filter((x) => x.id !== assistantId || x.content));
    }
    setThinking(false);
    setStreaming(false);
    setStage(null);
  };

  const onSend = () => {
    const text = input.trim();
    if (!text || thinking) return;
    if (!sessionId) void startAndSend(text);
    else {
      setInput("");
      void send(sessionId, text);
    }
  };

  const startAndSend = async (text: string) => {
    const res = await createTutorSession({ mode: mode as "chat" | "teach" | "practice" | "examine" | "plan", topicId: focusTopic });
    if (res.ok && res.data) {
      setSessionId(res.data.id);
      setMessages([]);
      setInput("");
      await send(res.data.id, text);
    }
  };

  const errors = errorLog.filter((e) => e.status !== "resolved").slice(0, 4);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 8.5rem)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            Tutor <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent"><Sparkles className="size-3.5" /></span>
          </h1>
          <p className="mt-0.5 text-sm text-mute">Teaches, examines, plans — always against your real academic state</p>
        </div>
        {configured ? (
          <Badge variant="green" className="tabular-nums">online · {modelName}</Badge>
        ) : (
          <Badge variant="amber">{modelName ? "no key" : "no model"} · setup needed</Badge>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Left column */}
        <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Start</p>
            <div className="space-y-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void startSession(m.id, m.id === "teach" || m.id === "practice" ? focusTopic : null)}
                  disabled={thinking}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer [&_svg]:size-4",
                    mode === m.id && sessionId ? "bg-accent-soft text-fog" : "text-mute hover:bg-panel hover:text-fog"
                  )}
                >
                  <span className="text-accent">{m.icon}</span>
                  <span className="flex-1 font-medium">{m.label}</span>
                  <span className="hidden text-[10px] text-dim xl:block">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Focus topic</p>
              <button onClick={() => setFocusOpen(!focusOpen)} className="text-[11px] text-dim hover:text-fog cursor-pointer">
                {focusOpen ? "Hide" : "Pick"}
              </button>
            </div>
            {focusOpen ? (
              <div className="space-y-2">
                <Select value={focusSubject ?? ""} onChange={(e) => { setFocusSubject(e.target.value ? Number(e.target.value) : null); setFocusTopic(null); }}>
                  <option value="">All subjects</option>
                  {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Select value={focusTopic ?? ""} onChange={(e) => setFocusTopic(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Auto (weakest first)</option>
                  {allTopics.filter((t) => !focusSubject || tree.find((s) => s.id === focusSubject)?.chapters.some((c) => c.id === t.chapterId)).map((t) => (
                    <option key={t.id} value={t.id}>{t.subjectName} · {t.chapterName} · {t.name}</option>
                  ))}
                </Select>
              </div>
            ) : (
              <button
                onClick={() => setFocusOpen(true)}
                className="w-full truncate rounded-lg bg-panel px-3 py-2 text-left text-sm text-mute hover:text-fog cursor-pointer"
              >
                {focusTopicData
                  ? `${focusTopicData.name} · ${focusTopicData.mastery.score}/100`
                  : suggestedTopic
                    ? `${suggestedTopic.name} (weakest · ${suggestedTopic.mastery.score}/100)`
                    : "Auto (weakest first)"}
              </button>
            )}
          </div>

          <div className="space-y-3 rounded-xl bg-panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">State I see</p>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fog"><RefreshCw className="size-3 text-ice" /> Revision due · {revisionDue.length}</p>
              {revisionDue.slice(0, 3).map((r) => (
                <p key={r.id} className="truncate text-[11px] text-dim">· {r.topicName}{r.daysLate > 0 ? ` (${r.daysLate}d late)` : ""}</p>
              ))}
              {revisionDue.length === 0 && <p className="text-[11px] text-dim">Nothing due — clean.</p>}
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fog"><AlertTriangle className="size-3 text-warning" /> Misconceptions · {errorLog.filter((e) => e.status !== "resolved").length}</p>
              {errors.map((e) => (
                <button
                  key={e.id}
                  onClick={() => run(() => setErrorStatus(e.id, e.status === "unresolved" ? "improving" : "resolved"), { success: "Updated" })}
                  title="Click to advance state (unresolved → improving → resolved)"
                  className="block w-full truncate text-left text-[11px] text-dim hover:text-fog cursor-pointer"
                >
                  · {e.tag.replace(/-/g, " ")}{e.topicName ? ` (${e.topicName})` : ""} — ×{e.count}
                </button>
              ))}
              {errors.length === 0 && <p className="text-[11px] text-dim">No recorded misconceptions.</p>}
            </div>
          </div>

          {sessions.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Recent</p>
              <div className="space-y-0.5">
                {sessions.slice(-6).reverse().map((s) => (
                  <div key={s.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => void openSession(s.id)}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                        sessionId === s.id ? "bg-panel text-fog" : "text-mute hover:bg-panel hover:text-fog"
                      )}
                    >
                      {s.title ?? s.lastMessage ?? `${s.mode} session`}
                    </button>
                    <button onClick={() => run(() => deleteTutorSession(s.id), {})} className="hidden rounded p-1 text-dim hover:text-danger group-hover:block cursor-pointer">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex min-h-0 flex-col rounded-xl bg-panel">
          {/* Context strip */}
          {focusTopicData && sessionId !== null && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-5 py-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fog"><Lightbulb className="size-3.5 text-accent" /> {focusTopicData.name}</span>
              <span className="text-[11px] text-dim">{focusTopicData.subjectName} · {focusTopicData.chapterName}</span>
              <span className={cn("text-[11px] font-semibold tabular-nums", focusTopicData.mastery.score >= 70 ? "text-success" : focusTopicData.mastery.score >= 40 ? "text-warning" : "text-dim")}>
                mastery {focusTopicData.mastery.score}/100
              </span>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {!sessionId && messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><GraduationCap className="size-6" /></span>
                <p className="font-display text-lg font-bold">Your AI tutor, on your data</p>
                <p className="max-w-sm text-sm leading-relaxed text-mute">
                  I see your subjects, mastery scores, mistakes, revision schedule and exams.
                  Pick a mode on the left, or just ask a question below.
                </p>
                {!configured && (
                  <div className="mt-2 max-w-sm rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-left text-xs leading-relaxed text-warning">
                    Provider: <strong>BazaarLink</strong> ({baseUrl.replace("https://", "")}). Set <code className="rounded bg-panel2 px-1">AI_API_KEY</code> and <code className="rounded bg-panel2 px-1">AI_MODEL</code> in the server environment — or save a model in Settings → AI. Mastery, planner, revision and the error log already work without it.
                  </div>
                )}
              </div>
            ) : loadingMsgs ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-mute" /></div>
            ) : (
              <div className="space-y-5">
                {messages.map((m, i) => (
                  <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                        m.role === "user" ? "bg-accent text-white rounded-br-md" : "bg-panel2 text-fog rounded-bl-md"
                      )}
                    >
                      {m.role === "user" ? (
                        <span className="whitespace-pre-wrap leading-relaxed">{m.content}</span>
                      ) : (
                        <Rich text={streaming && i === messages.length - 1 ? m.content.replace(/```meta[\s\S]*$/, "") : m.content} />
                      )}
                      {m.role === "user" && m.content === "" && <Loader2 className="size-3.5 animate-spin" />}
                      {m.nextAction && (
                        <div className="mt-2.5 flex items-center gap-1.5 border-t border-fog/10 pt-2 text-[11px] text-mute">
                          <ArrowRight className="size-3 text-accent" /> Next: {m.nextAction.label}
                        </div>
                      )}
                      {m.role === "assistant" && i === messages.length - 1 && !thinking && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-fog/10 pt-2.5">
                          {QUICK_ACTIONS.map((a) => (
                            <button
                              key={a.label}
                              onClick={() => sessionId && void send(sessionId, a.prompt)}
                              className="rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-mute transition-colors hover:border-line2 hover:text-fog cursor-pointer"
                            >
                              {a.label}
                            </button>
                          ))}
                          <button
                            onClick={() => { setInput("Here's my answer: "); inputRef.current?.focus(); }}
                            className="rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-mute transition-colors hover:border-line2 hover:text-fog cursor-pointer"
                          >
                            Check my answer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {thinking && !streaming && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-panel2 px-4 py-3 text-xs text-mute">
                      <Loader2 className="size-3.5 animate-spin" /> {stage ?? "Thinking…"}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
          <div className="border-t border-line p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={thinking ? stage ?? "Working…" : "Ask, paste an answer to check, or say what you want to learn…"}
                rows={2}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl bg-panel2 px-3.5 py-3 text-sm text-fog placeholder:text-dim focus:outline-none focus:ring-2 ring-accent disabled:opacity-60"
                disabled={thinking}
              />
              <Button onClick={onSend} disabled={thinking || !input.trim()} className="h-11 shrink-0" aria-label="Send">
                <Send />
              </Button>
            </div>
            <p className="mt-2 px-1 text-[10px] text-dim">
              Enter to send · Shift+Enter for a new line · Evaluations update mastery, error log and revision automatically
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const CONFIG_HELP =
  "The tutor brain isn't connected yet. I'm configured for the **BazaarLink** gateway — set `AI_API_KEY` and `AI_MODEL` in the server environment, or pick a model in Settings → AI. Everything else in Study OS (mastery, planner, revision, error log) already runs on your real data.";

function greetingFor(mode: string, weakest?: string): string {
  switch (mode) {
    case "teach":
      return weakest ? `Tell me which topic you want to learn — or I can start with **${weakest}**, your weakest right now. I'll explain the intuition, show one example, then check your understanding.` : "Tell me which topic you want to learn.";
    case "practice":
      return weakest ? `I'll run adaptive questions — one at a time. Want to start with **${weakest}** (weakest on record), or name a topic?` : "Name a topic and I'll question you one at a time, adapting difficulty to your answers.";
    case "examine":
      return "Paste the **question** and **your answer** — I'll mark it CBSE-style: what earned marks, what lost them, and how to fix it.";
    case "plan":
      return "Say \"plan my day\" or \"plan my week\" and I'll build a realistic schedule from your mastery, exams, backlog and revision state — with reasons.";
    default:
      return "Ask me anything — a concept to explain, a doubt, or paste an answer for feedback.";
  }
}
