/**
 * Selectable Anthropic models. Source:
 * https://platform.claude.com/docs/en/about-claude/models/overview (checked 2026-11-08).
 * T04 should check these against `GET /v1/models` before relying on them.
 */
export const ANTHROPIC_MODEL_OPTIONS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — balanced (recommended)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — fastest, lowest cost' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — most capable, higher cost' },
] as const;

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
