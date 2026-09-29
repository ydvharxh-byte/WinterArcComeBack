import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  date,
  timestamp,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ---------------------------------- Study ---------------------------------- */

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2563EB"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  chapterId: integer("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("todo"), // todo | in_progress | done
  difficulty: text("difficulty").notNull().default("medium"), // easy | medium | hard
  priority: text("priority").notNull().default("medium"), // high | medium | low — Study OS priority, not official weightage
  prerequisiteId: integer("prerequisite_id"), // self-link set by user/AI; planner & tutor respect it
  isCurrent: boolean("is_current").notNull().default(false), // currently taught in school/tuition
  estimatedMinutes: integer("estimated_minutes").notNull().default(60),
  importance: text("importance").notNull().default("medium"), // Study OS importance — not official CBSE marks
  notes: text("notes"),
  link: text("link"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------- Learning stages per topic (§1, §13) ------------------- */

export const topicProgress = pgTable("topic_progress", {
  topicId: integer("topic_id")
    .primaryKey()
    .references(() => topics.id, { onDelete: "cascade" }),
  theoryDoneAt: timestamp("theory_done_at", { withTimezone: true }),
  derivationsDoneAt: timestamp("derivations_done_at", { withTimezone: true }),
  ncertAttempted: integer("ncert_attempted").notNull().default(0),
  ncertCorrect: integer("ncert_correct").notNull().default(0),
  ncertSkipped: integer("ncert_skipped").notNull().default(0),
  outsideAttempted: integer("outside_attempted").notNull().default(0),
  outsideCorrect: integer("outside_correct").notNull().default(0),
  testScore: real("test_score"), // 0-100 from the topic test
  testAt: timestamp("test_at", { withTimezone: true }),
  // Deliberate "I already know this" override — recorded, never treated as mastery evidence.
  stageOverride: boolean("stage_override").notNull().default(false),
  overrideAt: timestamp("override_at", { withTimezone: true }),
});

/** Structured theory lesson generated FROM the student's mapped note chunks. */
export const topicLessons = pgTable("topic_lessons", {
  topicId: integer("topic_id")
    .primaryKey()
    .references(() => topics.id, { onDelete: "cascade" }),
  lesson: text("lesson").notNull(), // markdown, sections per spec §3
  sourceRefs: text("source_refs").notNull().default("[]"), // json: [{document,pages,heading}]
  hasNotes: boolean("has_notes").notNull().default(false), // grounded in student notes vs supplemental
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studySessions = pgTable("study_sessions", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  minutes: integer("minutes").notNull().default(0),
  questions: integer("questions").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------- Tasks ---------------------------------- */

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  status: text("status").notNull().default("todo"), // todo | in_progress | completed
  dueDate: date("due_date"),
  scheduledDate: date("scheduled_date"),
  startMin: integer("start_min"),
  estimatedMinutes: integer("estimated_minutes"),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------ AI engine data ----------------------------- */

// Persistent misconception/mistake log — repeated mistakes become learning signals.
export const errorLogs = pgTable(
  "error_logs",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
    tag: text("tag").notNull(), // e.g. "sign-convention"
    detail: text("detail").notNull(),
    count: integer("count").notNull().default(1),
    status: text("status").notNull().default("unresolved"), // unresolved | improving | resolved
    lastSeen: date("last_seen").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("error_logs_topic_tag_unique").on(t.topicId, t.tag)]
);

// Every evaluated answer — scored evidence feeding mastery and revision.
export const questionAttempts = pgTable("question_attempts", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  correct: boolean("correct").notNull().default(false),
  score: integer("score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(5),
  feedback: text("feedback"),
  errorTag: text("error_tag"),
  tutorSessionId: integer("tutor_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Spaced-repetition state per topic — intervals adapt to performance.
export const revisionItems = pgTable("revision_items", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id")
    .notNull()
    .unique()
    .references(() => topics.id, { onDelete: "cascade" }),
  intervalDays: integer("interval_days").notNull().default(1),
  dueDate: date("due_date").notNull(),
  level: integer("level").notNull().default(0), // successful revisions in a row
  lastScore: integer("last_score"), // 0-100
  lastRevisedAt: timestamp("last_revised_at", { withTimezone: true }),
});

/* ---------------------------------- Exams ---------------------------------- */

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const examChapters = pgTable(
  "exam_chapters",
  {
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.examId, t.chapterId] })]
);

/* ---------------------------------- Habits ---------------------------------- */

export const habits = pgTable("habits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#06B6D4"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const habitLogs = pgTable(
  "habit_logs",
  {
    id: serial("id").primaryKey(),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
  },
  (t) => [uniqueIndex("habit_logs_habit_date_unique").on(t.habitId, t.date)]
);

/* --------------------------------- Planner ---------------------------------
   Blocks keep a display `type` (drives color/icon) plus proper nullable FKs
   linking back to the entity they were planned from. Custom events simply
   have all FKs null. Planned (startMin/endMin) is separate from the actual
   outcome (done, doneAt, actualMinutes). */

export const dailyPlans = pgTable("daily_plans", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  startMin: integer("start_min").notNull(),
  endMin: integer("end_min").notNull(),
  type: text("type").notNull().default("other"), // task|study|exam|gym|run|meal|habit|rest|other
  title: text("title").notNull(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  studySessionId: integer("study_session_id").references(() => studySessions.id, { onDelete: "set null" }),
  examId: integer("exam_id").references(() => exams.id, { onDelete: "set null" }),
  workoutId: integer("workout_id").references(() => workouts.id, { onDelete: "set null" }),
  runId: integer("run_id").references(() => runs.id, { onDelete: "set null" }),
  mealId: integer("meal_id").references(() => meals.id, { onDelete: "set null" }),
  habitId: integer("habit_id").references(() => habits.id, { onDelete: "set null" }),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  actualMinutes: integer("actual_minutes"),
  color: text("color"),
  reason: text("reason"), // why this block exists (planner engine)
});

/* --------------------------------- Fitness --------------------------------- */

export const workouts = pgTable("workouts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  durationMin: integer("duration_min"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const workoutSets = pgTable("workout_sets", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  reps: integer("reps").notNull().default(0),
  weightKg: real("weight_kg").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: text("type").notNull().default("run"), // run | rest
  distanceKm: real("distance_km"),
  durationMin: real("duration_min"),
  effort: integer("effort"), // 1-10
  notes: text("notes"),
});

export const dailyReviews = pgTable("daily_reviews", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  sleepHours: real("sleep_hours"),
  energy: integer("energy"), // 1-10
  restDay: boolean("rest_day").notNull().default(false),
  note: text("note"),
});

/* -------------------------------- Nutrition -------------------------------- */

export const meals = pgTable(
  "meals",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    slot: text("slot").notNull(), // breakfast | lunch | snack | dinner
    status: text("status").notNull().default("planned"), // planned | eaten
    name: text("name"),
  },
  (t) => [uniqueIndex("meals_date_slot_unique").on(t.date, t.slot)]
);

