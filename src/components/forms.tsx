"use client";

import { createExam, logStudySession, updateExam } from "@/server/study";
import { createHabit, createTask, updateTask } from "@/server/tasks";
import { createRun, createWorkout } from "@/server/fitness";
import { todayStr } from "@/lib/dates";
import type { ExamDTO, SubjectDTO, TaskDTO } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { SUBJECT_COLORS, cn } from "@/lib/utils";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "./ui";

const num = (v: string) => (v === "" ? null : Number(v));

/* --------------------------------- TaskForm -------------------------------- */

export function TaskForm({ tree, task, onDone }: { tree: SubjectDTO[]; task?: TaskDTO | null; onDone: () => void }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<string>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [est, setEst] = useState(task?.estimatedMinutes?.toString() ?? "");
  const [subjectId, setSubjectId] = useState<number | null>(task?.subjectId ?? null);
  const [chapterId, setChapterId] = useState<number | null>(task?.chapterId ?? null);
  const [topicId, setTopicId] = useState<number | null>(task?.topicId ?? null);

  const chapters = tree.find((s) => s.id === subjectId)?.chapters ?? [];
  const topics = chapters.find((c) => c.id === chapterId)?.topics ?? [];

  const submit = () => {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      description: description || null,
      priority: priority as "low" | "medium" | "high",
      dueDate: dueDate || null,
      estimatedMinutes: num(est),
      subjectId,
      chapterId: subjectId ? chapterId : null,
      topicId: chapterId ? topicId : null,
    };
    run(
      () => (task ? updateTask(task.id, payload) : createTask({ ...payload, scheduledDate: null, startMin: null })),
      { success: task ? "Task updated" : "Task created", onSuccess: onDone }
    );
  };

  return (
    <div className="space-y-4">
      <Field label="Title">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish derivative practice set" onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Subject">
          <Select value={subjectId ?? ""} onChange={(e) => { setSubjectId(num(e.target.value)); setChapterId(null); setTopicId(null); }}>
            <option value="">None</option>
            {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Chapter">
          <Select disabled={!subjectId} value={chapterId ?? ""} onChange={(e) => { setChapterId(num(e.target.value)); setTopicId(null); }}>
            <option value="">None</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Topic">
          <Select disabled={!chapterId} value={topicId ?? ""} onChange={(e) => setTopicId(num(e.target.value))}>
            <option value="">None</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Estimated minutes">
        <Input type="number" min={1} value={est} onChange={(e) => setEst(e.target.value)} placeholder="45" />
      </Field>
      <Button onClick={submit} loading={pending} disabled={!title.trim()} className="w-full">
        {task ? "Save changes" : "Create task"}
      </Button>
    </div>
  );
}

/* --------------------------------- StudyForm ------------------------------- */

