// Serializable DTOs passed from server components/actions to client components.

export interface TopicDTO {
  id: number;
  chapterId: number;
  name: string;
  status: "todo" | "in_progress" | "done";
  difficulty: string;
  priority: "high" | "medium" | "low";
  prerequisiteId: number | null;
  isCurrent: boolean;
  notes: string | null;
  link: string | null;
  mastery: TopicMastery;
}

export interface TopicProgressDTO {
  theoryDoneAt: string | null;
  derivationsDoneAt: string | null;
  ncertAttempted: number;
  ncertCorrect: number;
  ncertSkipped: number;
  outsideAttempted: number;
  outsideCorrect: number;
  testScore: number | null;
  testAt: string | null;
}

export interface NoteDocumentDTO {
  id: number;
  subjectId: number | null;
  subjectName: string | null;
  title: string;
  fileName: string;
  pageCount: number | null;
  status: string;
  sections: number;
  reviewCount: number;
  createdAt: string;
}

export interface NoteSectionDTO {
  id: number;
  documentId: number;
  chapterId: number | null;
  topicId: number | null;
  chapterName: string | null;
  topicName: string | null;
  heading: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  confidence: number;
  needsReview: boolean;
}

export interface TopicReferenceDTO {
  id: number;
  topicId: number;
  topicName: string;
  chapterId: number;
  chapterName: string;
  subjectId: number;
  subjectName: string;
  kind: "formula" | "derivation";
  title: string;
  formula: string;
  symbols: { symbol: string; meaning: string; unit: string }[] | null;
  conditions: string | null;
  commonMistake: string | null;
  source: string;
}

export type TopicStageId = "theory" | "derivations" | "ncert" | "outside" | "test" | "mastery";

export interface TopicStageInfo {
  id: TopicStageId;
  label: string;
  state: "pending" | "active" | "done";
}

export interface ChapterDTO {
  id: number;
  subjectId: number;
  name: string;
  progress: number; // 0-100 based on topics
  topics: TopicDTO[];
}

export interface SubjectDTO {
  id: number;
  name: string;
  color: string;
  description: string | null;
  progress: number;
  totalTopics: number;
  doneTopics: number;
  minutes: number; // total study minutes
  chapters: ChapterDTO[];
}

export interface SessionDTO {
  id: number;
  date: string;
  minutes: number;
  questions: number;
  correct: number;
  notes: string | null;
  subjectId: number | null;
  chapterId: number | null;
  topicId: number | null;
  subjectName: string | null;
  subjectColor: string | null;
  chapterName: string | null;
  topicName: string | null;
}

export interface TaskDTO {
  id: number;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "completed";
  dueDate: string | null;
  scheduledDate: string | null;
  startMin: number | null;
  estimatedMinutes: number | null;
  subjectId: number | null;
  chapterId: number | null;
  topicId: number | null;
  subjectName: string | null;
  subjectColor: string | null;
}

export interface ExamDTO {
  id: number;
  name: string;
  date: string;
  notes: string | null;
  subjectId: number | null;
  subjectName: string | null;
  subjectColor: string | null;
  daysRemaining: number;
  progress: number;
  totalTopics: number;
  doneTopics: number;
  chapters: { id: number; name: string; subjectName: string }[];
}

export interface PlanBlockDTO {
  id: number;
  date: string;
  startMin: number;
  endMin: number;
  type: string;
  title: string;
  taskId: number | null;
  studySessionId: number | null;
  examId: number | null;
  workoutId: number | null;
  runId: number | null;
  mealId: number | null;
  habitId: number | null;
  done: boolean;
  doneAt: Date | null;
  actualMinutes: number | null;
  color: string | null;
  reason: string | null;
}

export interface HabitDTO {
  id: number;
  name: string;
  color: string;
  streak: number;
  rate30: number; // % of last 30 days completed
  logs: string[]; // dates within requested range
}

export interface SetDTO {
  id: number;
  exerciseId: number;
  reps: number;
  weightKg: number;
  isPR: boolean;
}

export interface ExerciseDTO {
  id: number;
  workoutId: number;
  name: string;
  sets: SetDTO[];
}

export interface WorkoutDTO {
  id: number;
  date: string;
  name: string;
  notes: string | null;
  durationMin: number | null;
  exercises: ExerciseDTO[];
  volume: number; // total kg lifted
}

export interface RunDTO {
  id: number;
  date: string;
  type: "run" | "rest";
  distanceKm: number | null;
  durationMin: number | null;
  effort: number | null;
  notes: string | null;
}

export interface MealItemDTO {
  id: number;
  mealId: number;
  name: string;
  portion: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealDTO {
  id: number;
  date: string;
  slot: string;
  status: "planned" | "eaten";
  name: string | null;
  items: MealItemDTO[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
}

export interface ReviewDTO {
  id: number | null;
  date: string;
  sleepHours: number | null;
  energy: number | null;
  restDay: boolean;
  note: string | null;
}

export interface SettingsDTO {
  name: string;
  accent: string;
  studyTargetMin: number;
  classLevel: number | null;
  board: string | null;
}

/** Mastery is derived from actual performance evidence — never from topic status alone. */
export interface TopicMastery {
  score: number; // 0-100
  label: "not_learned" | "developing" | "basic" | "strong" | "mastered";
  sessions: number;
  minutes: number;
  questions: number;
  correct: number;
  accuracyPct: number | null; // null when no questions attempted
}

export interface NextActionDTO {
  type: "practice" | "revise" | "learn" | "move_on" | "review_mistake" | "diagnose" | "return_prerequisite";
  label: string;
  detail: string;
  href: string;
  score: number; // internal priority
  topicId: number | null;
}

export interface RevisionItemDTO {
  id: number;
  topicId: number;
  topicName: string;
  chapterName: string;
  subjectName: string;
  subjectColor: string;
  dueDate: string;
  intervalDays: number;
  level: number;
  lastScore: number | null;
  daysLate: number;
}

export interface ErrorLogDTO {
  id: number;
  tag: string;
  detail: string;
  count: number;
  status: "unresolved" | "improving" | "resolved";
  lastSeen: string;
  topicName: string | null;
  subjectName: string | null;
}

export interface TutorSessionDTO {
  id: number;
  title: string | null;
  mode: string;
  subjectId: number | null;
  topicId: number | null;
  createdAt: string;
  lastMessage: string | null;
}

export interface TutorMessageDTO {
  id: number;
  role: "user" | "assistant";
  content: string;
  nextAction: { type: string; label: string } | null;
  createdAt: string;
}

export interface LevelDTO {
  level: number;
  title: string;
  totalXp: number;
  intoLevel: number;
  needForNext: number;
  pct: number;
}

export interface ArcSnapshotDTO {
  status: "pre" | "active" | "done";
  dayNumber: number;
  daysUntilStart: number;
  totalDays: number;
  pctElapsed: number;
  phaseName: string;
  phaseColor: string;
}

export interface ShellData {
  settings: SettingsDTO;
  level: LevelDTO;
  streak: number;
  arc: ArcSnapshotDTO;
  today: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
