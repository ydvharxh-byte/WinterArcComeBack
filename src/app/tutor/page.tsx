import { TutorClient } from "@/components/tutor-client";
import { aiStatus, getErrorLog, getTutorSessions } from "@/server/tutor";
import { getRevisionDue } from "@/server/engine";
import { getStudyTree } from "@/server/study";

export const dynamic = "force-dynamic";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; topic?: string }>;
}) {
  const { mode, topic } = await searchParams;
  const [sessions, tree, errorLog, revisionDue, status] = await Promise.all([
    getTutorSessions(),
    getStudyTree(),
    getErrorLog(),
    getRevisionDue(),
    Promise.resolve(aiStatus()),
  ]);
  return (
    <TutorClient
      sessions={sessions}
      tree={tree}
      errorLog={errorLog}
      revisionDue={revisionDue}
      configured={status.configured}
      modelName={status.model}
      baseUrl={status.baseUrl}
      initialMode={["chat", "teach", "practice", "examine", "plan"].includes(mode ?? "") ? mode! : "chat"}
      initialTopicId={topic ? Number(topic) : null}
    />
  );
}