export function StudyForm({ tree, defaultDate, onDone }: { tree: SubjectDTO[]; defaultDate?: string; onDone: () => void }) {
  const { pending, run } = useAction();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [minutes, setMinutes] = useState("60");
  const [questions, setQuestions] = useState("");
  const [correct, setCorrect] = useState("");
  const [notes, setNotes] = useState("");

  const chapters = tree.find((s) => s.id === subjectId)?.chapters ?? [];
  const topicList = chapters.find((c) => c.id === chapterId)?.topics ?? [];

  const submit = () => {
    run(
      () =>
        logStudySession({
          subjectId,
          chapterId: subjectId ? chapterId : null,
          topicId: chapterId ? topicId : null,
          date,
          minutes: Number(minutes) || 0,
          questions: Number(questions) || 0,
          correct: Number(correct) || 0,
          notes: notes || null,
        }),
      { success: `Session logged · +${Math.max(5, Math.round((Number(minutes) || 0) / 5))} XP`, onSuccess: onDone }
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Subject">
          <Select autoFocus value={subjectId ?? ""} onChange={(e) => { setSubjectId(num(e.target.value)); setChapterId(null); setTopicId(null); }}>
            <option value="">None</option>
            {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Chapter">
          <Select disabled={!subjectId} value={chapterId ?? ""} onChange={(e) => { setChapterId(num(e.target.value)); setTopicId(null); }}>
            <option value="">Any</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Topic">
          <Select disabled={!chapterId} value={topicId ?? ""} onChange={(e) => setTopicId(num(e.target.value))}>
            <option value="">Any</option>
            {topicList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Minutes *">
          <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Questions solved">
          <Input type="number" min={0} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Correct">
          <Input type="number" min={0} value={correct} onChange={(e) => setCorrect(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you cover?" />
      </Field>
      <Button onClick={submit} loading={pending} disabled={!(Number(minutes) > 0)} className="w-full">
        Log session
      </Button>
    </div>
  );
}

/* -------------------------------- WorkoutForm ------------------------------- */

const WORKOUT_PRESETS = ["Push", "Pull", "Legs", "Upper Body", "Lower Body", "Full Body", "Cardio", "Core"];

export function WorkoutForm({ defaultDate, onDone }: { defaultDate?: string; onDone: (id?: number) => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    run(() => createWorkout({ date, name: name.trim(), notes: notes || undefined }), {
      success: "Workout logged · +20 XP",
      onSuccess: (d) => onDone(d?.id),
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Workout name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push" />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {WORKOUT_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setName(p)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              name === p ? "border-transparent bg-accent-soft text-accent" : "border-line text-mute hover:text-fog"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <Button onClick={submit} loading={pending} disabled={!name.trim()} className="w-full">Log workout</Button>
    </div>
  );
}

/* ---------------------------------- RunForm --------------------------------- */

export function RunForm({ defaultDate, onDone }: { defaultDate?: string; onDone: () => void }) {
  const { pending, run } = useAction();
  const [type, setType] = useState<string>("run");
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [effort, setEffort] = useState("6");
  const [notes, setNotes] = useState("");

  const submit = () => {
    run(
      () =>
        createRun({
          date,
          type,
          distanceKm: type === "run" ? num(distance) : null,
          durationMin: type === "run" ? num(duration) : null,
          effort: num(effort),
          notes: notes || undefined,
        }),
      { success: type === "run" ? "Run logged · +15 XP" : "Rest day logged", onSuccess: onDone }
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-ink p-1">
        {["run", "rest"].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "h-8 rounded-md text-[13px] font-medium capitalize transition-colors cursor-pointer",
              type === t ? "bg-panel2 text-fog" : "text-mute hover:text-fog"
            )}
          >
            {t === "run" ? "Run" : "Rest day"}
          </button>
        ))}
      </div>
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {type === "run" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (km) *">
            <Input type="number" step="0.01" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="5.0" />
          </Field>
          <Field label="Duration (min)">
            <Input type="number" step="1" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" />
          </Field>
        </div>
      )}
      <Field label={`Effort — ${effort}/10`}>
        <input
          type="range" min={1} max={10} value={effort}
          onChange={(e) => setEffort(e.target.value)}
          className="w-full accent-[var(--accent)] cursor-pointer"
        />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
      </Field>
      <Button onClick={submit} loading={pending} disabled={type === "run" && !(Number(distance) > 0)} className="w-full">
        Save
      </Button>
    </div>
  );
}

/* ---------------------------------- MealForm -------------------------------- */

export function MealForm({ defaultDate, onSave }: { defaultDate?: string; onSave: (date: string, slot: string, name?: string) => void }) {
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [slot, setSlot] = useState("breakfast");
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Slot">
        <Select value={slot} onChange={(e) => setSlot(e.target.value)}>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="snack">Snack</option>
          <option value="dinner">Dinner</option>
        </Select>
      </Field>
      <Field label="Meal name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken + rice bowl" />
      </Field>
      <Button onClick={() => onSave(date, slot, name.trim() || undefined)} className="w-full">Continue</Button>
    </div>
  );
}

/* ---------------------------------- ExamForm -------------------------------- */

export function ExamForm({ tree, exam, onDone }: { tree: SubjectDTO[]; exam?: ExamDTO | null; onDone: () => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(exam?.name ?? "");
  const [subjectId, setSubjectId] = useState<number | null>(exam?.subjectId ?? null);
  const [date, setDate] = useState(exam?.date ?? "");
  const [notes, setNotes] = useState(exam?.notes ?? "");

  const submit = () => {
    if (!name.trim() || !date) return;
    run(
      () => (exam ? updateExam({ id: exam.id, name: name.trim(), date, notes: notes || undefined }) : createExam({ name: name.trim(), subjectId, date, notes: notes || undefined })),
      { success: exam ? "Exam updated" : "Exam added", onSuccess: onDone }
    );
  };

  return (
    <div className="space-y-4">
      <Field label="Exam name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics Midterm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Subject">
          <Select value={subjectId ?? ""} onChange={(e) => setSubjectId(num(e.target.value))} disabled={!!exam}>
            <option value="">None</option>
            {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Syllabus, venue, weightage…" />
      </Field>
      <Button onClick={submit} loading={pending} disabled={!name.trim() || !date} className="w-full">
        {exam ? "Save changes" : "Add exam"}
      </Button>
    </div>
  );
}

/* --------------------------------- HabitForm -------------------------------- */

export function HabitForm({ onDone }: { onDone: () => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[1]);

  return (
    <div className="space-y-4">
      <Field label="Habit name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wake up at 6:00" onKeyDown={(e) => e.key === "Enter" && name.trim() && run(() => createHabit({ name: name.trim(), color }), { success: "Habit created", onSuccess: onDone })} />
      </Field>
      <Field label="Color">
        <div className="flex gap-2">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn("size-7 rounded-full transition-transform cursor-pointer", color === c && "ring-2 ring-offset-2 ring-offset-panel scale-110")}
              style={{ backgroundColor: c, ["--tw-ring-color" as string]: c } as React.CSSProperties}
            />
          ))}
        </div>
      </Field>
      <Button
        onClick={() => run(() => createHabit({ name: name.trim(), color }), { success: "Habit created", onSuccess: onDone })}
        loading={pending}
        disabled={!name.trim()}
        className="w-full"
      >
        Create habit
      </Button>
    </div>
  );
}
