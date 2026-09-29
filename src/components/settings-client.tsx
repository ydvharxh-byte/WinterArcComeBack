"use client";

import { AiSettingsCard } from "@/components/ai-settings-card";
import type { SettingsDTO, ShellData } from "@/lib/types";
import { ACCENTS, cn } from "@/lib/utils";
import { clearAllData, loadSampleData, updateSettings } from "@/server/meta";
import { useAction } from "@/lib/use-action";
import { AlertTriangle, Check, Database, FlaskConical, Flame, GraduationCap, Palette, RotateCcw, Snowflake, Target, User, Zap } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "./ui";

export function SettingsClient({ settings, shell }: { settings: SettingsDTO; shell: ShellData }) {
  const { run } = useAction();
  const [name, setName] = useState(settings.name);
  const [accent, setAccent] = useState(settings.accent);
  const [studyTarget, setStudyTarget] = useState(String(settings.studyTargetMin));
  const [classLevel, setClassLevel] = useState<number | null>(settings.classLevel);
  const [board, setBoard] = useState<string | null>(settings.board);
  const [armClear, setArmClear] = useState(false);
  const [armSample, setArmSample] = useState(false);

  return (
    <div>
      <PageHeader title="Settings" sub="Personalize Study OS — changes apply instantly" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader title="Profile" icon={<User />} className="pb-4" />
          <div className="space-y-4 px-5 pb-5">
            <Field label="Display name" hint="Used in your dashboard greeting">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </Field>
            <Button
              size="sm"
              disabled={!name.trim() || name === settings.name}
              onClick={() => run(() => updateSettings({ name: name.trim() }), { success: "Name saved" })}
            >
              Save name
            </Button>
          </div>
        </Card>

        {/* Theme */}
        <Card>
          <CardHeader title="Accent" icon={<Palette />} className="pb-4" />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-3 transition-all cursor-pointer",
                    accent === a.id ? "border-line2 bg-panel2" : "border-line hover:border-line2"
                  )}
                >
                  <span className="size-5 rounded-full" style={{ backgroundColor: a.id }} />
                  <span className="text-sm font-medium">{a.name}</span>
                  {accent === a.id && <Check className="size-4" style={{ color: a.id }} />}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              disabled={accent === settings.accent}
              onClick={() => run(() => updateSettings({ accent }), { success: "Accent updated" })}
            >
              Apply accent
            </Button>
          </div>
        </Card>

        {/* Study target */}
        <Card>
          <CardHeader title="Daily study target" icon={<Target />} className="pb-4" />
          <div className="space-y-4 px-5 pb-5">
            <Field label="Minutes per day" hint="Shown as a soft guide on the dashboard">
              <Input type="number" min={15} max={960} value={studyTarget} onChange={(e) => setStudyTarget(e.target.value)} />
            </Field>
            <Button
              size="sm"
              onClick={() => run(() => updateSettings({ studyTargetMin: Number(studyTarget) || 180 }), { success: "Target saved" })}
            >
              Save target
            </Button>
          </div>
        </Card>

        {/* AI provider */}
        <AiSettingsCard />

        {/* Academic profile */}
        <Card>
          <CardHeader title="Academic profile" icon={<GraduationCap />} className="pb-4" sub="The tutor uses this to match your board and level — it never guesses" />
          <div className="space-y-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Class">
                <Select value={classLevel ?? ""} onChange={(e) => setClassLevel(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Unknown</option>
                  {[9, 10, 11, 12].map((c) => <option key={c} value={c}>Class {c}</option>)}
                </Select>
              </Field>
              <Field label="Board">
                <Select value={board ?? ""} onChange={(e) => setBoard(e.target.value || null)}>
                  <option value="">Unknown</option>
                  <option value="CBSE">CBSE</option>
                  <option value="ICSE">ICSE</option>
                  <option value="State Board">State Board</option>
                </Select>
              </Field>
            </div>
            <Button
              size="sm"
              onClick={() => run(() => updateSettings({ classLevel, board }), { success: "Profile saved — the tutor will teach to your level" })}
            >
              Save profile
            </Button>
          </div>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader title="Your status" icon={<Zap />} className="pb-4" />
          <div className="grid grid-cols-3 gap-3 px-5 pb-5">
            <div className="rounded-xl bg-panel2 p-4 text-center">
              <Zap className="mx-auto size-4 text-warning" />
              <p className="font-display mt-1.5 text-xl font-bold">Lv {shell.level.level}</p>
              <p className="text-[10px] uppercase tracking-wider text-dim">{shell.level.title} · {shell.level.totalXp} XP</p>
            </div>
            <div className="rounded-xl bg-panel2 p-4 text-center">
              <Flame className="mx-auto size-4 text-orange-400" />
              <p className="font-display mt-1.5 text-xl font-bold">{shell.streak}d</p>
              <p className="text-[10px] uppercase tracking-wider text-dim">Active streak</p>
            </div>
            <div className="rounded-xl bg-panel2 p-4 text-center">
              <Snowflake className="mx-auto size-4 text-ice" />
              <p className="font-display mt-1.5 text-xl font-bold">
                {shell.arc.status === "pre" ? `T-${shell.arc.daysUntilStart}` : `Day ${shell.arc.dayNumber}`}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-dim">Winter Arc</p>
            </div>
          </div>
          <div className="px-5 pb-2 text-xs text-mute">
            Study OS v1 · Next.js · PostgreSQL · <Badge variant="accent">Single user</Badge>
          </div>
        </Card>

        {/* Data */}
        <Card className="lg:col-span-2">
          <CardHeader title="Data" icon={<Database />} sub="Everything lives in your PostgreSQL database — refresh-proof by design" className="pb-4" />
          <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-sm text-mute">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>Clear removes <span className="text-fog">everything</span>. Sample data is a development helper.</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!armSample) {
                    setArmSample(true);
                    setTimeout(() => setArmSample(false), 4000);
                  } else {
                    setArmSample(false);
                    run(() => loadSampleData(), { success: "Sample workspace loaded" });
                  }
                }}
              >
                <FlaskConical /> {armSample ? "Confirm load (replaces all)" : "Load sample data (dev)"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (!armClear) {
                    setArmClear(true);
                    setTimeout(() => setArmClear(false), 4000);
                  } else {
                    setArmClear(false);
                    run(() => clearAllData(), { success: "All data cleared" });
                  }
                }}
              >
                <RotateCcw /> {armClear ? "Click again to confirm" : "Clear all data"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
