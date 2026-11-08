import type { Settings } from '@/core/schemas';
import type { AIProvider } from '@/providers/ai/types';
import { aiError } from '@/providers/ai/types';
import type { Repositories } from '@/storage';
import { BackgroundRequestSchema, type BackgroundResponse } from './protocol';

export interface HandlerDeps {
  repos: Pick<Repositories, 'settings' | 'secrets'>;
  createProvider: (settings: Settings, apiKey: string) => AIProvider;
  /** Origin prefix of this extension's own pages, e.g. chrome-extension://<id>/ */
  extensionOrigin: string;
  timeoutMs?: number;
}

export interface SenderInfo {
  id?: string | undefined;
  url?: string | undefined;
}

/**
 * Handles messages from extension UI pages. Rejects anything from content
 * scripts or other extensions: AI calls use the user's key and must only be
 * triggered from the extension's own pages.
 */
export function createBackgroundHandler(deps: HandlerDeps) {
  return async function handle(
    message: unknown,
    sender: SenderInfo,
    ownId: string,
  ): Promise<BackgroundResponse> {
    if (sender.id !== ownId || !sender.url?.startsWith(deps.extensionOrigin)) {
      return { ok: false, error: { kind: 'unauthorized_sender', message: 'Request not allowed.' } };
    }
    const parsed = BackgroundRequestSchema.safeParse(message);
    if (!parsed.success) {
      return { ok: false, error: { kind: 'bad_message', message: 'Unknown request.' } };
    }

    try {
      switch (parsed.data.type) {
        case 'ai/validate-key': {
          const apiKey = await deps.repos.secrets.getAnthropicApiKeyForProvider();
          if (!apiKey) return { ok: false, error: aiError('missing_key') };
          const provider = deps.createProvider(await deps.repos.settings.get(), apiKey);
          const result = await provider.validateCredentials(
            AbortSignal.timeout(deps.timeoutMs ?? 30_000),
          );
          return result.ok
            ? { ok: true, model: result.value.model }
            : { ok: false, error: { kind: result.error.kind, message: result.error.message } };
        }
      }
    } catch {
      return {
        ok: false,
        error: { kind: 'internal', message: 'Something went wrong. Try reloading the extension.' },
      };
    }
  };
}
