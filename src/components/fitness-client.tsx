"use client";

import { RunForm, WorkoutForm } from "@/components/forms";
import { Modal } from "@/components/modal";
import { fmtDateShort } from "@/lib/dates";
import type { ReviewDTO, RunDTO, WorkoutDTO } from "@/lib/types";
import { fmtKm, fmtPace, cn } from "@/lib/utils";
import {
  addExercise,
  addSet,
  deleteExercise,
  deleteRun,
  deleteSet,
  deleteWorkout,
  updateWorkout,
  upsertReview,
} from "@/server/fitness";
import { useAction } from "@/lib/use-action";
import {
  Activity,
  BedDouble,
  Dumbbell,
  Footprints,
  HeartPulse,
  Plus,
  Trophy,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  Badge, Button, Card, CardHeader, ConfirmDelete, EmptyState, Field, Input,
  PageHeader, Stat, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from "./ui";

function Effort({ n }: { n: number | null }) {
  if (!n) return <span className="text-xs text-dim">—</span>;
  return (
    <span className="flex items-center gap-0.5" title={`Effort ${n}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn("h-2.5 w-1 rounded-full", i < n ? "bg-cyan" : "bg-line")} />
      ))}
    </span>
  );
}

export function FitnessClient({ workouts, runs, recovery, today }: { workouts: WorkoutDTO[]; runs: RunDTO[]; recovery: ReviewDTO[]; today: string }) {
  const { run } = useAction();
  const [workoutModal, setWorkoutModal] = useState(false);
  const [runModal, setRunModal] = useState(false);
  const [newEx, setNewEx] = useState<Record<number, string>>({});
  const [setDraft, setSetDraft] = useState<Record<number, { reps: string; weight: string }>>({});

  const prCount = workouts.reduce((a, w) => a + w.exercises.reduce((x, e) => x + e.sets.filter((s) => s.isPR).length, 0), 0);
  const totalVolume = workouts.reduce((a, w) => a + w.volume, 0);
  const totalKm = Math.round(runs.reduce((a, r) => a + (r.type === "run" ? r.distanceKm ?? 0 : 0), 0) * 10) / 10;
  const runCount = runs.filter((r) => r.type === "run").length;
  const withPace = runs.filter((r) => r.type === "run" && r.distanceKm && r.durationMin);
  const bestPace = withPace.length
    ? Math.min(...withPace.map((r) => (r.durationMin ?? 0) / (r.distanceKm ?? 1)))
    : null;

  const todayReview = recovery.find((r) => r.date === today) ?? null;
  const pastRecovery = [...recovery].reverse();

  return (
    <div>
      <PageHeader
        title="Fitness"
        sub="Gym, running and recovery — training feeds your Winter Arc score"
        actions={
          <>
            <Button size="sm" onClick={() => setRunModal(true)} variant="secondary"><Footprints /> Log run</Button>
            <Button size="sm" onClick={() => setWorkoutModal(true)}><Plus /> Log workout</Button>
          </>
        }
      />

      <Tabs defaultValue="gym">
        <TabsList className="mb-4">
          <TabsTrigger value="gym"><span className="flex items-center gap-1.5"><Dumbbell className="size-3.5" /> Gym</span></TabsTrigger>
          <TabsTrigger value="running"><span className="flex items-center gap-1.5"><Footprints className="size-3.5" /> Running</span></TabsTrigger>
          <TabsTrigger value="recovery"><span className="flex items-center gap-1.5"><HeartPulse className="size-3.5" /> Recovery</span></TabsTrigger>
        </TabsList>

        {/* --------------------------------- GYM --------------------------------- */}
        <TabsContent value="gym">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Sessions" value={workouts.length} icon={<Dumbbell />} tone="#FBBF24" />
            <Stat label="Volume lifted" value={`${(totalVolume / 1000).toFixed(1)}t`} icon={<Activity />} tone="#FBBF24" />
            <Stat label="PR sets" value={prCount} icon={<Trophy />} tone="#FBBF24" />
          </div>

          {workouts.length === 0 ? (
            <EmptyState
              icon={<Dumbbell />}
              title="No workouts yet"
              desc="Log your first session — add exercises and sets as you go."
              action={<Button size="sm" onClick={() => setWorkoutModal(true)}><Plus /> Log workout</Button>}
            />
          ) : (
            <div className="space-y-4">
              {workouts.map((w) => (
                <Card key={w.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-warning/10 text-warning"><Dumbbell className="size-4" /></span>
                      <div>
                        <p className="text-sm font-bold">{w.name}</p>
                        <p className="text-[11px] text-mute">{fmtDateShort(w.date)}{w.durationMin ? ` · ${w.durationMin} min` : ""} · {w.volume.toLocaleString()} kg volume</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-dim">
                        <Input
                          type="number"
                          className="h-7 w-16 px-2 text-[11px]"
                          placeholder="min"
                          defaultValue={w.durationMin ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            if (v !== w.durationMin) run(() => updateWorkout(w.id, { durationMin: v }), { success: "Duration saved" });
                          }}
                        />
                        min
                      </label>
                      <ConfirmDelete onConfirm={() => run(() => deleteWorkout(w.id), { success: "Workout deleted" })} />
                    </div>
                  </div>
                  <div className="divide-y divide-line/50">
                    {w.exercises.map((e) => (
                      <div key={e.id} className="px-5 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[13px] font-semibold">{e.name}</p>
                          <ConfirmDelete onConfirm={() => run(() => deleteExercise(e.id), {})} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {e.sets.map((s, i) => (
                            <span key={s.id} className="group relative flex items-center gap-1 rounded-md border border-line bg-ink px-2 py-1 text-[11px] font-medium tabular-nums">
                              <span className="text-dim">{i + 1}.</span> {s.reps} × {s.weightKg}kg
                              {s.isPR && <Trophy className="size-3 text-amber-400" />}
                              <button
                                onClick={() => run(() => deleteSet(s.id), {})}
                                className="ml-0.5 hidden text-dim hover:text-red-400 group-hover:inline cursor-pointer"
                              >×</button>
                            </span>
                          ))}
                          <span className="flex items-center gap-1">
                            <Input
                              type="number" placeholder="reps" min={0}
                              className="h-7 w-16 px-2 text-[11px]"
                              value={setDraft[e.id]?.reps ?? ""}
                              onChange={(ev) => setSetDraft((d) => ({ ...d, [e.id]: { reps: ev.target.value, weight: d[e.id]?.weight ?? "" } }))}
                            />
                            <Input
                              type="number" placeholder="kg" min={0} step="0.5"
                              className="h-7 w-16 px-2 text-[11px]"
                              value={setDraft[e.id]?.weight ?? ""}
                              onChange={(ev) => setSetDraft((d) => ({ ...d, [e.id]: { reps: d[e.id]?.reps ?? "", weight: ev.target.value } }))}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter") {
                                  const d = setDraft[e.id];
                                  if (d?.reps) {
                                    run(() => addSet({ exerciseId: e.id, reps: Number(d.reps), weightKg: Number(d.weight) || 0 }), {});
                                    setSetDraft((x) => ({ ...x, [e.id]: { reps: "", weight: "" } }));
                                  }
                                }
                              }}
                            />
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => {
                                const d = setDraft[e.id];
                                if (d?.reps) {
                                  run(() => addSet({ exerciseId: e.id, reps: Number(d.reps), weightKg: Number(d.weight) || 0 }), {});
                                  setSetDraft((x) => ({ ...x, [e.id]: { reps: "", weight: "" } }));
                                }
                              }}
                            ><Plus /></Button>
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 px-5 py-2.5">
                      <Plus className="size-3.5 text-dim" />
                      <input
                        value={newEx[w.id] ?? ""}
                        onChange={(e) => setNewEx((x) => ({ ...x, [w.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          const v = (newEx[w.id] ?? "").trim();
                          if (e.key === "Enter" && v) {
                            run(() => addExercise(w.id, v), {});
                            setNewEx((x) => ({ ...x, [w.id]: "" }));
                          }
                        }}
                        placeholder="Add exercise… (Enter)"
                        className="w-full bg-transparent text-sm text-fog placeholder:text-dim focus:outline-none"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* -------------------------------- RUNNING ------------------------------- */}
        <TabsContent value="running">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Total distance" value={fmtKm(totalKm)} icon={<Footprints />} tone="#06B6D4" />
            <Stat label="Runs" value={runCount} icon={<Activity />} tone="#06B6D4" />
            <Stat
              label="Best pace"
              value={bestPace ? `${Math.floor(bestPace)}:${String(Math.round((bestPace % 1) * 60)).padStart(2, "0")}/km` : "—"}
              icon={<Zap />} tone="#06B6D4"
            />
          </div>
          {runs.length === 0 ? (
            <EmptyState icon={<Footprints />} title="No runs logged" desc="Track runs and rest days — pace is calculated automatically." action={<Button size="sm" onClick={() => setRunModal(true)}>Log run</Button>} />
          ) : (
            <Card className="divide-y divide-line/60">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel2/40">
                  <Badge variant={r.type === "run" ? "ice" : "default"} className="w-12 justify-center">{r.type === "run" ? "Run" : "Rest"}</Badge>
                  <span className="w-14 text-xs font-medium text-mute">{fmtDateShort(r.date)}</span>
                  {r.type === "run" ? (
                    <>
                      <span className="min-w-0 flex-1 text-sm font-semibold">{fmtKm(r.distanceKm)}</span>
                      <span className="hidden text-xs text-mute sm:block">{r.durationMin ? `${Math.round(r.durationMin)} min` : "—"}</span>
                      <span className="hidden w-24 text-xs font-medium text-cyan sm:block">{fmtPace(r.distanceKm, r.durationMin)}</span>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1 text-sm text-mute">Rest day{r.notes ? ` — ${r.notes}` : ""}</span>
                  )}
                  {r.type === "run" && <Effort n={r.effort} />}
                  <ConfirmDelete onConfirm={() => run(() => deleteRun(r.id), { success: "Deleted" })} />
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        {/* ------------------------------- RECOVERY ------------------------------ */}
        <TabsContent value="recovery">
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className="p-5">
              <CardHeader title="Today's check-in" icon={<BedDouble />} className="px-0 pt-0 pb-4" />
              <RecoveryForm today={today} existing={todayReview} onSave={(input) => run(() => upsertReview(input), { success: todayReview ? "Check-in updated" : "Check-in saved · +10 XP" })} />
            </Card>
            <Card>
              <CardHeader title="Last 14 days" icon={<HeartPulse />} sub="Sleep hours and energy (1–10)" className="pb-4" />
              <div className="px-5 pb-5">
                {pastRecovery.length === 0 ? (
                  <EmptyState icon={<BedDouble />} title="No check-ins yet" desc="Log sleep and energy daily to spot recovery trends." />
                ) : (
                  <div className="space-y-1.5">
                    {pastRecovery.map((r) => (
                      <div key={r.date} className="flex items-center gap-3">
                        <span className="w-14 text-xs font-medium text-mute">{fmtDateShort(r.date)}</span>
                        <div className="flex h-5 flex-1 items-center gap-2">
                          <div className="h-full rounded-sm bg-violet/70" style={{ width: `${Math.min(100, ((r.sleepHours ?? 0) / 10) * 100)}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-mute">{r.sleepHours ? `${r.sleepHours}h` : "—"}</span>
                        <span className={cn("w-10 text-right text-xs font-semibold tabular-nums", (r.energy ?? 0) >= 7 ? "text-emerald-400" : (r.energy ?? 0) >= 4 ? "text-amber-400" : "text-red-400")}>
                          {r.energy ? `${r.energy}/10` : "—"}
                        </span>
                        {r.restDay && <Badge variant="default">Rest</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Modal open={workoutModal} onClose={() => setWorkoutModal(false)} title="Log workout" sub="+20 XP">
        <WorkoutForm onDone={() => setWorkoutModal(false)} />
      </Modal>
      <Modal open={runModal} onClose={() => setRunModal(false)} title="Log run or rest" sub="+15 XP for runs">
        <RunForm onDone={() => setRunModal(false)} />
      </Modal>
    </div>
  );
}

function RecoveryForm({ today, existing, onSave }: { today: string; existing: ReviewDTO | null; onSave: (input: { date: string; sleepHours: number | null; energy: number | null; restDay: boolean; note: string | null }) => void }) {
  const [sleep, setSleep] = useState(existing?.sleepHours?.toString() ?? "");
  const [energy, setEnergy] = useState(existing?.energy?.toString() ?? "7");
  const [restDay, setRestDay] = useState(existing?.restDay ?? false);
  const [note, setNote] = useState(existing?.note ?? "");
  return (
    <div className="space-y-4">
      <Field label="Sleep (hours)">
        <Input type="number" step="0.25" min={0} max={24} value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7.5" />
      </Field>
      <Field label={`Energy — ${energy}/10`}>
        <input type="range" min={1} max={10} value={energy} onChange={(e) => setEnergy(e.target.value)} className="w-full accent-[var(--accent)] cursor-pointer" />
      </Field>
      <button
        onClick={() => setRestDay(!restDay)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
          restDay ? "border-accent bg-accent-soft text-fog" : "border-line text-mute hover:text-fog"
        )}
      >
        Rest day
        <span className={cn("h-4 w-7 rounded-full p-0.5 transition-colors", restDay ? "bg-accent" : "bg-line")}>
          <span className={cn("block size-3 rounded-full bg-white transition-transform", restDay && "translate-x-3")} />
        </span>
      </button>
      <Field label="Note">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sore legs, poor sleep…" />
      </Field>
      <Button className="w-full" onClick={() => onSave({ date: today, sleepHours: sleep ? Number(sleep) : null, energy: Number(energy), restDay, note: note || null })}>
        Save check-in
      </Button>
    </div>
  );
}
