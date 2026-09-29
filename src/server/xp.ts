import { db } from "@/db";
import { xpTransactions } from "@/db/schema";
import { todayStr } from "@/lib/dates";
import { desc, sql } from "drizzle-orm";

/**
 * Award XP for a meaningful completed action.
 * When `key` is provided the award is idempotent — a second call with the
 * same key is a no-op (the actionKey column has a unique index).
 * Returns true when XP was actually inserted.
 */
export async function awardXp(
  amount: number,
  reason: string,
  opts?: { date?: string; key?: string }
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const row = {
    amount: Math.round(amount),
    reason,
    date: opts?.date ?? todayStr(),
    actionKey: opts?.key ?? null,
  };
  if (opts?.key) {
    const inserted = await db
      .insert(xpTransactions)
      .values(row)
      .onConflictDoNothing({ target: xpTransactions.actionKey })
      .returning({ id: xpTransactions.id });
    return inserted.length > 0;
  }
  await db.insert(xpTransactions).values(row);
  return true;
}

export async function totalXp(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)` })
    .from(xpTransactions);
  return Number(row?.total ?? 0);
}

/**
 * Streak of consecutive active days (days with any XP earned).
 * Today counts if active, otherwise the streak ending yesterday counts.
 */
export async function activityStreak(): Promise<{ current: number; max: number }> {
  const rows = await db
    .selectDistinct({ date: xpTransactions.date })
    .from(xpTransactions)
    .orderBy(desc(xpTransactions.date));
  const days = new Set(rows.map((r) => r.date));
  if (days.size === 0) return { current: 0, max: 0 };

  const toNext = (s: string, n: number) => {
    const d = new Date(`${s}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const today = todayStr();
  let cursor = days.has(today) ? today : toNext(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = toNext(cursor, -1);
  }

  const sorted = [...days].sort();
  let max = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (toNext(sorted[i - 1], 1) === sorted[i]) {
      run++;
      max = Math.max(max, run);
    } else {
      run = 1;
    }
  }
  return { current, max };
}
