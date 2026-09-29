import { BacklogClient } from "@/components/backlog-client";
import { getBacklogTree } from "@/server/pcm";

export const dynamic = "force-dynamic";

export default async function BacklogPage() {
  const tree = await getBacklogTree();
  return <BacklogClient tree={tree} />;
}
