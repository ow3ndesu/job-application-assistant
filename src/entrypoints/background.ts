import { createBackgroundHandler } from '@/background/handler';
import { createAIProvider } from '@/providers/ai';
import { getRepositories } from '@/storage';

// Background service worker: the only context that reads the API key and calls
// the AI provider. Nothing runs here until a UI page sends a request.
export default defineBackground(() => {
  const handle = createBackgroundHandler({
    repos: getRepositories(),
    createProvider: createAIProvider,
    extensionOrigin: browser.runtime.getURL('/'),
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handle(message, sender, browser.runtime.id).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});
