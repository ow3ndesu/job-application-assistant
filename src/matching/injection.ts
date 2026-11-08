/**
 * Deterministic detection of instruction-like text aimed at an AI inside
 * untrusted job text. It only flags (the result is shown to the user); the
 * actual protection is the prompt structure plus code-side evidence checks.
 */
const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|system|your)\b[^.\n]{0,20}\b(instructions?|rules?|prompts?|guidelines?)\b/i,
  /\bsystem\s+prompt\b/i,
  /\byou\s+are\s+(now\s+)?(an?\s+)?(ai|assistant|language\s+model|chat\s?gpt|claude|llm)\b/i,
  /\b(as\s+an?\s+)?(ai|llm|language\s+model|assistant)\b[^.\n]{0,30}\b(must|should|need\s+to)\b/i,
  /\b(give|assign|set|rate|score|mark)\b[^.\n]{0,30}\b(score|rating|match|fit)\b[^.\n]{0,20}\b(100|10\/10|maximum|perfect|highest)\b/i,
  /\b(reveal|print|show|output|repeat)\b[^.\n]{0,30}\b(api\s+key|system\s+prompt|instructions|secret)\b/i,
  /<\/?\s*(system|instructions?|assistant|applicant_profile|job_posting)\s*>/i,
  /^\s*(system|assistant)\s*:/im,
];

export function detectInjection(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}
