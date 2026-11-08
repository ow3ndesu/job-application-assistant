import { z } from 'zod';

/**
 * Provider credentials (BYOK). Stored under their own storage key, separate from
 * settings, so they can be cleared on their own and are never exported with
 * settings. `storage.local` is unencrypted on disk; this is disclosed in the UI.
 */
export const SecretsSchema = z.object({
  anthropicApiKey: z.string().min(1).max(500).regex(/^\S+$/).optional(),
});

export type Secrets = z.infer<typeof SecretsSchema>;

export function emptySecrets(): Secrets {
  return {};
}
