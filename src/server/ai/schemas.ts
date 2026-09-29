import { z } from "zod";

/**
 * Structured-output contracts. The LLM proposes evidence/metadata;
 * the deterministic backend validates before anything touches the DB.
 */

/* ------------------------------ Tutor meta block ----------------------------- */

export const EvalSchema = z.object({
  topic_id: z.number().int().nullable().catch(null),
  subject_id: z.number().int().nullable().catch(null),
  question: z.string().min(1).max(8000),
  student_answer: z.string().max(8000).default(""),
  correct: z.boolean(),
  score: z.number().min(0).max(10),
  max_score: z.number().min(1).max(10).default(5),
  feedback: z.string().max(2000).default(""),
  error_tag: z.string().max(60).nullable().catch(null),
  error_detail: z.string().max(1000).nullable().catch(null),
});
export type EvalPayload = z.infer<typeof EvalSchema>;

export const ErrorLogSchema = z.object({
  tag: z.string().min(1).max(60),
  detail: z.string().min(1).max(1000),
  topic_id: z.number().int().nullable().catch(null),
  subject_id: z.number().int().nullable().catch(null),
});

export const NextActionSchema = z.object({
  type: z.enum(["continue", "practice", "revise", "diagnose", "review_mistake", "move_on", "return_prerequisite"]),
  label: z.string().min(1).max(200),
});

export const ReplyMetaSchema = z.object({
  action: z.string().max(30).default("other"),
  evaluation: EvalSchema.nullable().catch(null).default(null),
  error_log: z.array(ErrorLogSchema).max(3).catch([]).default([]),
  next_action: NextActionSchema.nullable().catch(null).default(null),
});
export type ReplyMeta = z.infer<typeof ReplyMetaSchema>;

/** Strip and validate the trailing ```meta fenced block (accepts optional id/attrs). */
export function parseReply(content: string): { text: string; meta: ReplyMeta | null } {
  const fence = content.match(/```meta[^\n`]*\n([\s\S]*?)```\s*$/);
  const tryParse = (raw: string): ReplyMeta | null => {
    try {
      const json: unknown = JSON.parse(raw);
      const parsed = ReplyMetaSchema.safeParse(json);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  if (fence) {
    return { text: content.slice(0, fence.index).trim(), meta: tryParse(fence[1]) };
  }
  const idx = content.lastIndexOf('{"action"');
  if (idx > 0) {
    const meta = tryParse(content.slice(idx));
    if (meta) return { text: content.slice(0, idx).trim(), meta };
  }
  return { text: content.trim(), meta: null };
}

/* ---------------------------- Standalone diagnostic --------------------------- */

export const DiagnosticSchema = z.object({
  correct: z.boolean(),
  score: z.number().min(0).max(10),
  maxScore: z.number().min(1).max(10).default(5),
  conceptUnderstanding: z.enum(["weak", "partial", "strong"]).default("partial"),
  methodCorrect: z.boolean().default(false),
  calculationCorrect: z.boolean().nullable().catch(null).default(null),
  unitCorrect: z.boolean().nullable().catch(null).default(null),
  primaryMisconception: z.string().max(80).nullable().catch(null),
  feedback: z.string().min(1).max(2000),
  marksBreakdown: z.string().max(500).default(""),
  recommendedAction: z.enum(["practice", "revise", "learn", "move_on"]).default("practice"),
  confidence: z.number().min(0).max(1).default(0.5),
  errorTag: z.string().max(60).nullable().catch(null),
});
export type DiagnosticResult = z.infer<typeof DiagnosticSchema>;

export function validateDiagnostic(content: string): DiagnosticResult | null {
  // tolerate leading prose — find the JSON object
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = DiagnosticSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* ------------------------------ Question sets -------------------------------- */

export const QuestionSchema = z.object({
  question: z.string().min(3).max(4000),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  concepts: z.array(z.string().max(60)).max(6).catch([]).default([]),
  expectedMethod: z.string().max(1200).default(""),
  answer: z.string().max(4000).default(""),
  explanation: z.string().max(2000).default(""),
});
export type GeneratedQuestion = z.infer<typeof QuestionSchema>;

export const QuestionSetSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(10),
});
export type QuestionSet = z.infer<typeof QuestionSetSchema>;

export function validateQuestionSet(content: string): QuestionSet | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = QuestionSetSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Call-with-retry for critical structured routes:
 * validate → on failure, one corrective retry → safe error if still invalid.
 */
export async function withStructuredRetry<T>(
  makeMessages: (fixNote: string | null) => { role: "system" | "user" | "assistant"; content: string }[],
  validate: (content: string) => T | null,
  callLlm: (msgs: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<{ content: string } | { error: string }>
): Promise<{ data: T } | { error: string }> {
  let fixNote: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callLlm(makeMessages(fixNote));
    if ("error" in res) return { error: res.error };
    const data = validate(res.content);
    if (data) return { data };
    fixNote = "Your previous reply could not be parsed as the required JSON. Reply with ONLY the JSON object — no prose, no code fences.";
  }
  return { error: "AI returned invalid structured output twice" };
}
