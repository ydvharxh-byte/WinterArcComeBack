// Winter Arc constants & gamification math (shared server/client — pure functions).

export const ARC_START = "2026-10-01";
export const ARC_END = "2027-02-28";
export const ARC_TOTAL_DAYS = 151;

export const PHASES = [
  { month: 10, name: "Foundation", color: "#06B6D4", range: "Oct 1 – Oct 31", days: 31 },
  { month: 11, name: "Build", color: "#2563EB", range: "Nov 1 – Nov 30", days: 30 },
  { month: 12, name: "Discipline", color: "#06B6D4", range: "Dec 1 – Dec 31", days: 31 },
  { month: 1, name: "Grind", color: "#6366F1", range: "Jan 1 – Jan 31", days: 31 },
  { month: 2, name: "Finish", color: "#F8FAFC", range: "Feb 1 – Feb 28", days: 28 },
];

// cumulative XP required to *reach* a level: 100 * L*(L-1)/2  → L2:100, L3:300, L4:600 …
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export const LEVEL_TITLES = [
  "Novice", "Apprentice", "Student", "Scholar", "Grinder",
  "Strategist", "Disciple", "Machine", "Master", "Arc Legend",
];

export interface LevelInfo {
  level: number;
  title: string;
  totalXp: number;
  intoLevel: number;
  needForNext: number;
  pct: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const intoLevel = totalXp - base;
  const needForNext = next - base;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    totalXp,
    intoLevel,
    needForNext,
    pct: Math.round((intoLevel / needForNext) * 100),
  };
}

export interface ArcDay {
  date: string;
  day: number; // 0 if outside arc
  phase: string;
  phaseColor: string;
}

export function phaseForDate(dateStr: string): { name: string; color: string } {
  const m = Number(dateStr.slice(5, 7));
  const p = PHASES.find((ph) => ph.month === m);
  return p ? { name: p.name, color: p.color } : { name: "Off Arc", color: "#64748B" };
}

export interface ArcSnapshot {
  status: "pre" | "active" | "done";
  dayNumber: number; // current arc day (0 when pre, 151 when done after end)
  daysUntilStart: number;
  totalDays: number;
  pctElapsed: number;
  phaseName: string;
  phaseColor: string;
}

export function arcSnapshot(today: string): ArcSnapshot {
  if (today < ARC_START) {
    const d = Math.round((new Date(ARC_START).getTime() - new Date(today).getTime()) / 86400000);
    return { status: "pre", dayNumber: 0, daysUntilStart: d, totalDays: ARC_TOTAL_DAYS, pctElapsed: 0, phaseName: "Pre-Arc", phaseColor: "#94A3B8" };
  }
  if (today > ARC_END) {
    const p = phaseForDate(ARC_END);
    return { status: "done", dayNumber: ARC_TOTAL_DAYS, daysUntilStart: 0, totalDays: ARC_TOTAL_DAYS, pctElapsed: 100, phaseName: p.name, phaseColor: p.color };
  }
  const day = Math.round((new Date(today).getTime() - new Date(ARC_START).getTime()) / 86400000) + 1;
  const p = phaseForDate(today);
  return { status: "active", dayNumber: day, daysUntilStart: 0, totalDays: ARC_TOTAL_DAYS, pctElapsed: Math.round((day / ARC_TOTAL_DAYS) * 100), phaseName: p.name, phaseColor: p.color };
}

/* ------------------------------ Achievements ------------------------------ */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // lucide icon key handled client-side
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-steps", name: "First Steps", desc: "Earn your first XP", icon: "footprints" },
  { id: "task-1", name: "Getting Things Done", desc: "Complete your first task", icon: "check" },
  { id: "task-25", name: "Task Machine", desc: "Complete 25 tasks", icon: "list-checks" },
  { id: "study-1h", name: "Hour In", desc: "Log 60 minutes of study", icon: "book-open" },
  { id: "study-10h", name: "Deep Worker", desc: "Log 10 hours of study", icon: "brain" },
  { id: "study-50h", name: "Scholar Mode", desc: "Log 50 hours of study", icon: "graduation-cap" },
  { id: "questions-100", name: "Question Grinder", desc: "Solve 100 practice questions", icon: "target" },
  { id: "workout-1", name: "First Session", desc: "Log a gym workout", icon: "dumbbell" },
  { id: "workout-20", name: "Gym Regular", desc: "Log 20 workouts", icon: "trophy" },
  { id: "run-10k", name: "On The Road", desc: "Run 10 km total", icon: "footprints" },
  { id: "run-50k", name: "Marathon Mindset", desc: "Run 50 km total", icon: "medal" },
  { id: "streak-7", name: "One Week Strong", desc: "Reach a 7-day streak", icon: "flame" },
  { id: "streak-30", name: "Unstoppable", desc: "Reach a 30-day streak", icon: "zap" },
  { id: "habits-50", name: "Habit Builder", desc: "Check 50 habit logs", icon: "repeat" },
  { id: "level-5", name: "Level 5", desc: "Reach level 5", icon: "star" },
  { id: "level-10", name: "Double Digits", desc: "Reach level 10", icon: "crown" },
];

export interface AchievementStats {
  totalXp: number;
  tasksCompleted: number;
  studyMinutes: number;
  questions: number;
  workouts: number;
  runKm: number;
  maxStreak: number;
  habitChecks: number;
  level: number;
}

export function unlockedAchievements(s: AchievementStats): string[] {
  const out: string[] = [];
  if (s.totalXp > 0) out.push("first-steps");
  if (s.tasksCompleted >= 1) out.push("task-1");
  if (s.tasksCompleted >= 25) out.push("task-25");
  if (s.studyMinutes >= 60) out.push("study-1h");
  if (s.studyMinutes >= 600) out.push("study-10h");
  if (s.studyMinutes >= 3000) out.push("study-50h");
  if (s.questions >= 100) out.push("questions-100");
  if (s.workouts >= 1) out.push("workout-1");
  if (s.workouts >= 20) out.push("workout-20");
  if (s.runKm >= 10) out.push("run-10k");
  if (s.runKm >= 50) out.push("run-50k");
  if (s.maxStreak >= 7) out.push("streak-7");
  if (s.maxStreak >= 30) out.push("streak-30");
  if (s.habitChecks >= 50) out.push("habits-50");
  if (s.level >= 5) out.push("level-5");
  if (s.level >= 10) out.push("level-10");
  return out;
}
