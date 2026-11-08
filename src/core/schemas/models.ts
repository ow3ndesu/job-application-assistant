/**
 * Selectable Anthropic models. Source:
 * https://platform.claude.com/docs/en/about-claude/models/overview (checked 2026-11-08).
 * `serverFallback`: whether the request opts into server-side refusal fallback
 * (`fallbacks: "default"`); not supported on Haiku.
 */
export const ANTHROPIC_MODEL_OPTIONS = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5 — most capable (default)',
    serverFallback: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5 — balanced, about half the cost',
    serverFallback: true,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5 — fastest, lowest cost',
    serverFallback: false,
  },
] as const;

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

export function anthropicModelSupportsServerFallback(model: string): boolean {
  return ANTHROPIC_MODEL_OPTIONS.some((m) => m.id === model && m.serverFallback);
}
