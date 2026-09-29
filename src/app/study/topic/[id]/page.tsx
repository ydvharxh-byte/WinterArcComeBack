import { TopicPageClient } from "@/components/topic-page-client";
import { getLesson } from "@/server/ai/lesson";
import { getTopicDetail } from "@/server/study";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topicId = Number(id);
  const [detail, lesson] = await Promise.all([getTopicDetail(topicId), getLesson(topicId)]);
  if (!detail) notFound();
  return <TopicPageClient d={detail} lesson={lesson} />;
}
