import { StudyClient } from "@/components/study-client";
import { getBacklog, getRecentSessions, getStudyTree } from "@/server/study";

export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const [tree, sessions, backlog] = await Promise.all([getStudyTree(), getRecentSessions(30), getBacklog()]);
  return <StudyClient tree={tree} sessions={sessions} backlog={backlog} />;
}
