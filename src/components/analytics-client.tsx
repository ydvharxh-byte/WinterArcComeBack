"use client";

import { fmtDateShort } from "@/lib/dates";
import type { getStats, getWinterData } from "@/server/meta";
import { fmtHours, fmtKm, cn } from "@/lib/utils";
import {
  Activity,
  BookOpen,
  Brain,
  Check,
  Crown,
  Dumbbell,
  Flame,
  Footprints,
  GraduationCap,
  ListChecks,
  ListTodo,
  Lock,
  Medal,
  Repeat,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Progress, Stat } from "./ui";

type Stats = Awaited<ReturnType<typeof getStats>>;
type Winter = Awaited<ReturnType<typeof getWinterData>>;

const ACH_ICONS: Record<string, React.ReactNode> = {
  footprints: <Footprints />, check: <Check />, "list-checks": <ListChecks />, "book-open": <BookOpen />,
  brain: <Brain />, "graduation-cap": <GraduationCap />, target: <Target />, dumbbell: <Dumbbell />,
  trophy: <Trophy />, medal: <Medal />, flame: <Flame />, zap: <Zap />, repeat: <Repeat />,
  star: <Star />, crown: <Crown />,
};

const TOOLTIP_STYLE = {
  backgroundColor: "#16233A",
  border: "1px solid #243247",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#F8FAFC",
};

function Chart({ children, empty, height = 220 }: { children: React.ReactNode; empty: boolean; height?: number }) {
  if (empty) return <EmptyState title="No data yet" desc="This chart fills in as you use the app." />;
  return <ResponsiveContainer width="100%" height={height}>{children as React.ReactElement}</ResponsiveContainer>;
}

