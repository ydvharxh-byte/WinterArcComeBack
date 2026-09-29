/**
 * Internal intent classification — deterministic, zero AI calls.
 * The student never chooses an "agent"; the orchestrator silently routes
 * the request by combining the session mode with lexical signals.
 */

export type Intent =
  | "teach"
  | "explain"
  | "solve"
  | "diagnose"
  | "practice"
  | "generate_questions"
  | "evaluate"
  | "revise"
  | "plan"
  | "backlog"
  | "progress"
  | "next_action"
  | "chat";

export interface Classification {
  intent: Intent;
  stageLabel: string; // subtle UI state, no agent jargon
}

const RULES: { intent: Intent; label: string; pattern: RegExp }[] = [
  { intent: "evaluate", label: "Checking your answer…", pattern: /(check|mark|grade|evaluate).*(answer|working|solution)|is (this|my answer) (right|correct)|paste.*answer/i },
  { intent: "diagnose", label: "Analyzing your mistake…", pattern: /(my mistake|wh(at|ere) (did|am) i (go|going) wrong|what'?s wrong|find (the|my) error)/i },
  { intent: "generate_questions", label: "Building practice…", pattern: /(quiz me|question(s)? (please|for me|set)|give me (a|some|more) (practice )?question|test me|exam-style|revise)/i },
  { intent: "plan", label: "Updating your study plan…", pattern: /(plan|schedule|timetable|what should i (do|study) (today|next|now))/i },
  { intent: "backlog", label: "Reviewing your backlog…", pattern: /(backlog|catch up|behind (on|in) (syllabus|studies))/i },
  { intent: "progress", label: "Reading your progress…", pattern: /(my progress|how am i doing|weak topics|improvement( so far)?)/i },
  { intent: "solve", label: "Working through it…", pattern: /(solve|calculate|find the value|prove|show (full )?(working|steps)|full solution)/i },
  { intent: "teach", label: "Teaching…", pattern: /(teach me|i don'?t understand|explain( simpler| from scratch)?|new topic|what is|how does .*(work|happen))/i },
  { intent: "revise", label: "Preparing revision…", pattern: /(i forgot|keep forgetting|forgotten (again)?)/i },
];

const MODE_INTENT: Record<string, Intent> = {
  teach: "teach",
  practice: "generate_questions",
  examine: "evaluate",
  plan: "plan",
};

export function classifyIntent(text: string, sessionMode: string): Classification {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { intent: rule.intent, stageLabel: rule.label };
  }
  const mapped = MODE_INTENT[sessionMode];
  if (mapped) {
    const def = RULES.find((r) => r.intent === mapped);
    return { intent: mapped, stageLabel: def?.label ?? "Thinking…" };
  }
  return { intent: "chat", stageLabel: "Thinking about your data…" };
}

/** Behavioral hints injected for the classified intent — one prompt, internal routing. */
export function intentGuidance(intent: Intent): string {
  switch (intent) {
    case "evaluate":
      return "The student submitted an answer for marking. Score it against concept, method, steps, calculation, units, and final answer. Be a fair CBSE examiner: correct science scores even with different wording. Fill the meta evaluation block.";
    case "diagnose":
      return "The student can't see their mistake. Do NOT restate the full solution. Isolate the exact step where reasoning broke, name the misconception plainly, and run one targeted check question.";
    case "generate_questions":
      return "Generate ONE question at a time, tuned to their mastery band and any active misconception. Wait for the answer; evaluate before the next question. Never reveal the expected answer unprompted.";
    case "plan":
      return "Use only the real topics/mastery/exams in the student state. Give a short prioritized list with reasons. The app scheduler computes times — you rank and justify.";
    case "backlog":
      return "Assess backlog against exam dates and likely daily capacity. Be honest if the target date is unrealistic; protect sleep, school work and revision. Prioritize highest-impact topics.";
    case "progress":
      return "Summarize from the numbers: mastery scores, attempt accuracy, misconceptions, revision state. No invented praise or shame — cite evidence.";
    case "solve":
      return "Solve step by step with formulas, substitutions and units. If useful, end with one variation question to test transfer.";
    case "teach":
      return "Teach in small steps: prerequisite → intuition → one concrete example → one check question. Wait for the answer. Scale depth to their mastery band, not the textbook.";
    case "revise":
      return "Confidence decay is suspected. Run 2–3 quick recall questions before re-teaching anything; only explain what the recall actually missed.";
    default:
      return "Answer the student directly and briefly, keeping their mastery and mistakes in mind.";
  }
}
