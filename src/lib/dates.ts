// Date helpers — all app dates are local "YYYY-MM-DD" strings (date-only, no TZ drift).

export function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toStr(new Date());
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

export function daysBetween(a: string, b: string): number {
  // b - a in whole days
  const ms = parseYMD(b).getTime() - parseYMD(a).getTime();
  return Math.round(ms / 86400000);
}

export function startOfWeekMonday(s: string): string {
  const d = parseYMD(s);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
}

export function weekdayShort(s: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parseYMD(s).getDay()];
}

export function monthName(monthIdx: number): string {
  return [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][monthIdx];
}

export function fmtDateLong(s: string): string {
  const d = parseYMD(s);
  return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]}, ${monthName(d.getMonth())} ${d.getDate()}`;
}

export function fmtDateShort(s: string): string {
  const d = parseYMD(s);
  return `${monthName(d.getMonth()).slice(0, 3)} ${d.getDate()}`;
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtTime12(min: number): string {
  if (min >= 24 * 60) return "12 AM";
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function minutesOfNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
