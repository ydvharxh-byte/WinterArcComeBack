import { MistakesClient } from "@/components/mistakes-client";
import { getErrorLog } from "@/server/tutor";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const errors = await getErrorLog();
  return <MistakesClient errors={errors} />;
}
