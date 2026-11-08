# Privacy policy (draft)

_Applies to the Job Application Assistant browser extension. Draft prepared 2026-11-08; review before publishing. Keep in sync with the in-app "Privacy & permissions" section and `wxt.config.ts`._

## Summary

- The extension has **no server of its own**, collects **no analytics**, and shows **no ads**.
- Your data stays in your browser, except what you choose to send to **Anthropic** when you click an AI action, using **your own API key**.
- You can delete your data at any time.

## What the extension stores (on your device only)

Stored in Chrome's extension storage (`chrome.storage.local`) for your browser profile:

| Data                                         | Why                                                                |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Settings, job sites, keywords, scan limits   | To run scans the way you configured them                           |
| Your applicant profile and previous versions | To check fit, draft applications, and let you restore old versions |
| Saved jobs and scan history                  | So you can browse jobs you scanned                                 |
| Fit checks                                   | To show estimated fit and its evidence                             |
| Application drafts and their status          | So you can edit, copy, and track applications                      |
| Profile suggestions and your decisions       | To review and apply profile changes                                |
| Your Anthropic API key                       | To call Anthropic on your behalf                                   |

This storage is **not encrypted** by Chrome. Anyone with access to your computer account may be able to read it. Use an API key you can revoke.

## What the extension reads

Only the page in a tab where **you** click the extension icon and press "Scan this tab" (Chrome's `activeTab` permission). It reads the page text; it does not click, fill in, or submit anything, and it does not read other tabs, your history, or other websites. It never visits job sites in the background.

## What is sent, to whom, and when

Data is sent **only to Anthropic** (`api.anthropic.com`), **only when you click** an AI action, using your API key:

| Action                    | Sent                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test key                  | Your key and the selected model name                                                                                                                           |
| Check fit                 | The job's text and your current profile                                                                                                                        |
| Draft application         | The job's text, your profile, and your non-sensitive application questions (sensitive questions such as salary, ID, health, legal declarations are never sent) |
| Suggest profile additions | Your profile and the text you typed                                                                                                                            |

Your API key is never sent anywhere except Anthropic. The extension's Content Security Policy blocks network requests to any other server. Anthropic's own terms and privacy policy apply to data you send through its API.

## Limited Use

The use of information received from the Chrome APIs (page content you scan, and data you store) adheres to the Chrome Web Store User Data Policy, including the **Limited Use** requirements:

- Data is used only to provide the extension's single purpose: helping you find relevant jobs and prepare truthful applications that you review and submit yourself.
- Data is not sold, not used for advertising, not used to determine creditworthiness, and not transferred to anyone except Anthropic as described above, at your request.
- Nobody (including the developer) reads your data; it never reaches the developer at all.

## Your choices and deletion

- **Settings → Your data**: delete the profile (and its versions and suggestions), saved jobs (with fit checks and scan history), drafts, settings, the API key, or everything.
- Removing the extension deletes all of its stored data.
- Revoke your API key at any time in the Claude Console.

## Contact

_Add a contact address before publishing._
