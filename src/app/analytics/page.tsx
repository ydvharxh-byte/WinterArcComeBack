import { AnalyticsClient } from "@/components/analytics-client";
import { getStats, getWinterData } from "@/server/meta";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [stats, winter] = await Promise.all([getStats(), getWinterData()]);
  return <AnalyticsClient stats={stats} winter={winter} />;
}
