"use client";

import { Modal } from "@/components/modal";
import {
  addDays,
  fmtDateLong,
  fmtDateShort,
  fmtTime12,
  minToTime,
  minutesOfNow,
  monthName,
  parseYMD,
  startOfWeekMonday,
  timeToMin,
  weekdayShort,
} from "@/lib/dates";
import type { HabitDTO, PlanBlockDTO } from "@/lib/types";
import { BLOCK_COLORS, BLOCK_TYPES, cn } from "@/lib/utils";
import {
  createPlanBlock,
  deletePlanBlock,
  rescheduleBlock,
  toggleBlockDone,
  updatePlanBlock,
} from "@/server/tasks";
import { generateBreakPlan, generateDailyPlan } from "@/server/engine";
import { useAction } from "@/lib/use-action";
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDelete, EmptyState, Field, Input, PageHeader, Select } from "./ui";

const DAY_START = 5 * 60;
const DAY_END = 24 * 60;
const HOUR_PX = 56;

interface PlacedBlock {
  b: PlanBlockDTO;
  lane: number;
  lanes: number;
}

function layoutDay(blocks: PlanBlockDTO[]): PlacedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  return sorted.map((b) => {
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endMin);
    } else laneEnds[lane] = b.endMin;
    return { b, lane, lanes: 0 };
  }).map((p) => ({ ...p, lanes: Math.max(1, laneEnds.length) }));
}

function BlockChip({ p, onClick, compact, hourPx = HOUR_PX }: { p: PlacedBlock; onClick: () => void; compact?: boolean; hourPx?: number }) {
  const color = p.b.color ?? BLOCK_COLORS[p.b.type] ?? BLOCK_COLORS.other;
  const top = ((p.b.startMin - DAY_START) / 60) * hourPx;
  const height = Math.max(compact ? 18 : 26, ((p.b.endMin - p.b.startMin) / 60) * hourPx - 2);
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left transition-all hover:brightness-125 cursor-pointer",
        p.b.done && "opacity-45"
      )}
      style={{
        top,
        height,
        left: `calc(${(p.lane / p.lanes) * 100}% + 1px)`,
        width: `calc(${100 / p.lanes}% - 3px)`,
        backgroundColor: `${color}1f`,
        borderLeftColor: color,
      }}
    >
      <p className={cn("truncate text-[11px] font-semibold leading-tight", p.b.done && "line-through")} style={{ color }}>{p.b.title}</p>
      {!compact && height > 34 && (
        <p className="truncate text-[9px] font-medium text-mute">{fmtTime12(p.b.startMin)} – {fmtTime12(p.b.endMin)}</p>
      )}
    </button>
  );
}

