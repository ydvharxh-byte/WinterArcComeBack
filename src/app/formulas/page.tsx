import { FormulasClient } from "@/components/formulas-client";
import { getReferences } from "@/server/refs";
import { getStudyTree } from "@/server/study";

export const dynamic = "force-dynamic";

export default async function FormulasPage() {
  const [refs, tree] = await Promise.all([getReferences(), getStudyTree()]);
  return <FormulasClient refs={refs} tree={tree} />;
}
