import type { BackgroundRequest, BackgroundResponse } from '@/background/protocol';

/** Sends a request to the background worker. UI pages never call providers directly. */
export async function sendToBackground(request: BackgroundRequest): Promise<BackgroundResponse> {
  try {
    return (await browser.runtime.sendMessage(request)) as BackgroundResponse;
  } catch {
    return {
      ok: false,
      error: { kind: 'internal', message: 'Could not reach the extension background. Try again.' },
    };
  }
}
