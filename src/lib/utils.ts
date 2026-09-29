import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function fmtHours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtKm(km: number | null | undefined): string {
  if (!km) return "0 km";
  return `${Math.round(km * 100) / 100} km`;
}

export function fmtPace(distanceKm: number | null, durationMin: number | null): string {
  if (!distanceKm || !durationMin || distanceKm <= 0) return "—";
  const pace = durationMin / distanceKm;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export const PRIORITY_COLORS: Record<string, string> = {
  high: "#F87171",
  medium: "#FBBF24",
  low: "#34D399",
};

export const BLOCK_COLORS: Record<string, string> = {
  task: "#2563EB",
  study: "#06B6D4",
  exam: "#F87171",
  gym: "#FBBF24",
  run: "#34D399",
  meal: "#34D399",
  habit: "#6366F1",
  rest: "#475569",
  other: "#94A3B8",
};

export const BLOCK_TYPES = ["task", "study", "exam", "gym", "run", "meal", "habit", "rest", "other"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const SUBJECT_COLORS = [
  "#2563EB",
  "#06B6D4",
  "#6366F1",
  "#34D399",
  "#FBBF24",
  "#F87171",
  "#94A3B8",
];

export const ACCENTS = [
  { id: "#2563EB", name: "Blue" },
  { id: "#06B6D4", name: "Cyan" },
  { id: "#6366F1", name: "Indigo" },
];
