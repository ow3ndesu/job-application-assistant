import type { BackgroundRequest, ResponseFor } from '@/background/protocol';

/** Sends a request to the background worker. UI pages never call providers directly. */
export async function sendToBackground<R extends BackgroundRequest>(
  request: R,
): Promise<ResponseFor<R['type']>> {
  try {
    return (await browser.runtime.sendMessage(request)) as ResponseFor<R['type']>;
  } catch {
    return {
      ok: false,
      error: { kind: 'internal', message: 'Could not reach the extension background. Try again.' },
    };
  }
}
