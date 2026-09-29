import { SettingsClient } from "@/components/settings-client";
import { getSettings, getShellData } from "@/server/meta";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, shell] = await Promise.all([getSettings(), getShellData()]);
  return <SettingsClient settings={settings} shell={shell} />;
}
