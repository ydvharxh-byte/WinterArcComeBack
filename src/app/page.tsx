import { HomeClient } from "@/components/home-client";
import { getDashboard } from "@/server/meta";
import { getStudyTree } from "@/server/study";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [d, tree] = await Promise.all([getDashboard(), getStudyTree()]);
  return <HomeClient d={d} tree={tree} />;
}
