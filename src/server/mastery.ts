import { daysBetween } from "@/lib/dates";
import type { TopicMastery } from "@/lib/types";

/**
 * Dynamic mastery 0–100 per topic.
 *
 * Philosophy (per spec):
 *   watching lectures = exposure (small weight)
 *   solving correctly = evidence (dominant weight)
 *   repeated correct performance = mastery
 *   repeated mistakes = penalty
 *   forgetting = decay over time
 *
 * Bands: 0–30 Not learned · 31–50 Developing · 51–70 Basic · 71–85 Strong · 86–100 Mastered
 */
export interface MasteryStats {
  minutes: number;        // study time on topic
  questions: number;      // practice questions attempted (sessions + evaluated attempts)
  correct: number;        // correct answers / evaluated marks
  attemptRows: number;    // individual evaluated attempts
  unresolvedErrors: number;
  improvingErrors: number;
  daysSinceActivity: number | null; // null = never touched
}

const empty: MasteryStats = {
  minutes: 0, questions: 0, correct: 0, attemptRows: 0,
  unresolvedErrors: 0, improvingErrors: 0, daysSinceActivity: null,
};

export function masteryBand(score: number): TopicMastery["label"] {
  if (score <= 30) return "not_learned";
  if (score <= 50) return "developing";
  if (score <= 70) return "basic";
  if (score <= 85) return "strong";
  return "mastered";
}

export function scoreMastery(s: Partial<MasteryStats>): TopicMastery {
  const st: MasteryStats = { ...empty, ...s };

  // Exposure — capped at 20 pts for ~3h of study time
  const exposure = Math.min(20, (st.minutes / 180) * 20);

  // Evidence — accuracy × 60, ramping up to ~8 meaningful questions
  const accuracy = st.questions > 0 ? st.correct / st.questions : null;
  const ramp = Math.min(1, st.questions / 8);
  const evidence = accuracy !== null ? accuracy * 60 * ramp : 0;

  // Mistake penalty — unresolved misconceptions undermine mastery
  const penalty = Math.min(20, st.unresolvedErrors * 6 + st.improvingErrors * 3);

  // Forgetting curve — evidence decays without revision (floor 40% after ~45 days)
  const decay =
    st.daysSinceActivity === null ? 1 : Math.max(0.4, 1 - Math.max(0, st.daysSinceActivity - 7) / 38);

  const raw = (exposure + evidence) * decay - penalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    label: masteryBand(score),
    sessions: 0, // filled by caller for display
    minutes: st.minutes,
    questions: st.questions,
    correct: st.correct,
    accuracyPct: accuracy !== null ? Math.round(accuracy * 100) : null,
  };
}

/* ------------------------- Evidence aggregation model -------------------------

   Sessions, evaluated attempts and error logs are aggregated server-side
   (collectTopicEvidence in study.ts); this pure function turns them into
   a mastery score for one topic. */

export interface TopicEvidence {
  sessions: Record<number, { sessions: number; minutes: number; questions: number; correct: number }>;
  attempts: Record<number, { questions: number; correct: number; rows: number }>;
  errors: Record<number, { unresolved: number; improving: number }>;
}

export function buildMastery(
  topicId: number,
  evidence: TopicEvidence,
  lastActivity: Map<number, string>,
  today: string
): TopicMastery {
  const s = evidence.sessions[topicId];
  const a = evidence.attempts[topicId];
  const e = evidence.errors[topicId];
  const last = lastActivity.get(topicId);
  const scored = scoreMastery({
    minutes: s?.minutes ?? 0,
    questions: (s?.questions ?? 0) + (a?.questions ?? 0),
    correct: (s?.correct ?? 0) + (a?.correct ?? 0),
    attemptRows: a?.rows ?? 0,
    unresolvedErrors: e?.unresolved ?? 0,
    improvingErrors: e?.improving ?? 0,
    daysSinceActivity: last ? daysBetween(last, today) : null,
  });
  return { ...scored, sessions: s?.sessions ?? 0 };
}

/* --------------------------- Learning-stage engine --------------------------
   Sequential pipeline with progression locks (§1, §12). Locks guide the
   student; a recorded "I already know this" override unlocks without ever
   claiming the skipped stages were mastered.                                */

export type StageKey = "theory" | "formulas" | "derivations" | "ncert" | "outside" | "test" | "mastery";

