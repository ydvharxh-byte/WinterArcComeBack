import { WinterClient } from "@/components/winter-client";
import { getWinterData } from "@/server/meta";

export const dynamic = "force-dynamic";

export default async function WinterArcPage() {
  const data = await getWinterData();
  return <WinterClient data={data} />;
}
