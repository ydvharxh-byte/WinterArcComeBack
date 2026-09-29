import { ExamsClient } from "@/components/exams-client";
import { getExams, getStudyTree } from "@/server/study";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const [exams, tree] = await Promise.all([getExams(), getStudyTree()]);
  return <ExamsClient exams={exams} tree={tree} />;
}
