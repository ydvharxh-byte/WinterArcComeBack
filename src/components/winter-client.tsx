"use client";

import { addDays, fmtDateLong, fmtDateShort } from "@/lib/dates";
import { ARC_END, ARC_START, PHASES } from "@/lib/gamification";
import type { getWinterData } from "@/server/meta";
import { setArcNote } from "@/server/meta";
import { fmtHours, cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";
import { BookOpen, Check, Dumbbell, Flame, ListChecks, Snowflake, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Progress, Stat, Textarea } from "./ui";

type WinterData = Awaited<ReturnType<typeof getWinterData>>;

function cellStyle(score: number | null): string {
  if (score === null) return "border border-line/70 bg-transparent";
  if (score >= 50) return "bg-ice";
  if (score >= 20) return "bg-ice/40";
  if (score > 0) return "bg-ice/15";
  return "bg-panel2";
}

export function WinterClient({ data }: { data: WinterData }) {
  const { run } = useAction();
  const { snap, days, arcStreak, doneDays, arcXp, avgScore, today } = data;
  const [note, setNote] = useState(days.find((d) => d.date === today)?.note ?? "");

  const byDate = new Map(days.map((d) => [d.date, d]));
  const todayData = byDate.get(today) ?? null;

  const months = [
    { start: "2026-10-01", end: "2026-10-31", label: "October", phase: PHASES[0] },
    { start: "2026-11-01", end: "2026-11-30", label: "November", phase: PHASES[1] },
    { start: "2026-12-01", end: "2026-12-31", label: "December", phase: PHASES[2] },
    { start: "2027-01-01", end: "2027-01-31", label: "January", phase: PHASES[3] },
    { start: "2027-02-01", end: "2027-02-28", label: "February", phase: PHASES[4] },
  ];

  return (
    <div>
      <PageHeader title="Winter Arc" sub="October 1, 2026 → February 28, 2027 · 151 days · one version of you" />

      {/* Hero */}
      <Card className="mb-4 overflow-hidden">
        <div className="border-b border-line bg-gradient-to-r from-ice/10 via-transparent to-ice/10 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-ice/15 text-ice"><Snowflake className="size-7" /></span>
              <div>
                {snap.status === "pre" ? (
                  <>
                    <p className="font-display text-2xl font-bold tracking-tight">T-minus {snap.daysUntilStart} days</p>
                    <p className="text-sm text-mute">Day 1 lands on Thursday, October 1. Prepare your routine.</p>
                  </>
                ) : snap.status === "done" ? (
                  <>
                    <p className="font-display text-2xl font-bold tracking-tight">Arc complete</p>
                    <p className="text-sm text-mute">151 days. See who you became.</p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-2xl font-bold tracking-tight">Day {snap.dayNumber} <span className="text-mute text-lg font-medium">/ {snap.totalDays}</span></p>
                    <p className="flex items-center gap-2 text-sm text-mute">
                      <Badge className="border-transparent" style={{ backgroundColor: `${snap.phaseColor}22`, color: snap.phaseColor }}>{snap.phaseName}</Badge>
                      phase · {fmtDateShort(today)}
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="w-full max-w-xs">
              <div className="mb-1 flex justify-between text-[11px] font-medium text-mute">
                <span>Season progress</span><span>{snap.pctElapsed}%</span>
              </div>
              <Progress value={snap.pctElapsed} color="#06B6D4" className="h-2" />
              <div className="mt-1 flex justify-between text-[10px] text-dim"><span>Oct 1</span><span>Feb 28</span></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          <Stat label="Arc streak" value={`${arcStreak}d`} icon={<Flame />} tone="#FBBF24" />
          <Stat label="Days completed" value={doneDays} sub={days.length ? `of ${days.length} so far` : "no days yet"} icon={<Check />} tone="#34D399" />
          <Stat label="Avg daily score" value={days.length ? `${avgScore}` : "—"} sub="of 100" icon={<TrendingUp />} tone="#06B6D4" />
          <Stat label="Arc XP" value={arcXp} icon={<Zap />} tone="#FBBF24" />
        </div>
      </Card>

      {/* Phases */}
      <Card className="mb-4 p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">The five phases</p>
        <div className="grid gap-2 sm:grid-cols-5">
          {PHASES.map((p, i) => {
            const start = addDays(ARC_START, PHASES.slice(0, i).reduce((a, x) => a + x.days, 0));
            const end = addDays(start, p.days - 1);
            const isCurrent = today >= start && today <= end;
            const isPast = today > end;
            const elapsed = today < start ? 0 : today > end ? p.days : Math.round((new Date(today).getTime() - new Date(start).getTime()) / 86400000) + 1;
            return (
              <div key={p.name} className={cn("rounded-xl border p-4 transition-colors", isCurrent ? "border-line2 bg-panel2" : "border-line bg-ink")}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold" style={{ color: p.color }}>{p.name}</p>
                  {isCurrent && <Badge variant="ice">Now</Badge>}
                  {isPast && <Check className="size-3.5 text-emerald-400" />}
                </div>
                <p className="mt-1 text-[11px] text-mute">{p.range}</p>
                <Progress value={(elapsed / p.days) * 100} color={p.color} className="mt-3 h-1" />
                <p className="mt-1.5 text-[10px] text-dim">{elapsed}/{p.days} days</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Today / note */}
        <div className="space-y-4">
          <Card className="p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">Today&apos;s score</p>
            {snap.status === "pre" ? (
              <p className="text-sm text-mute">The arc hasn&apos;t started. Scores begin counting on <span className="text-fog font-medium">October 1</span> — every study minute, completed task, workout and habit feeds the daily score.</p>
            ) : !todayData ? (
              <p className="text-sm text-mute">No data today.</p>
            ) : (
              <>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold" style={{ color: todayData.done ? "#06B6D4" : "#F8FAFC" }}>{todayData.score}</span>
                  <span className="text-sm text-mute">/ 100 {todayData.done && <Badge variant="ice" className="ml-1">Day complete</Badge>}</span>
                </div>
                <div className="space-y-2.5">
                  {[
                    { icon: <BookOpen className="size-3.5" />, label: "Study", value: Math.min(40, Math.round((todayData.studyMin / 90) * 40)), max: 40, detail: fmtHours(todayData.studyMin), color: "#2563EB" },
                    { icon: <ListChecks className="size-3.5" />, label: "Tasks", value: Math.min(20, todayData.tasksDone * 10), max: 20, detail: `${todayData.tasksDone} done`, color: "#06B6D4" },
                    { icon: <Dumbbell className="size-3.5" />, label: "Fitness", value: todayData.fitness ? 20 : 0, max: 20, detail: todayData.fitness ? "trained" : "—", color: "#FBBF24" },
                    { icon: <Flame className="size-3.5" />, label: "Habits", value: Math.round(todayData.habitsRatio * 0.2), max: 20, detail: `${todayData.habitsRatio}%`, color: "#FBBF24" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2.5">
                      <span className="text-mute">{r.icon}</span>
                      <span className="w-14 text-xs font-medium text-mute">{r.label}</span>
                      <Progress value={(r.value / r.max) * 100} color={r.color} className="h-1.5 flex-1" />
                      <span className="w-16 text-right text-[11px] tabular-nums text-dim">{r.detail}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 flex items-center justify-between text-[11px] text-dim">
                  <span>Score ≥ 50 marks the day complete</span>
                  <span className="flex items-center gap-1"><Zap className="size-3 text-amber-400" /> {todayData.xp} XP today</span>
                </p>
              </>
            )}
          </Card>

          <Card className="p-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Journal — {fmtDateShort(today)}</p>
            {snap.status === "pre" ? (
              <p className="text-sm text-mute">Daily notes open when the arc starts.</p>
            ) : (
              <>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="One honest line about today…" className="min-h-[90px]" />
                <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => run(() => setArcNote(today, note), { success: "Note saved" })}>
                  Save note
                </Button>
              </>
            )}
          </Card>
        </div>

        {/* Season heatmap */}
        <Card className="p-5">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-mute">Season map — a square per day, colored by score</p>
          <div className="space-y-5">
            {months.map((m) => {
              const nDays = Number(m.end.slice(8));
              return (
                <div key={m.label}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <p className="text-xs font-semibold" style={{ color: m.phase.color }}>{m.label}</p>
                    <p className="text-[10px] text-dim">{m.phase.name} phase</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: nDays }, (_, i) => {
                      const date = `${m.start.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
                      const d = byDate.get(date);
                      const isToday = date === today;
                      return (
                        <div
                          key={date}
                          title={d ? `${fmtDateShort(date)} · Day ${d.day} · score ${d.score}${d.note ? ` — "${d.note}"` : ""}` : `${fmtDateShort(date)} · upcoming`}
                          className={cn("flex h-7 w-[calc(100%/10-4px)] min-w-6 items-center justify-center rounded-md text-[9px] font-medium transition-transform hover:scale-110", cellStyle(d ? d.score : null), d?.score && d.score >= 50 && "text-ink", isToday && "ring-2 ring-fog/70")}
                        >
                          {i + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-[10px] text-mute">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-panel2" /> No activity</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-ice/15" /> 1–19</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-ice/40" /> 20–49</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-ice" /> 50+ (complete)</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-line" /> Upcoming</span>
          </div>
        </Card>
      </div>

      {/* Recent days with notes */}
      {days.some((d) => d.note) && (
        <Card className="mt-4 p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-mute">Journal entries</p>
          <div className="space-y-2">
            {[...days].reverse().filter((d) => d.note).slice(0, 10).map((d) => (
              <div key={d.date} className="flex items-start gap-3 rounded-lg border border-line bg-ink px-3.5 py-2.5">
                <Badge variant="ice" className="mt-0.5 shrink-0">Day {d.day}</Badge>
                <p className="text-sm text-mute">{d.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {days.length === 0 && snap.status === "pre" && (
        <div className="mt-4">
          <EmptyState
            icon={<Snowflake />}
            title="The season map is waiting"
            desc="From October 1, every day gets scored from your real data — study, tasks, fitness and habits. Nothing to fake: show up and the map fills itself."
          />
        </div>
      )}
    </div>
  );
}
