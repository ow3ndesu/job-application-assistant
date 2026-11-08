import { z } from 'zod';

export const SETTINGS_LIMITS = {
  /** OnlineJobs.ph robots.txt asks for a 5 s delay; use it as the global floor. */
  minRequestDelayMs: 5_000,
  maxRequestDelayMs: 600_000,
  maxJobsPerScan: 200,
} as const;

export const AIProviderIdSchema = z.enum(['anthropic']);

export const SettingsSchema = z.object({
  ai: z.object({
    provider: AIProviderIdSchema,
    /** Model id chosen by the user. Absent = not configured yet (chosen in T04). */
    model: z.string().trim().min(1).max(100).optional(),
  }),
  scan: z.object({
    maxJobsPerScan: z.number().int().min(1).max(SETTINGS_LIMITS.maxJobsPerScan),
    requestDelayMs: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.minRequestDelayMs)
      .max(SETTINGS_LIMITS.maxRequestDelayMs),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return {
    ai: { provider: 'anthropic' },
    // A scan reads one page; an OnlineJobs.ph search page shows 30 jobs, so the
    // default must not cut a full page short (was 25 before T06).
    scan: { maxJobsPerScan: 100, requestDelayMs: SETTINGS_LIMITS.minRequestDelayMs },
  };
}