export function PlannerClient({ blocks, habits, today }: { blocks: PlanBlockDTO[]; habits: HabitDTO[]; today: string }) {
  const { run } = useAction();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [cursor, setCursor] = useState(today);
  const [editBlock, setEditBlock] = useState<PlanBlockDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const nowMin = minutesOfNow();

  // new block form
  const [fTitle, setFTitle] = useState("");
  const [fType, setFType] = useState<string>("study");
  const [fDate, setFDate] = useState(today);
  const [fStart, setFStart] = useState("18:00");
  const [fDur, setFDur] = useState("60");

  const byDate = useMemo(() => {
    const m = new Map<string, PlanBlockDTO[]>();
    for (const b of blocks) {
      if (!m.has(b.date)) m.set(b.date, []);
      m.get(b.date)!.push(b);
    }
    return m;
  }, [blocks]);

  const weekStart = startOfWeekMonday(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthCursor = parseYMD(cursor);
  const monthStart = `${cursor.slice(0, 8)}01`;
  const monthGridStart = startOfWeekMonday(monthStart);
  const monthCells = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));

  const shift = (dir: number) => {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else {
      const d = parseYMD(cursor);
      d.setMonth(d.getMonth() + dir);
      setCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d.getDate(), 28)).padStart(2, "0")}`);
    }
  };

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);

  const headerLabel =
    view === "day"
      ? fmtDateLong(cursor)
      : view === "week"
        ? `${fmtDateShort(weekStart)} – ${fmtDateShort(addDays(weekStart, 6))}`
        : `${monthName(monthCursor.getMonth())} ${monthCursor.getFullYear()}`;

  return (
    <div>
      <PageHeader
        title="Planner"
        sub="Day, week and month — every part of your life on one timeline"
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg border border-line bg-ink p-1">
              {(["day", "week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn("h-7 rounded-md px-3 text-xs font-medium capitalize transition-colors cursor-pointer", view === v ? "bg-panel2 text-fog" : "text-mute hover:text-fog")}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                run(() => generateDailyPlan(view === "day" ? cursor : today), {
                  success: undefined,
                  onSuccess: (data) => {
                    if (data && data.created > 0) toast.success(`Planned ${data.created} block${data.created === 1 ? "" : "s"} — highest-impact first`);
                    else toast.info(data?.summary[0] ?? "Nothing to add");
                  },
                })
              }
            >
              <Wand2 /> Auto-plan {view === "day" && cursor !== today ? "day" : "today"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              title="Build the 15–25 Oct PCM recovery plan"
              onClick={() =>
                run(() => generateBreakPlan(), {
                  onSuccess: (data) => {
                    if (data && data.created > 0) toast.success(`Autumn break plan: ${data.created} blocks across ${data.days.length} days`);
                    else toast.info("Break plan already in place (or no pending topics)");
                  },
                })
              }
            >
              <CalendarRange /> Break plan
            </Button>
            <Button size="sm" onClick={() => { setFDate(view === "day" ? cursor : today); setAddOpen(true); }}><Plus /> Block</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft /></Button>
        <Button variant="secondary" size="icon" onClick={() => shift(1)} aria-label="Next"><ChevronRight /></Button>
        <Button variant="ghost" size="sm" onClick={() => setCursor(today)}>Today</Button>
        <h2 className="font-display ml-2 text-lg font-bold tracking-tight">{headerLabel}</h2>
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          {["study", "gym", "meal", "rest"].map((t) => (
            <span key={t} className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-dim">
              <span className="size-2 rounded-sm" style={{ backgroundColor: BLOCK_COLORS[t] }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------- DAY ------------------------------- */}
      {view === "day" && (
        <Card className="overflow-hidden">
          <div className="flex max-h-[70vh] overflow-y-auto">
            <div className="w-16 shrink-0 select-none border-r border-line">
              {hours.map((h) => (
                <div key={h} className="relative" style={{ height: HOUR_PX }}>
                  <span className="absolute -top-2 right-2 text-[10px] font-medium text-dim">{h < 24 * 60 ? fmtTime12(h) : ""}</span>
                </div>
              ))}
            </div>
            <div className="relative flex-1" style={{ height: ((DAY_END - DAY_START) / 60) * HOUR_PX }}>
              {hours.map((h) => (
                <div key={h} className="border-b border-line/50" style={{ height: HOUR_PX }} />
              ))}
              {cursor === today && (
                <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: ((nowMin - DAY_START) / 60) * HOUR_PX }}>
                  <div className="h-px bg-accent" />
                  <div className="absolute -left-0 -top-1 size-2 rounded-full bg-accent" />
                </div>
              )}
              {layoutDay(byDate.get(cursor) ?? []).map((p) => (
                <BlockChip key={p.b.id} p={p} onClick={() => setEditBlock(p.b)} />
              ))}
              {(byDate.get(cursor) ?? []).length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <EmptyState
                    icon={<CalendarDays />}
                    title="Empty day"
                    desc="Add study sessions, gym, meals or rest to this day."
                    action={<Button size="sm" onClick={() => { setFDate(cursor); setAddOpen(true); }}><Plus /> Add block</Button>}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------- WEEK ------------------------------ */}
      {view === "week" && (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="flex min-w-[760px]">
              <div className="w-14 shrink-0" />
              {weekDays.map((d) => (
                <button
                  key={d}
                  onClick={() => { setCursor(d); setView("day"); }}
                  className={cn(
                    "flex-1 border-b border-l border-line px-2 py-2 text-center transition-colors hover:bg-panel2/50 cursor-pointer",
                    d === today && "bg-accent-soft/50"
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">{weekdayShort(d)}</p>
                  <p className={cn("font-display text-sm font-bold", d === today && "text-accent")}>{d.slice(8)}</p>
                </button>
              ))}
            </div>
            <div className="flex min-w-[760px]">
              <div className="w-14 shrink-0 select-none border-r border-line">
                {hours.map((h) => (
                  <div key={h} className="relative" style={{ height: HOUR_PX * 0.75 }}>
                    <span className="absolute -top-1.5 right-1.5 text-[9px] font-medium text-dim">{h < 24 * 60 ? fmtTime12(h).replace(" ", "") : ""}</span>
                  </div>
                ))}
              </div>
              {weekDays.map((d) => (
                <div key={d} className="relative flex-1 border-l border-line" style={{ height: ((DAY_END - DAY_START) / 60) * HOUR_PX * 0.75 }}>
                  {hours.map((h) => (
                    <div key={h} className="border-b border-line/40" style={{ height: HOUR_PX * 0.75 }} />
                  ))}
                  {d === today && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-accent/70" style={{ top: ((nowMin - DAY_START) / 60) * HOUR_PX * 0.75 }} />
                  )}
                  {layoutDay(byDate.get(d) ?? []).map((p) => (
                    <BlockChip key={p.b.id} p={p} onClick={() => setEditBlock(p.b)} compact hourPx={HOUR_PX * 0.75} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------- MONTH ------------------------------ */}
      {view === "month" && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-dim">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((d) => {
              const inMonth = d.slice(5, 7) === cursor.slice(5, 7);
              const dayBlocks = byDate.get(d) ?? [];
              return (
                <button
                  key={d}
                  onClick={() => { setCursor(d); setView("day"); }}
                  className={cn(
                    "min-h-[92px] border-b border-r border-line/60 p-1.5 text-left align-top transition-colors hover:bg-panel2/50 cursor-pointer",
                    !inMonth && "opacity-35",
                    d === today && "bg-accent-soft/40"
                  )}
                >
                  <p className={cn("px-0.5 text-[11px] font-bold", d === today ? "text-accent" : "text-mute")}>{Number(d.slice(8))}</p>
                  <div className="mt-1 space-y-0.5">
                    {dayBlocks.slice(0, 3).map((b) => (
                      <div key={b.id} className={cn("flex items-center gap-1 rounded px-1 py-0.5", b.done && "opacity-50")} style={{ backgroundColor: `${b.color ?? BLOCK_COLORS[b.type]}1a` }}>
                        <span className="size-1 shrink-0 rounded-full" style={{ backgroundColor: b.color ?? BLOCK_COLORS[b.type] }} />
                        <span className="truncate text-[9.5px] font-medium">{b.title}</span>
                      </div>
                    ))}
                    {dayBlocks.length > 3 && <p className="px-1 text-[9px] text-dim">+{dayBlocks.length - 3} more</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Habit quick reference */}
      <Card className="mt-4 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Habits this week</p>
        <div className="flex flex-wrap gap-2">
          {habits.map((h) => (
            <span key={h.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-xs font-medium">
              <span className="size-2 rounded-full" style={{ backgroundColor: h.color }} />
              {h.name}
              <span className="text-[10px] text-dim">{h.streak}d</span>
            </span>
          ))}
        </div>
      </Card>

      {/* ----------------------------- add modal ---------------------------- */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New plan block" sub="Study, gym, meals, rest — anything time-boxed">
        <div className="space-y-4">
          <Field label="Title"><Input autoFocus value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Deep work — Calculus" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={fType} onChange={(e) => setFType(e.target.value)}>
                {BLOCK_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </Field>
            <Field label="Date"><Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} /></Field>
            <Field label="Duration (min)"><Input type="number" min={5} step={5} value={fDur} onChange={(e) => setFDur(e.target.value)} /></Field>
          </div>
          <Button
            className="w-full"
            disabled={!fTitle.trim()}
            onClick={() =>
              run(
                () =>
                  createPlanBlock({
                    date: fDate,
                    startMin: timeToMin(fStart),
                    endMin: Math.min(1440, timeToMin(fStart) + (Number(fDur) || 60)),
                    type: fType as "task" | "study" | "exam" | "gym" | "run" | "meal" | "habit" | "rest" | "other",
                    title: fTitle.trim(),
                    color: BLOCK_COLORS[fType],
                  }),
                { success: "Block added", onSuccess: () => { setAddOpen(false); setFTitle(""); } }
              )
            }
          >
            Add to plan
          </Button>
        </div>
      </Modal>

      {/* ---------------------------- edit modal ----------------------------- */}
      <Modal open={!!editBlock} onClose={() => setEditBlock(null)} title="Plan block" sub={editBlock ? fmtDateLong(editBlock.date) : undefined}>
        {editBlock && <BlockEditor block={editBlock} today={today} onClose={() => setEditBlock(null)} />}
      </Modal>
    </div>
  );
}

function BlockEditor({ block, today, onClose }: { block: PlanBlockDTO; today: string; onClose: () => void }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState(block.title);
  const [date, setDate] = useState(block.date);
  const [start, setStart] = useState(minToTime(block.startMin));
  const [end, setEnd] = useState(minToTime(block.endMin));
  const [actualMin, setActualMin] = useState(block.actualMinutes != null ? String(block.actualMinutes) : "");

  const plannedDur = block.endMin - block.startMin;

  const reschedule = (toDate: string, deltaMin = 0) => {
    run(() => rescheduleBlock(block.id, toDate, block.startMin + deltaMin), {
      success: "Rescheduled",
      onSuccess: onClose,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent" className="capitalize">{block.type}</Badge>
        {block.done && (
          <Badge variant="green">
            <Check className="size-3" />
            Completed
            {block.doneAt ? ` · ${fmtTime12(new Date(block.doneAt).getHours() * 60 + new Date(block.doneAt).getMinutes())}` : ""}
          </Badge>
        )}
        {block.taskId && (
          <Link href="/tasks" onClick={onClose} className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline">
            Linked to a task <ExternalLink className="size-3" />
          </Link>
        )}
      </div>

      {block.reason && (
        <div className="rounded-lg bg-accent-soft/60 px-3 py-2.5 text-xs leading-relaxed text-mute">
          <span className="font-semibold text-fog">Why this block: </span>{block.reason}
        </div>
      )}

      {/* Planned vs actual */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-panel2 p-3 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">Planned</p>
          <p className="mt-0.5 font-medium">{fmtTime12(block.startMin)} – {fmtTime12(block.endMin)} <span className="text-dim">({plannedDur}m)</span></p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">Actual duration</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Input
              type="number" min={0} max={1440}
              placeholder="—"
              value={actualMin}
              onChange={(e) => setActualMin(e.target.value)}
              onBlur={() =>
                run(() => updatePlanBlock(block.id, { actualMinutes: actualMin === "" ? null : Number(actualMin) }), {})
              }
              className="h-7 w-20 px-2 text-xs"
            />
            <span className="text-dim">min</span>
          </div>
        </div>
      </div>

      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Start"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-mute">Quick reschedule</p>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => reschedule(today)}><Clock className="size-3.5" /> Today</Button>
          <Button variant="secondary" size="sm" onClick={() => reschedule(addDays(today, 1))}>Tomorrow</Button>
          <Button variant="secondary" size="sm" onClick={() => reschedule(block.date, -30)}>-30m</Button>
          <Button variant="secondary" size="sm" onClick={() => reschedule(block.date, 30)}>+30m</Button>
          <Button variant="secondary" size="sm" onClick={() => reschedule(block.date, 60)}>+1h</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant={block.done ? "secondary" : "primary"}
          className="flex-1"
          onClick={() => run(() => toggleBlockDone(block.id), { success: block.done ? "Reopened" : "Done · +5 XP", onSuccess: onClose })}
        >
          <Check /> {block.done ? "Reopen" : "Mark done"}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          loading={pending}
          disabled={!title.trim()}
          onClick={() =>
            run(() => updatePlanBlock(block.id, { title: title.trim(), date, startMin: timeToMin(start), endMin: timeToMin(end) }), {
              success: "Block saved",
              onSuccess: onClose,
            })
          }
        >
          Save
        </Button>
        <ConfirmDelete onConfirm={() => run(() => deletePlanBlock(block.id), { success: "Block deleted", onSuccess: onClose })} className="border border-line" />
      </div>
    </div>
  );
}
