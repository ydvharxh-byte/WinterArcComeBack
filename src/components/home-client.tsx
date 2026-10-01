"use client";

import { QuickActions } from "@/components/quick-actions";
import { HabitForm } from "@/components/forms";
import { Modal } from "@/components/modal";
import { fmtDateLong, fmtTime12, minutesOfNow, addDays, fmtDateShort } from "@/lib/dates";
import { fmtHours, BLOCK_COLORS, cn } from "@/lib/utils";
import type { getDashboard } from "@/server/meta";
import type { SubjectDTO } from "@/lib/types";
import { deleteHabit, setTaskStatus, toggleBlockDone, toggleHabit } from "@/server/tasks";
import { useAction } from "@/lib/use-action";
import {
  ArrowRight,
  BedDouble,
  BookOpen,
  CalendarDays,
  Check,
  Dumbbell,
  Flame,
  Footprints,
  GraduationCap,
  ListTodo,
  Moon,
  Plus,
  CalendarRange,
  RefreshCw,
  Snowflake,
  Target,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, ConfirmDelete, EmptyState, Progress, Ring } from "./ui";

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function SectionLabel({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{children}</p>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs font-medium text-mute transition-colors hover:text-fog">
          Open <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

export function HomeClient({ d, tree }: { d: DashboardData; tree: SubjectDTO[] }) {
  const { run } = useAction();
  const [habitOverrides, setHabitOverrides] = useState<Record<number, boolean>>({});
  const [habitModal, setHabitModal] = useState(false);
  const nowMin = minutesOfNow();

  const doneItems = d.blocks.filter((b) => b.done).length;
  const studyPct = Math.min(100, Math.round((d.studyTodayMin / d.settings.studyTargetMin) * 100));
  const maxStudy = Math.max(60, ...d.study7d.map((x) => x.minutes));

  const onToggleHabit = (habitId: number, current: boolean) => {
    setHabitOverrides((o) => ({ ...o, [habitId]: !current }));
    run(() => toggleHabit(habitId, d.today), {});
  };

  const habitsDone = d.habits.filter((h) => habitOverrides[h.id] ?? h.doneToday).length;

  return (
    <div className="space-y-8">
      {/* 1 — Greeting / date / today completion */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-mute">
            <CalendarDays className="size-3.5" />
            {fmtDateLong(d.today)}
            {d.arc.status === "active" && (
              <Badge variant="ice" className="ml-1"><Snowflake className="size-3" /> Arc day {d.arc.dayNumber}</Badge>
            )}
            {d.arc.status === "pre" && (
              <Badge variant="default" className="ml-1"><Snowflake className="size-3" /> Arc starts Oct 1</Badge>
            )}
          </div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">
            {greeting()}, {d.settings.name}
          </h1>
          <p className="mt-1 flex items-center gap-3 text-sm text-mute">
            <span className="flex items-center gap-1"><Flame className="size-3.5 text-orange-400" /> {d.streak} day streak</span>
            <span className="flex items-center gap-1"><Zap className="size-3.5 text-warning" /> Lv {d.level.level} · {d.level.totalXp} XP</span>
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Ring value={d.completion} size={88} stroke={7}>
            <div className="text-center">
              <p className="font-display text-xl font-bold leading-none">{d.completion}%</p>
              <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-dim">today</p>
            </div>
          </Ring>
          <div className="hidden text-xs leading-relaxed text-mute sm:block">
            <p><span className="font-semibold text-fog">{doneItems}</span> of {d.blocks.length} blocks done</p>
            <p><span className="font-semibold text-fog">{habitsDone}</span> of {d.habits.length} habits</p>
            <p><span className="font-semibold text-fog">{fmtHours(d.studyTodayMin)}</span> studied</p>
          </div>
        </div>
      </div>

      {/* 2 — Winter Arc */}
      <section>
        <Link href="/winter-arc" className="group block">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-panel px-5 py-4 transition-colors hover:bg-panel2">
            <span className="flex items-center gap-2 text-sm font-semibold"><Snowflake className="size-4 text-ice" /> Winter Arc</span>
            {d.arc.status === "pre" ? (
              <p className="text-sm text-mute">
                <span className="font-display font-bold text-fog">T-{d.arc.daysUntilStart}</span> · 151 days, Oct 1 → Feb 28 · build the routine now
              </p>
            ) : (
              <p className="text-sm text-mute">
                <span className="font-display font-bold text-fog">Day {d.arc.dayNumber}<span className="font-medium text-mute">/{d.arc.totalDays}</span></span>
                <span className="mx-2 text-dim">·</span>{d.arc.phaseName} phase
              </p>
            )}
            <div className="flex min-w-44 flex-1 items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/70">
                <div className="h-full rounded-full bg-ice transition-all duration-700" style={{ width: `${d.arc.pctElapsed}%` }} />
              </div>
              <span className="text-[11px] font-medium tabular-nums text-mute">{d.arc.pctElapsed}%</span>
              <ArrowRight className="size-3.5 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ice" />
            </div>
          </div>
        </Link>
      </section>

      {/* PCM progress — the academic core */}
      {d.pcm.length > 0 && (
        <section>
          <SectionLabel href="/backlog">PCM progress</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            {d.pcm.map((s) => {
              const totalT = s.chapters.reduce((a, c) => a + c.totalTopics, 0);
              const doneT = s.chapters.reduce((a, c) => a + c.doneTopics, 0);
              const pct = totalT ? Math.round((doneT / totalT) * 100) : 0;
              return (
                <Link key={s.id} href="/backlog" className="rounded-xl border border-line bg-panel p-4 card-hover">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}
                    </span>
                    <span className="font-display text-sm font-bold tabular-nums">{pct}%</span>
                  </div>
                  <Progress value={pct} color={s.color} className="mt-2.5" />
                  <p className="mt-2 text-[11px] text-dim">
                    {doneT}/{totalT} topics · {s.pendingChapters} chapters pending · ~{fmtHours(s.totalRemainingMin)} left
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Autumn break recovery window */}
      {d.breakWindow && (d.breakWindow.active || (d.breakWindow.daysUntil > 0 && d.breakWindow.daysUntil <= 30)) && (
        <Link href="/planner" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-panel px-5 py-3.5 card-hover">
          <CalendarRange className="size-4 text-ice" />
          <p className="text-sm">
            <strong>Autumn break · PCM recovery</strong>
            <span className="text-mute"> · 15–25 Oct · {d.breakWindow.active ? "active now" : `starts in ${d.breakWindow.daysUntil} days`}</span>
          </p>
          <span className="ml-auto text-xs font-medium text-accent">Build recovery plan →</span>
        </Link>
      )}

      {/* Next best action — from the planner engine over real academic state */}
      {d.nextAction && (
        <section>
          <Link href={d.nextAction.href} className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-panel px-5 py-3.5 transition-colors hover:bg-panel2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Target className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{d.nextAction.label}</p>
              <p className="truncate text-xs text-mute">{d.nextAction.detail}</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              Start now <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </section>
      )}

      {/* Quick actions */}
      <QuickActions tree={tree} />

      {/* 3 + 4 — Schedule & priorities */}
      <div className="grid gap-8 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <SectionLabel href="/planner">Today&apos;s schedule</SectionLabel>
          {d.blocks.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="Nothing planned today"
              desc="Build your day in the planner — study, gym, meals and rest on one timeline."
              action={<Link href="/planner"><Button size="sm" variant="secondary"><CalendarDays /> Plan today</Button></Link>}
            />
          ) : (
            <div className="space-y-0.5">
              {d.blocks.map((b) => {
                const isNow = nowMin >= b.startMin && nowMin < b.endMin;
                const color = b.color ?? BLOCK_COLORS[b.type] ?? BLOCK_COLORS.other;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-panel",
                      b.done && "opacity-50"
                    )}
                  >
                    <button
                      onClick={() => run(() => toggleBlockDone(b.id), { success: b.done ? undefined : "Done · +5 XP" })}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border transition-all cursor-pointer",
                        b.done ? "border-transparent" : "border-line2 hover:border-accent"
                      )}
                      style={b.done ? { backgroundColor: color } : {}}
                      aria-label="Toggle done"
                    >
                      {b.done && <Check className="size-3.5 text-ink" strokeWidth={3} />}
                    </button>
                    <span className="w-[104px] shrink-0 text-[11px] font-medium tabular-nums text-dim">
                      {fmtTime12(b.startMin)} – {fmtTime12(b.endMin)}
                    </span>
                    <span className="h-4 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", b.done && "text-mute line-through")}>
                      {b.title}
                    </span>
                    {isNow && !b.done && <Badge variant="accent">Now</Badge>}
                    <span className="hidden text-[10px] font-medium uppercase tracking-wider text-dim sm:block">{b.type}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="xl:col-span-2">
          <SectionLabel href="/tasks">Today&apos;s priorities</SectionLabel>
          {d.priorityTasks.length === 0 ? (
            <EmptyState
              icon={<ListTodo />}
              title="No open tasks"
              desc="Capture the next thing you need to finish."
              action={<Link href="/tasks"><Button size="sm" variant="secondary"><Plus /> Add a task</Button></Link>}
            />
          ) : (
            <div className="space-y-0.5">
              {d.priorityTasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-panel">
                  <button
                    onClick={() => run(() => setTaskStatus(t.id, "completed"), { success: "Task completed" })}
                    className="flex size-5 shrink-0 items-center justify-center rounded-md border border-line2 transition-colors hover:border-success cursor-pointer"
                    aria-label="Complete task"
                  >
                    <Check className="size-3.5 text-transparent transition-colors hover:text-success" />
                  </button>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.priority === "high" ? "#F87171" : t.priority === "medium" ? "#FBBF24" : "#34D399" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-[11px] text-dim">
                      {t.subjectName ?? "General"}
                      {t.estimatedMinutes ? ` · ~${t.estimatedMinutes}m` : ""}
                    </p>
                  </div>
                  {t.dueDate && (
                    <Badge variant={t.dueDate < d.today ? "red" : t.dueDate === d.today ? "amber" : "default"} className="shrink-0">
                      {t.dueDate === d.today ? "Today" : t.dueDate === addDays(d.today, 1) ? "Tmrw" : fmtDateShort(t.dueDate)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 5 + 6 + 7 — Study, fitness, habits */}
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        <section>
          <SectionLabel href="/study">Study progress</SectionLabel>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold">{fmtHours(d.studyTodayMin)}</span>
              <span className="text-xs text-mute">of {fmtHours(d.settings.studyTargetMin)} daily target</span>
            </div>
            <Progress value={studyPct} className="mt-2.5" />
            <div className="mt-5 flex h-16 items-end gap-1.5">
              {d.study7d.map((x) => (
                <div key={x.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn("w-full rounded-sm", x.date === d.today ? "bg-accent" : "bg-line2")}
                    style={{ height: `${Math.max(4, (x.minutes / maxStudy) * 100)}%` }}
                    title={`${fmtHours(x.minutes)}`}
                  />
                  <span className={cn("text-[9px] font-medium", x.date === d.today ? "text-accent" : "text-dim")}>
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(`${x.date}T00:00:00`).getDay()]}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-mute">{fmtHours(d.studyWeekMin)} this week</p>
          </div>
        </section>

        <section>
          <SectionLabel href="/fitness">Fitness</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-panel p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-dim"><Dumbbell className="size-3" /> Workouts</p>
              <p className="font-display mt-1 text-xl font-bold">{d.workoutsThisWeek}<span className="text-xs font-medium text-mute"> /wk</span></p>
            </div>
            <div className="rounded-lg bg-panel p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-dim"><Footprints className="size-3" /> Running</p>
              <p className="font-display mt-1 text-xl font-bold">{d.runsThisWeekKm}<span className="text-xs font-medium text-mute"> km /wk</span></p>
            </div>
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between rounded-lg bg-panel px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-mute"><BedDouble className="size-4" /> Last night</span>
              <span className="font-semibold">
                {d.review?.sleepHours ? `${d.review.sleepHours}h` : "—"}
                {d.review?.energy ? <span className="ml-1.5 text-xs font-medium text-mute">· {d.review.energy}/10</span> : null}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-panel px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-mute"><Moon className="size-4" /> Last workout</span>
              <span className="truncate pl-2 font-semibold">{d.lastWorkout ? `${d.lastWorkout.name} · ${fmtDateShort(d.lastWorkout.date)}` : "None yet"}</span>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Habits today</SectionLabel>
          {d.habits.length === 0 ? (
            <button
              onClick={() => setHabitModal(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-8 text-sm font-medium text-mute transition-colors hover:border-line2 hover:text-fog cursor-pointer"
            >
              <Plus className="size-4" /> Add your first habit
            </button>
          ) : (
            <div className="space-y-0.5">
              {d.habits.map((h) => {
                const done = habitOverrides[h.id] ?? h.doneToday;
                return (
                  <div key={h.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-panel">
                    <button
                      onClick={() => onToggleHabit(h.id, done)}
                      className="flex flex-1 items-center gap-3 text-left cursor-pointer"
                    >
                      <span
                        className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border transition-all", done ? "border-transparent" : "border-line2")}
                        style={done ? { backgroundColor: h.color } : {}}
                      >
                        {done && <Check className="size-3.5 text-ink" strokeWidth={3} />}
                      </span>
                      <span className={cn("text-sm font-medium", done && "text-mute line-through")}>{h.name}</span>
                      {done && <span className="text-[10px] font-semibold text-success">+5</span>}
                    </button>
                    <ConfirmDelete
                      className="opacity-0 group-hover:opacity-100"
                      onConfirm={() => run(() => deleteHabit(h.id), { success: "Habit deleted" })}
                    />
                  </div>
                );
              })}
              <button
                onClick={() => setHabitModal(true)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-dim transition-colors hover:bg-panel hover:text-fog cursor-pointer"
              >
                <Plus className="size-3.5" /> Add habit
              </button>
            </div>
          )}
        </section>
      </div>

      {/* 8 — Upcoming exams */}
      <section>
        <SectionLabel href="/exams">Upcoming exams</SectionLabel>
        {d.exams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-5 py-6 text-center">
            <p className="text-sm text-mute">No upcoming exams.</p>
            <Link href="/exams" className="text-sm font-medium text-accent hover:underline">Add your first exam →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {d.exams.map((e) => (
              <div key={e.id} className="flex items-center gap-4">
                <Badge variant={e.daysRemaining <= 7 ? "red" : e.daysRemaining <= 21 ? "amber" : "default"} className="w-16 shrink-0 justify-center">
                  {e.daysRemaining}d left
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="text-xs text-mute">{e.subjectName ?? "General"} · {fmtDateLong(e.date)}</p>
                </div>
                <div className="w-28 shrink-0 sm:w-40">
                  <div className="mb-1 flex justify-between text-[10px] text-dim"><span>Prep</span><span>{e.progress}%</span></div>
                  <Progress value={e.progress} color={e.subjectColor ?? "#2563EB"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Revision due + weak topics */}
      {(d.revisionDueCount > 0 || d.weakTopics.length > 0) && (
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <SectionLabel href="/tutor?mode=practice">Revision due</SectionLabel>
            {d.revisionDueCount === 0 ? (
              <p className="text-sm text-mute">Nothing due — spaced repetition is on track.</p>
            ) : (
              <Link href="/tutor?mode=practice" className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-4 card-hover">
                <RefreshCw className="size-4 text-ice" />
                <p className="text-sm"><strong className="font-display text-lg">{d.revisionDueCount}</strong> <span className="text-mute">topic{d.revisionDueCount === 1 ? "" : "s"} ready for recall practice</span></p>
              </Link>
            )}
          </section>
          <section>
            <SectionLabel href="/mistakes">Weak topics</SectionLabel>
            {d.weakTopics.length === 0 ? (
              <p className="text-sm text-mute">No weak topics with evidence yet.</p>
            ) : (
              <div className="space-y-1">
                {d.weakTopics.map((w) => (
                  <Link key={w.id} href={`/study/topic/${w.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-panel">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: w.subjectColor }} />
                    <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
                    <span className="text-xs font-semibold tabular-nums text-warning">{w.mastery.score}/100</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 9 — Analytics snapshot */}
      <section className="border-t border-line pt-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">The bigger picture</p>
          <span className="hidden h-3 w-px bg-line sm:block" />
          <span className="flex items-center gap-1.5 text-xs text-mute"><BookOpen className="size-3.5 text-dim" /> {fmtHours(d.studyWeekMin)} studied this week</span>
          <span className="flex items-center gap-1.5 text-xs text-mute"><Dumbbell className="size-3.5 text-dim" /> {d.workoutsThisWeek} workouts</span>
          <span className="flex items-center gap-1.5 text-xs text-mute"><Footprints className="size-3.5 text-dim" /> {d.runsThisWeekKm} km</span>
          <span className="flex items-center gap-1.5 text-xs text-mute"><Zap className="size-3.5 text-warning" /> {d.level.intoLevel}/{d.level.needForNext} XP to Lv {d.level.level + 1}</span>
          <Link href="/analytics" className="ml-auto flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            Full analytics <ArrowRight className="size-3" />
          </Link>
        </div>
      </section>

      <Modal open={habitModal} onClose={() => setHabitModal(false)} title="New habit" sub="+5 XP every day you check it">
        <HabitForm onDone={() => setHabitModal(false)} />
      </Modal>
    </div>
  );
}
