import { NutritionClient } from "@/components/nutrition-client";
import { todayStr } from "@/lib/dates";
import { getMeals } from "@/server/fitness";
import { getSettings } from "@/server/meta";

export const dynamic = "force-dynamic";

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr();
  const [meals, settings] = await Promise.all([getMeals(d), getSettings()]);
  return <NutritionClient meals={meals} date={d} settings={settings} />;
}
