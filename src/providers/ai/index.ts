import { DEFAULT_ANTHROPIC_MODEL, type Settings } from '@/core/schemas';
import { AnthropicProvider } from './anthropic/AnthropicProvider';
import type { AIProvider } from './types';

export * from './types';

/** The only place that knows which concrete provider backs a setting. */
export function createAIProvider(settings: Settings, apiKey: string): AIProvider {
  switch (settings.ai.provider) {
    case 'anthropic':
      return new AnthropicProvider({
        apiKey,
        model: settings.ai.model ?? DEFAULT_ANTHROPIC_MODEL,
      });
  }
}