export const mealItems = pgTable("meal_items", {
  id: serial("id").primaryKey(),
  mealId: integer("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  portion: text("portion"),
  calories: integer("calories").notNull().default(0),
  protein: real("protein").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fat: real("fat").notNull().default(0),
});

/* ------------------------------- Gamification ------------------------------ */

export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: serial("id").primaryKey(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    date: date("date").notNull(),
    // Idempotency key, e.g. "task:12:completed" — the same completion can never award twice.
    actionKey: text("action_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("xp_action_key_unique").on(t.actionKey)]
);

/* -------------------------------- Winter Arc ------------------------------- */

export const winterArc = pgTable("winter_arc", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  note: text("note"),
});

/* ---------------------------------- Notes ---------------------------------- */

// Whole-subject uploads, auto-organized (§3–§7).
export const noteDocuments = pgTable("note_documents", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  pageCount: integer("page_count"),
  status: text("status").notNull().default("mapped"), // mapping | mapped
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const noteSections = pgTable("note_sections", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => noteDocuments.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  heading: text("heading").notNull(),
  content: text("content").notNull(),
  pageStart: integer("page_start"),
  pageEnd: integer("page_end"),
  confidence: real("confidence").notNull().default(0.5),
  needsReview: boolean("needs_review").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

/* --------------------- Formulas & derivations (§8, §9, §21) ------------------ */

export const topicReferences = pgTable("topic_references", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // formula | derivation
  title: text("title").notNull(),
  formula: text("formula").notNull(), // formula statement or derivation steps+result
  symbols: text("symbols"), // json: [{symbol, meaning, unit}]
  conditions: text("conditions"),
  commonMistake: text("common_mistake"),
  source: text("source").notNull().default("manual"), // notes | ai | manual
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------- AI tutor -------------------------------- */

export const tutorSessions = pgTable("tutor_sessions", {
  id: serial("id").primaryKey(),
  title: text("title"),
  mode: text("mode").notNull().default("chat"), // chat | teach | practice | examine | plan
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// AI-generated questions — expected answers stay server-side until attempted.
export const generatedQuestions = pgTable("generated_questions", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  concepts: text("concepts").notNull().default("[]"), // json array
  expectedMethod: text("expected_method"),
  answer: text("answer"),
  explanation: text("explanation"),
  attempted: boolean("attempted").notNull().default(false),
  tutorSessionId: integer("tutor_session_id").references(() => tutorSessions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tutorMessages = pgTable("tutor_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => tutorSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  meta: text("meta"), // json — evaluation, nextAction
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
