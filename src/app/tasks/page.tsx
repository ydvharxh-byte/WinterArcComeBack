import { TasksClient } from "@/components/tasks-client";
import { getStudyTree } from "@/server/study";
import { getTasks } from "@/server/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, tree] = await Promise.all([getTasks(), getStudyTree()]);
  return <TasksClient tasks={tasks} tree={tree} />;
}
