import { FitnessClient } from "@/components/fitness-client";
import { todayStr } from "@/lib/dates";
import { getRecovery, getRuns, getWorkouts } from "@/server/fitness";

export const dynamic = "force-dynamic";

export default async function FitnessPage() {
  const [workouts, runs, recovery] = await Promise.all([getWorkouts(40), getRuns(60), getRecovery(14)]);
  return <FitnessClient workouts={workouts} runs={runs} recovery={recovery} today={todayStr()} />;
}
