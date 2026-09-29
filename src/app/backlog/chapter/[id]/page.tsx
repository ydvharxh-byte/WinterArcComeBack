import { ChapterClient } from "@/components/chapter-client";
import { getChapterOverview } from "@/server/pcm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const overview = await getChapterOverview(Number(id));
  if (!overview) notFound();
  return <ChapterClient c={overview} />;
}