export function AnalyticsClient({ stats, winter }: { stats: Stats; winter: Winter }) {
  const t = stats.totals;
  const studyData = stats.studyByDay.map((d) => ({ ...d, hours: Math.round((d.minutes / 60) * 100) / 100, label: fmtDateShort(d.date) }));
  const taskData = stats.tasksByDay.map((d) => ({ ...d, label: fmtDateShort(d.date) }));
  const xpData = stats.xpHistory.map((d) => ({ ...d, label: fmtDateShort(d.date) }));
  const taskPie = [
    { name: "Todo", value: t.tasksTodo, color: "#64748B" },
    { name: "In progress", value: t.tasksInProgress, color: "#FBBF24" },
    { name: "Completed", value: t.tasksCompleted, color: "#34D399" },
  ].filter((x) => x.value > 0);

  const unlockedCount = stats.achievements.filter((a) => a.unlocked).length;

  return (
    <div>
      <PageHeader title="Analytics" sub="Every number below comes straight from your database — nothing simulated" />

      {/* Top stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Study time" value={fmtHours(t.studyMinutes)} icon={<BookOpen />} tone="#2563EB" />
        <Stat label="Tasks done" value={t.tasksCompleted} icon={<ListTodo />} tone="#34D399" />
        <Stat label="Workouts" value={t.workouts} icon={<Dumbbell />} tone="#FBBF24" />
        <Stat label="Distance run" value={fmtKm(t.runKm)} icon={<Footprints />} tone="#06B6D4" />
        <Stat label="Best streak" value={`${t.streakMax}d`} icon={<Flame />} tone="#fb923c" />
        <Stat label="Level" value={`${t.level.level}`} sub={`${t.level.totalXp} XP · ${t.level.title}`} icon={<Zap />} tone="#FBBF24" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Study */}
        <Card className="lg:col-span-2">
          <CardHeader title="Study hours · last 14 days" icon={<BookOpen />} sub={t.questions ? `${t.questions} practice questions solved all-time` : undefined} className="pb-3" />
          <div className="px-3 pb-4">
            <Chart empty={studyData.every((d) => d.minutes === 0)}>
              <BarChart data={studyData} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2941" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#243247" }} interval={1} />
                <YAxis tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#16233A" }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}h`, "Study"]} />
                <Bar dataKey="hours" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </Chart>
          </div>
        </Card>

        {/* Tasks */}
        <Card>
          <CardHeader title="Tasks completed · last 14 days" icon={<ListTodo />} className="pb-3" />
          <div className="px-3 pb-4">
            <Chart empty={taskData.every((d) => d.count === 0)}>
              <BarChart data={taskData} margin={{ left: -24, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2941" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#243247" }} interval={2} />
                <YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#16233A" }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Tasks"]} />
                <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </Chart>
          </div>
        </Card>

        {/* Task status donut */}
        <Card>
          <CardHeader title="Task pipeline" icon={<ListChecks />} className="pb-0" />
          <div className="px-3 pb-4">
            <Chart empty={taskPie.length === 0} height={210}>
              <PieChart>
                <Pie data={taskPie} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                  {taskPie.map((p) => <Cell key={p.name} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </Chart>
            <div className="flex justify-center gap-4">
              {taskPie.map((p) => (
                <span key={p.name} className="flex items-center gap-1.5 text-xs text-mute">
                  <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />{p.name} ({p.value})
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* Subjects */}
        <Card>
          <CardHeader title="Subject progress" icon={<GraduationCap />} sub="Done topics and time per subject" className="pb-4" />
          <div className="space-y-3.5 px-5 pb-5">
            {stats.subjectTree.length === 0 && <EmptyState title="No subjects" desc="Create subjects in Study to see progress." />}
            {stats.subjectTree.map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span>
                  <span className="text-xs tabular-nums text-mute">{s.doneTopics}/{s.totalTopics} topics · {fmtHours(s.minutes)}</span>
                </div>
                <Progress value={s.progress} color={s.color} />
              </div>
            ))}
          </div>
        </Card>

        {/* XP */}
        <Card>
          <CardHeader title="XP growth" icon={<Zap />} sub="Cumulative experience over time" className="pb-3" />
          <div className="px-3 pb-4">
            <Chart empty={xpData.length === 0}>
              <AreaChart data={xpData} margin={{ left: -16, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="xpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#FBBF24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2941" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#243247" }} />
                <YAxis tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} XP`, "Total"]} />
                <Area type="monotone" dataKey="cumulative" stroke="#FBBF24" strokeWidth={2} fill="url(#xpGrad)" />
              </AreaChart>
            </Chart>
          </div>
        </Card>

        {/* Workouts */}
        <Card>
          <CardHeader title="Workouts per week" icon={<Dumbbell />} sub="Session count, last 8 weeks" className="pb-3" />
          <div className="px-3 pb-4">
            <Chart empty={stats.workoutsByWeek.every((d) => d.count === 0)}>
              <BarChart data={stats.workoutsByWeek} margin={{ left: -24, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2941" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#243247" }} />
                <YAxis allowDecimals={false} tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#16233A" }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, "Workouts"]} />
                <Bar dataKey="count" fill="#FBBF24" radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </Chart>
          </div>
        </Card>

        {/* Running */}
        <Card>
          <CardHeader title="Running distance per week" icon={<Footprints />} sub="Kilometers, last 8 weeks" className="pb-3" />
          <div className="px-3 pb-4">
            <Chart empty={stats.runByWeek.every((d) => d.km === 0)}>
              <BarChart data={stats.runByWeek} margin={{ left: -24, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2941" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#243247" }} />
                <YAxis tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#16233A" }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} km`, "Distance"]} />
                <Bar dataKey="km" fill="#06B6D4" radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </Chart>
          </div>
        </Card>

        {/* Habits */}
        <Card>
          <CardHeader title="Habit consistency" icon={<Flame />} sub="30-day completion rate and current streak" className="pb-4" />
          <div className="space-y-3.5 px-5 pb-5">
            {stats.habitStats.length === 0 && <EmptyState title="No habits yet" desc="Add habits to start tracking consistency." />}
            {stats.habitStats.map((h) => (
              <div key={h.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><span className="size-2 rounded-full" style={{ backgroundColor: h.color }} />{h.name}</span>
                  <span className="flex items-center gap-2 text-xs text-mute">
                    {h.streak > 0 && <span className="flex items-center gap-0.5 text-orange-400"><Flame className="size-3" />{h.streak}d</span>}
                    <span className="tabular-nums">{h.rate30}%</span>
                  </span>
                </div>
                <Progress value={h.rate30} color={h.color} />
              </div>
            ))}
          </div>
        </Card>

        {/* Exams */}
        <Card>
          <CardHeader title="Exam preparation" icon={<GraduationCap />} className="pb-4" />
          <div className="space-y-3 px-5 pb-5">
            {stats.exams.filter((e) => e.daysRemaining >= 0).length === 0 && <EmptyState title="No upcoming exams" desc="Add exams to track preparation here." />}
            {stats.exams.filter((e) => e.daysRemaining >= 0).map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <Badge variant={e.daysRemaining <= 7 ? "red" : e.daysRemaining <= 21 ? "amber" : "default"} className="w-16 justify-center shrink-0">{e.daysRemaining}d</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="text-[11px] text-dim">{e.doneTopics}/{e.totalTopics} topics ready</p>
                </div>
                <div className="w-28 shrink-0"><Progress value={e.progress} color={e.subjectColor ?? "#2563EB"} /></div>
              </div>
            ))}
          </div>
        </Card>

        {/* Winter Arc */}
        <Card className="lg:col-span-2">
          <CardHeader title="Winter Arc" icon={<Flame />} sub="Daily scores across the season (score ≥ 50 = complete)" className="pb-3" />
          <div className="px-3 pb-4">
            <Chart empty={winter.days.length === 0}>
              <AreaChart data={winter.days.map((d) => ({ label: `Day ${d.day}`, score: d.score }))} margin={{ left: -24, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="arcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1b2941" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#243247" }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748B", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "Score"]} />
                <Area type="monotone" dataKey="score" stroke="#06B6D4" strokeWidth={2} fill="url(#arcGrad)" />
              </AreaChart>
            </Chart>
            {winter.days.length === 0 && (
              <p className="pb-2 text-center text-xs text-dim">
                {winter.snap.status === "pre" ? `Day 1 begins October 1 — in ${winter.snap.daysUntilStart} days.` : ""}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Achievements */}
      <Card className="mt-4">
        <CardHeader
          title="Achievements"
          icon={<Trophy />}
          sub={`${unlockedCount}/${stats.achievements.length} unlocked`}
          className="pb-4"
        />
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-4">
          {stats.achievements.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border p-3.5 transition-colors [&_svg]:size-5",
                a.unlocked ? "border-line bg-panel2" : "border-line/60 bg-ink opacity-45"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={a.unlocked ? "text-amber-400" : "text-dim"}>{ACH_ICONS[a.icon] ?? <Star />}</span>
                {!a.unlocked && <Lock className="!size-3.5 text-dim" />}
              </div>
              <p className="mt-2 text-[13px] font-semibold">{a.name}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-mute">{a.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
