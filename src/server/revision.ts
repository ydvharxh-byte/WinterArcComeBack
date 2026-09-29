import { db } from "@/db";
import { revisionItems } from "@/db/schema";
import { addDays, todayStr } from "@/lib/dates";
import { eq } from "drizzle-orm";

/**
 * Deterministic spaced-repetition adjuster — the ONLY place intervals change.
 * Poor performance shortens the interval; strong extends it (cap 21d).
 */
export async function adjustRevision(topicId: number, scorePct: number): Promise<void> {
  const today = todayStr();
  const [cur] = await db.select().from(revisionItems).where(eq(revisionItems.topicId, topicId));
  let interval: number, level: number;
  if (!cur) {
    level = scorePct >= 50 ? 1 : 0;
    interval = scorePct >= 85 ? 4 : scorePct >= 50 ? 2 : 1;
  } else {
    if (scorePct >= 85) {
      level = cur.level + 1;
      interval = Math.min(21, Math.round(cur.intervalDays * 2.2));
    } else if (scorePct >= 50) {
      level = cur.level + 1;
      interval = Math.max(1, Math.round(cur.intervalDays * 1.5));
    } else {
      level = 0;
      interval = 1;
    }
  }
  const dueDate = addDays(today, interval);
  if (cur) {
    await db
      .update(revisionItems)
      .set({ intervalDays: interval, dueDate, level, lastScore: Math.round(scorePct), lastRevisedAt: new Date() })
      .where(eq(revisionItems.id, cur.id));
  } else {
    await db.insert(revisionItems).values({
      topicId,
      intervalDays: interval,
      dueDate,
      level,
      lastScore: Math.round(scorePct),
      lastRevisedAt: new Date(),
    }).onConflictDoUpdate({
      target: revisionItems.topicId,
      set: { intervalDays: interval, dueDate, level, lastScore: Math.round(scorePct), lastRevisedAt: new Date() },
    });
  }
}
