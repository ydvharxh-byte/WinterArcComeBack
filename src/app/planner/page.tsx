import { PlannerClient } from "@/components/planner-client";
import { addDays, todayStr } from "@/lib/dates";
import { getHabits, getPlanRange } from "@/server/tasks";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const today = todayStr();
  const [blocks, habits] = await Promise.all([
    getPlanRange(addDays(today, -40), addDays(today, 60)),
    getHabits(7),
  ]);
  return <PlannerClient blocks={blocks} habits={habits} today={today} />;
}
