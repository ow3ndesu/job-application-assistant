import type { Secrets } from '@/core/schemas';
import type { SingletonRepository } from './singleton-repository';

/**
 * BYOK provider credentials.
 *
 * UI code should only use `hasAnthropicApiKey` / `setAnthropicApiKey` /
 * `clearAnthropicApiKey`. Reading the key back (`getAnthropicApiKeyForProvider`)
 * belongs in the background provider layer (T04). Never pass it to content
 * scripts, the DOM, or logs.
 */
export class SecretsRepository {
  constructor(private readonly secrets: SingletonRepository<Secrets>) {}

  async hasAnthropicApiKey(): Promise<boolean> {
    return (await this.secrets.get()).anthropicApiKey !== undefined;
  }

  async setAnthropicApiKey(key: string): Promise<void> {
    await this.secrets.update((s) => ({ ...s, anthropicApiKey: key }));
  }

  async clearAnthropicApiKey(): Promise<void> {
    await this.secrets.update((s) => {
      const next = { ...s };
      delete next.anthropicApiKey;
      return next;
    });
  }

  /** For the background provider layer only. */
  async getAnthropicApiKeyForProvider(): Promise<string | undefined> {
    return (await this.secrets.get()).anthropicApiKey;
  }

  recover(): Promise<string | undefined> {
    return this.secrets.recover();
  }
}
