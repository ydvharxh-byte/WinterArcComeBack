"use client";

import { TaskForm } from "@/components/forms";
import { Modal } from "@/components/modal";
import { addDays, fmtDateShort, minToTime, timeToMin, todayStr } from "@/lib/dates";
import type { SubjectDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteTask, planTask, setTaskStatus } from "@/server/tasks";
import { useAction } from "@/lib/use-action";
import {
  AlarmClock,
  CalendarPlus,
  Check,
  CircleDashed,
  ListTodo,
  Loader,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge, Button, Card, ConfirmDelete, EmptyState, Field, Input, PageHeader, Select, Stat,
} from "./ui";

const NEXT: Record<string, string> = { todo: "in_progress", in_progress: "completed", completed: "todo" };

function StatusBtn({ status, onClick }: { status: string; onClick: () => void }) {
  if (status === "completed")
    return (
      <button onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-400 cursor-pointer" title="Reopen">
        <Check className="size-3.5" /> Done
      </button>
    );
  if (status === "in_progress")
    return (
      <button onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 text-[11px] font-medium text-blue-400 cursor-pointer" title="Mark completed">
        <Loader className="size-3.5" /> In progress
      </button>
    );
  return (
    <button onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md border border-line2 px-2 text-[11px] font-medium text-mute hover:border-blue-400 cursor-pointer" title="Start">
      <CircleDashed className="size-3.5" /> Todo
    </button>
  );
}

export function TasksClient({ tasks, tree }: { tasks: TaskDTO[]; tree: SubjectDTO[] }) {
  const { run } = useAction();
  const today = todayStr();
  const [filter, setFilter] = useState<string>("all");
  const [prioFilter, setPrioFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [modal, setModal] = useState<"new" | TaskDTO | null>(null);
  const [planFor, setPlanFor] = useState<TaskDTO | null>(null);
  const [planDate, setPlanDate] = useState(today);
  const [planTime, setPlanTime] = useState("18:00");

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (filter === "all" || t.status === filter) &&
          (prioFilter === "all" || t.priority === prioFilter) &&
          (subjectFilter === "all" || t.subjectId === Number(subjectFilter))
      ),
    [tasks, filter, prioFilter, subjectFilter]
  );

  const counts = {
    todo: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    overdue: tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "completed").length,
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        sub="Everything you need to get done — linked to subjects and the planner"
        actions={<Button size="sm" onClick={() => setModal("new")}><Plus /> New task</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Todo" value={counts.todo} icon={<ListTodo />} />
        <Stat label="In progress" value={counts.inProgress} icon={<Loader />} tone="#06B6D4" />
        <Stat label="Completed" value={counts.completed} icon={<Check />} tone="#34D399" />
        <Stat label="Overdue" value={counts.overdue} icon={<AlarmClock />} tone="#F87171" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-ink p-1">
          {[
            ["all", "All"],
            ["todo", "Todo"],
            ["in_progress", "In progress"],
            ["completed", "Completed"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={cn(
                "h-7 rounded-md px-3 text-xs font-medium transition-colors cursor-pointer",
                filter === v ? "bg-panel2 text-fog" : "text-mute hover:text-fog"
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <Select value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)} className="w-36">
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="w-40">
          <option value="all">All subjects</option>
          {tree.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-dim">{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ListTodo />}
          title="No tasks here"
          desc="Create a task or adjust your filters."
          action={<Button size="sm" onClick={() => setModal("new")}><Plus /> New task</Button>}
        />
      ) : (
        <Card className="divide-y divide-line/60">
          {filtered.map((t) => {
            const overdue = t.dueDate && t.dueDate < today && t.status !== "completed";
            return (
              <div key={t.id} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-panel2/40", t.status === "completed" && "opacity-55")}>
                <div className="pt-0.5">
                  <StatusBtn status={t.status} onClick={() => run(() => setTaskStatus(t.id, NEXT[t.status]), { success: NEXT[t.status] === "completed" ? "Task completed" : undefined })} />
                </div>
                <span
                  className="mt-2 size-2 shrink-0 rounded-full"
                  title={`${t.priority} priority`}
                  style={{ backgroundColor: t.priority === "high" ? "#F87171" : t.priority === "medium" ? "#FBBF24" : "#34D399" }}
                />
                <div className="min-w-0 flex-1">
                  <button onClick={() => setModal(t)} className={cn("text-left text-sm font-medium hover:text-accent transition-colors cursor-pointer", t.status === "completed" && "line-through text-mute")}>
                    {t.title}
                  </button>
                  {t.description && <p className="mt-0.5 line-clamp-1 text-xs text-mute">{t.description}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.subjectName && (
                      <Badge><span className="size-1.5 rounded-full" style={{ backgroundColor: t.subjectColor ?? "#64748B" }} />{t.subjectName}</Badge>
                    )}
                    {t.dueDate && (
                      <Badge variant={overdue ? "red" : t.dueDate === today ? "amber" : "default"}>
                        {overdue ? "Overdue · " : ""}{t.dueDate === today ? "Today" : t.dueDate === addDays(today, 1) ? "Tomorrow" : fmtDateShort(t.dueDate)}
                      </Badge>
                    )}
                    {t.estimatedMinutes && <Badge>~{t.estimatedMinutes}m</Badge>}
                    {t.scheduledDate && <Badge variant="accent">Planned {fmtDateShort(t.scheduledDate)}{t.startMin != null ? ` ${minToTime(t.startMin)}` : ""}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {t.status !== "completed" && (
                    <button
                      onClick={() => { setPlanFor(t); setPlanDate(t.scheduledDate ?? today); setPlanTime(t.startMin != null ? minToTime(t.startMin) : "18:00"); }}
                      className="rounded-md p-1.5 text-dim hover:bg-panel2 hover:text-accent transition-colors cursor-pointer"
                      title="Add to planner"
                    >
                      <CalendarPlus className="size-4" />
                    </button>
                  )}
                  <ConfirmDelete onConfirm={() => run(() => deleteTask(t.id), { success: "Task deleted" })} />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "new" ? "New task" : "Edit task"} sub="+8–20 XP when completed">
        {modal !== null && <TaskForm tree={tree} task={modal === "new" ? null : modal} onDone={() => setModal(null)} />}
      </Modal>

      <Modal open={planFor !== null} onClose={() => setPlanFor(null)} title="Add to planner" sub={planFor ? `"${planFor.title}" · ~${planFor.estimatedMinutes ?? 45} min` : undefined}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} /></Field>
            <Field label="Start time"><Input type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} /></Field>
          </div>
          <Button
            className="w-full"
            onClick={() =>
              planFor &&
              run(() => planTask(planFor.id, planDate, timeToMin(planTime)), {
                success: "Added to planner",
                onSuccess: () => setPlanFor(null),
              })
            }
          >
            Schedule block
          </Button>
        </div>
      </Modal>
    </div>
  );
}
