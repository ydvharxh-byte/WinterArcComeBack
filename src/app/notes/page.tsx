import { NotesClient } from "@/components/notes-client";
import { getNotesLibrary } from "@/server/notes";
import { getStudyTree } from "@/server/study";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const [library, tree] = await Promise.all([getNotesLibrary(), getStudyTree()]);
  return <NotesClient documents={library.documents} tree={tree} />;
}
