"use client";

import { addDays, fmtDateLong, todayStr } from "@/lib/dates";
import type { MealDTO, SettingsDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addMealItem, deleteMeal, deleteMealItem, ensureMeal, setMealStatus } from "@/server/fitness";
import { useAction } from "@/lib/use-action";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  UtensilsCrossed,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ConfirmDelete, EmptyState, Input, PageHeader } from "./ui";

const SLOT_META: Record<string, { label: string; color: string }> = {
  breakfast: { label: "Breakfast", color: "#FBBF24" },
  lunch: { label: "Lunch", color: "#34D399" },
  snack: { label: "Snack", color: "#06B6D4" },
  dinner: { label: "Dinner", color: "#06B6D4" },
};
const SLOTS = ["breakfast", "lunch", "snack", "dinner"];

export function NutritionClient({ meals, date }: { meals: MealDTO[]; date: string; settings: SettingsDTO }) {
  const { run } = useAction();
  const router = useRouter();
  const [draft, setDraft] = useState<Record<number, { name: string; portion: string; calories: string; protein: string; carbs: string; fat: string }>>({});

  const go = (d: string) => router.push(`/nutrition?date=${d}`);
  const today = todayStr();

  const totals = (list: MealDTO[]) =>
    list.reduce(
      (a, m) => ({
        calories: a.calories + m.totals.calories,
        protein: Math.round((a.protein + m.totals.protein) * 10) / 10,
        carbs: Math.round((a.carbs + m.totals.carbs) * 10) / 10,
        fat: Math.round((a.fat + m.totals.fat) * 10) / 10,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

  const dayTotals = totals(meals);
  const eatenTotals = totals(meals.filter((m) => m.status === "eaten"));
  const planned = dayTotals.calories - eatenTotals.calories;

  const EMPTY = { name: "", portion: "", calories: "", protein: "", carbs: "", fat: "" };
  const setD = (mealId: number, patch: Partial<(typeof draft)[number]>) =>
    setDraft((d) => ({ ...d, [mealId]: { ...(d[mealId] ?? EMPTY), ...patch } }));

  const submitItem = (mealId: number) => {
    const d = draft[mealId];
    if (!d?.name?.trim()) return;
    run(
      () =>
        addMealItem({
          mealId,
          name: d.name.trim(),
          portion: d.portion || undefined,
          calories: Number(d.calories) || 0,
          protein: Number(d.protein) || 0,
          carbs: Number(d.carbs) || 0,
          fat: Number(d.fat) || 0,
        }),
      {}
    );
    setDraft((x) => ({ ...x, [mealId]: EMPTY }));
  };

  return (
    <div>
      <PageHeader
        title="Nutrition"
        sub="Log what you eat — planned vs actual, with honest manual macro estimates"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" onClick={() => go(addDays(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && go(e.target.value)}
              className="h-9 rounded-lg border border-line bg-panel2 px-2.5 text-sm text-fog focus:outline-none focus:ring-2 ring-accent"
            />
            <Button variant="secondary" size="icon" onClick={() => go(addDays(date, 1))} aria-label="Next day"><ChevronRight /></Button>
            {date !== today && <Button variant="ghost" size="sm" onClick={() => go(today)}>Today</Button>}
          </div>
        }
      />

      {/* Day summary — pure logging totals, no goals/deficits */}
      <div className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{fmtDateLong(date)}</p>
          <p className="text-[11px] text-dim">
            {eatenTotals.calories} kcal eaten{planned > 0 ? ` · ${planned} kcal planned` : ""}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
          {[
            { label: "Calories", value: dayTotals.calories, unit: "kcal" },
            { label: "Protein", value: Math.round(dayTotals.protein), unit: "g" },
            { label: "Carbs", value: Math.round(dayTotals.carbs), unit: "g" },
            { label: "Fat", value: Math.round(dayTotals.fat), unit: "g" },
          ].map((m) => (
            <div key={m.label}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">{m.label}</p>
              <p className="font-display mt-0.5 text-2xl font-bold tabular-nums">
                {dayTotals.calories === 0 ? "—" : m.value}
                {dayTotals.calories !== 0 && <span className="text-xs font-medium text-mute"> {m.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SLOTS.map((slot) => {
          const meta = SLOT_META[slot];
          const meal = meals.find((m) => m.slot === slot);
          return (
            <Card key={slot} className={cn(meal?.status === "eaten" && "border-success/20")}>
              <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  <h3 className="text-sm font-bold">{meta.label}</h3>
                  {meal?.name && <span className="truncate text-xs text-mute">· {meal.name}</span>}
                </div>
                {meal && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => run(() => setMealStatus(meal.id, meal.status === "eaten" ? "planned" : "eaten"), { success: meal.status === "eaten" ? undefined : `${meta.label} logged · +5 XP` })}
                      className={cn(
                        "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-all cursor-pointer",
                        meal.status === "eaten"
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-line2 text-mute hover:border-success hover:text-fog"
                      )}
                    >
                      <Check className="size-3.5" />
                      {meal.status === "eaten" ? "Eaten" : "Mark eaten"}
                    </button>
                    <ConfirmDelete onConfirm={() => run(() => deleteMeal(meal.id), { success: "Meal removed" })} />
                  </div>
                )}
              </div>

              {!meal ? (
                <div className="px-5 pb-5">
                  <button
                    onClick={() => run(() => ensureMeal(date, slot), {})}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-sm font-medium text-mute transition-colors hover:border-line2 hover:text-fog cursor-pointer"
                  >
                    <Plus className="size-4" /> Plan {meta.label.toLowerCase()}
                  </button>
                </div>
              ) : (
                <div className="px-5 pb-4">
                  {meal.items.length === 0 && (
                    <p className="pb-2 text-xs text-dim">No foods yet — add items below.</p>
                  )}
                  {meal.items.length > 0 && (
                    <div className="divide-y divide-line/40">
                      {meal.items.map((i) => (
                        <div key={i.id} className="group flex items-center gap-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{i.name}</p>
                            {i.portion && <p className="text-[11px] text-dim">{i.portion}</p>}
                          </div>
                          <span className="w-16 text-right text-xs tabular-nums text-mute">{i.calories} kcal</span>
                          <span className="hidden w-12 text-right text-[11px] tabular-nums text-dim sm:block">P {Math.round(i.protein)}g</span>
                          <span className="hidden w-12 text-right text-[11px] tabular-nums text-dim sm:block">C {Math.round(i.carbs)}g</span>
                          <span className="hidden w-12 text-right text-[11px] tabular-nums text-dim sm:block">F {Math.round(i.fat)}g</span>
                          <button onClick={() => run(() => deleteMealItem(i.id), {})} className="hidden text-dim hover:text-danger group-hover:block cursor-pointer">×</button>
                        </div>
                      ))}
                      <div className="flex items-center gap-3 py-2 text-[11px] font-semibold text-mute">
                        <span className="flex-1">Total</span>
                        <span className="w-16 text-right tabular-nums">{meal.totals.calories} kcal</span>
                        <span className="hidden w-12 text-right tabular-nums sm:block">P {Math.round(meal.totals.protein)}g</span>
                        <span className="hidden w-12 text-right tabular-nums sm:block">C {Math.round(meal.totals.carbs)}g</span>
                        <span className="hidden w-12 text-right tabular-nums sm:block">F {Math.round(meal.totals.fat)}g</span>
                      </div>
                    </div>
                  )}

                  {/* Add item */}
                  <div className="mt-2 space-y-2 rounded-lg bg-panel2 p-3">
                    <div className="grid grid-cols-[1fr_90px] gap-2">
                      <Input placeholder="Food item" className="h-8 text-xs" value={draft[meal.id]?.name ?? ""} onChange={(e) => setD(meal.id, { name: e.target.value })} />
                      <Input placeholder="Portion" className="h-8 text-xs" value={draft[meal.id]?.portion ?? ""} onChange={(e) => setD(meal.id, { portion: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <Input placeholder="kcal" type="number" min={0} className="h-8 text-xs" value={draft[meal.id]?.calories ?? ""} onChange={(e) => setD(meal.id, { calories: e.target.value })} />
                      <Input placeholder="P g" type="number" min={0} className="h-8 text-xs" value={draft[meal.id]?.protein ?? ""} onChange={(e) => setD(meal.id, { protein: e.target.value })} />
                      <Input placeholder="C g" type="number" min={0} className="h-8 text-xs" value={draft[meal.id]?.carbs ?? ""} onChange={(e) => setD(meal.id, { carbs: e.target.value })} />
                      <Input placeholder="F g" type="number" min={0} className="h-8 text-xs" value={draft[meal.id]?.fat ?? ""} onChange={(e) => setD(meal.id, { fat: e.target.value })} />
                      <Button size="sm" variant="secondary" className="h-8" disabled={!draft[meal.id]?.name?.trim()} onClick={() => submitItem(meal.id)}>
                        <Plus /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Meal scan — future */}
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-dashed border-line px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Camera className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">Meal Scan <Badge variant="amber">Coming soon</Badge></p>
          <p className="mt-0.5 text-xs leading-relaxed text-mute">
            Photograph your plate → AI detects foods → estimated macros → you confirm → it saves here automatically.
          </p>
        </div>
      </div>

      {meals.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={<UtensilsCrossed />} title="Nothing planned for this day" desc="Use the slot cards above to plan meals, then mark them eaten as you go." />
        </div>
      )}
    </div>
  );
}