export interface StageState {
  key: StageKey;
  label: string;
  state: "done" | "active" | "pending";
  detail: string;
  locked: boolean;
  lockReason: string | null;
}

export interface StageProgressInput {
  theoryDoneAt: string | null;
  derivationsDoneAt: string | null;
  ncertAttempted: number;
  ncertCorrect: number;
  ncertSkipped: number;
  outsideAttempted: number;
  outsideCorrect: number;
  testScore: number | null;
  stageOverride: boolean;
}

export const NCERT_TARGET = 10;
export const OUTSIDE_TARGET = 10;
export const TEST_MIN_PRACTICE = 8;

export function computeStages(
  p: StageProgressInput,
  refs: { formulas: number; derivations: number },
  masteryScore: number,
  hasLesson: boolean
): { stages: StageState[]; currentStage: StageKey } {
  const ov = p.stageOverride;
  const theoryDone = Boolean(p.theoryDoneAt);
  const formulasDone = refs.formulas > 0 && Boolean(p.derivationsDoneAt);
  const derivationsDone = Boolean(p.derivationsDoneAt);
  const ncertDone = p.ncertAttempted >= NCERT_TARGET;
  const outsideDone = p.outsideAttempted >= OUTSIDE_TARGET;
  const testDone = p.testScore != null;
  const practiceCount = p.ncertAttempted + p.outsideAttempted;

  const mk = (
    key: StageKey, label: string, done: boolean, detail: string,
    lockedWhen: boolean, lockReason: string | null, active: boolean
  ): StageState => ({
    key, label,
    state: done ? "done" : active ? "active" : "pending",
    detail,
    locked: !ov && lockedWhen,
    lockReason: !ov && lockedWhen ? lockReason : null,
  });

  const stages: StageState[] = [
    mk("theory", "Theory", theoryDone, theoryDone ? "Covered" : hasLesson ? "Lesson ready" : "Not started", false, null, !theoryDone),
    mk("formulas", "Formulas", refs.formulas > 0 && derivationsDone, `${refs.formulas} recorded`,
      !theoryDone, "Complete Theory first.", theoryDone && !formulasDone),
    mk("derivations", "Derivations / proofs", refs.derivations > 0 && derivationsDone, `${refs.derivations} recorded`,
      !theoryDone, "Complete Theory first.", theoryDone && !derivationsDone),
    mk("ncert", "NCERT questions", ncertDone, `${p.ncertAttempted}/${NCERT_TARGET}${p.ncertAttempted ? ` · ${Math.round((p.ncertCorrect / p.ncertAttempted) * 100)}% correct` : ""}`,
      !theoryDone, "Complete Theory first.", theoryDone && !ncertDone),
    mk("outside", "Outside questions", outsideDone, `${p.outsideAttempted}/${OUTSIDE_TARGET}${p.outsideAttempted ? ` · ${Math.round((p.outsideCorrect / p.outsideAttempted) * 100)}% correct` : ""}`,
      p.ncertAttempted < 5, "Complete at least 5 NCERT questions first.", ncertDone && !outsideDone),
    mk("test", "Topic test", testDone && (p.testScore ?? 0) >= 60, testDone ? `Scored ${Math.round(p.testScore!)}%` : "Not attempted",
      practiceCount < TEST_MIN_PRACTICE, `Complete the required practice first (${practiceCount}/${TEST_MIN_PRACTICE} questions).`, outsideDone && !testDone),
    mk("mastery", "Mastery & revision", masteryScore >= 86, `${masteryScore}/100`, false, null, testDone && masteryScore < 86),
  ];

  const current = stages.find((s) => s.state === "active" && !s.locked) ?? stages.find((s) => s.state !== "done") ?? stages[stages.length - 1];
  return { stages, currentStage: current.key };
}

/** Mastery state machine label (§11). */
export function masteryState(p: StageProgressInput, masteryScore: number, revisionDue: boolean): string {
  if (revisionDue) return "REVISION DUE";
  if (masteryScore >= 86) return "MASTERED";
  if (p.testScore != null) return "TESTING";
  if (p.ncertAttempted + p.outsideAttempted > 0) return "PRACTICING";
  if (p.theoryDoneAt || masteryScore > 0) return "LEARNING";
  return "NOT STARTED";
}
