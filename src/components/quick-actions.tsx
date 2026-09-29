"use client";

import { ensureMeal } from "@/server/fitness";
import type { SubjectDTO } from "@/lib/types";
import {
  BookOpen,
  Camera,
  Dumbbell,
  ListPlus,
  Mic,
  UtensilsCrossed,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MealForm, StudyForm, TaskForm, WorkoutForm } from "./forms";
import { Modal } from "./modal";

type Kind = "task" | "study" | "workout" | "meal" | "voice" | "scan" | null;

const ACTIONS: { kind: Exclude<Kind, null>; label: string; icon: ReactNode; hint: string }[] = [
  { kind: "task", label: "Task", icon: <ListPlus />, hint: "Add a to-do" },
  { kind: "study", label: "Study", icon: <BookOpen />, hint: "Log a session" },
  { kind: "workout", label: "Workout", icon: <Dumbbell />, hint: "Log training" },
  { kind: "meal", label: "Meal", icon: <UtensilsCrossed />, hint: "Plan a meal" },
  { kind: "voice", label: "Voice", icon: <Mic />, hint: "Coming soon" },
  { kind: "scan", label: "Scan", icon: <Camera />, hint: "Coming soon" },
];

export function QuickActions({ tree }: { tree: SubjectDTO[] }) {
  const [kind, setKind] = useState<Kind>(null);
  const router = useRouter();
  const close = () => setKind(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            onClick={() => setKind(a.kind)}
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-line bg-panel px-2 py-3.5 transition-all hover:border-line2 hover:bg-panel2 cursor-pointer"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-panel2 text-mute transition-colors group-hover:bg-accent-soft group-hover:text-accent [&_svg]:size-4">
              {a.icon}
            </span>
            <span className="text-xs font-semibold">+ {a.label}</span>
            <span className="text-[10px] text-dim">{a.hint}</span>
          </button>
        ))}
      </div>

      <Modal open={kind === "task"} onClose={close} title="New task" sub="+8–20 XP when completed">
        <TaskForm tree={tree} onDone={close} />
      </Modal>
      <Modal open={kind === "study"} onClose={close} title="Log study session" sub="Earn 1 XP per 5 minutes">
        <StudyForm tree={tree} onDone={close} />
      </Modal>
      <Modal open={kind === "workout"} onClose={close} title="Log workout" sub="+20 XP">
        <WorkoutForm onDone={close} />
      </Modal>
      <Modal open={kind === "meal"} onClose={close} title="Plan a meal">
        <MealForm
          onSave={async (date, slot, name) => {
            const res = await ensureMeal(date, slot, name);
            if (res.ok) {
              close();
              router.push(`/nutrition?date=${date}`);
              router.refresh();
            }
          }}
        />
      </Modal>

      {(["voice", "scan"] as const).map((k) => (
        <Modal key={k} open={kind === k} onClose={close} title={k === "voice" ? "Voice input" : "Scan"} sub="Coming soon">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-6">
              {k === "voice" ? <Mic /> : <Camera />}
            </span>
            <p className="text-sm font-medium">This feature is on the roadmap</p>
            <p className="max-w-xs text-xs leading-relaxed text-mute">
              {k === "voice"
                ? "Voice capture will let you add tasks, log sessions and check off habits hands-free."
                : "Meal scan will turn a photo into estimated macros — after confirmation it will save to your nutrition log."}
            </p>
          </div>
        </Modal>
      ))}
    </>
  );
}
