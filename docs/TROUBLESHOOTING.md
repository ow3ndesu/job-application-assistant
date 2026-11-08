# Troubleshooting

## Scanning

| You see                                             | What it means                                                                                                                 | What to do                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "This tab cannot be read…"                          | Chrome doesn't allow extensions on this page (e.g. `chrome://`, the Web Store), or you didn't open the popup from the job tab | Open the job page in a normal tab, click the extension icon **on that tab**, then "Scan this tab" |
| "This site is not in your job sites list"           | The page's site isn't configured                                                                                              | Add it in Settings → Job sites (only OnlineJobs.ph can be read today)                             |
| "… is disabled in Settings → Job sites"             | You turned the site off                                                                                                       | Turn it back on in Settings → Job sites                                                           |
| "This page requires you to log in"                  | The site showed its login page                                                                                                | Log in on the site, then scan again                                                               |
| "The site showed a verification or block page"      | A bot check or block page                                                                                                     | Complete it yourself in the tab, then scan again. The extension never bypasses these              |
| "This page is not a supported job list or job post" | Not a search results page or job post                                                                                         | Open the job search (`/jobseekers/jobsearch`) or a job post                                       |
| "The page layout was not recognised"                | The site may have changed its layout, or you're on a logged-in page we haven't seen                                           | Check Diagnostics in the popup and report it. Nothing was guessed or saved                        |
| "N job(s) did not match your keywords"              | The keyword funnel skipped them                                                                                               | Adjust keywords/exclusions in Settings, then scan again                                           |
| "Limited to N jobs per scan"                        | Your scan limit cut the page short                                                                                            | Raise "Max jobs per scan" in Settings → Scan limits                                               |
| A saved job says "short preview"                    | Search pages show only the start of each description                                                                          | Open the job post and scan it to save the full text                                               |

## AI features (fit check, drafts, suggestions)

| You see                                                       | What it means                                                | What to do                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| "No API key is saved"                                         | No key yet                                                   | Settings → AI provider → paste your Anthropic key → Test key                                                         |
| "The API key was rejected"                                    | Wrong or revoked key                                         | Create a new key in the Claude Console and save it                                                                   |
| "Your Anthropic account has no remaining credits"             | Empty credit balance                                         | Add credits in the Claude Console (Settings → Billing)                                                               |
| "The selected model is not available for this API key"        | Your account can't use that model                            | Pick another model in Settings → AI provider                                                                         |
| "Rate limit reached…" / "temporarily overloaded"              | Too many requests, or Anthropic is busy                      | Wait and try again                                                                                                   |
| "Anthropic rejected the request as invalid"                   | Anthropic refused the request                                | Open "Technical details" under the message (it never contains your key) and report it                                |
| "Could not reach Anthropic"                                   | No internet connection, or a network block                   | Check your connection                                                                                                |
| "Add your applicant profile in Settings…"                     | AI features need a profile                                   | Write or import your profile in Settings → Profile                                                                   |
| A strength is under "Not supported by your profile"           | The AI claimed something your profile doesn't say            | It's not used as a fact. Add it to your profile only if it's true (Improve your profile → "Is this true about you?") |
| "Estimated fit" was capped at 30                              | No strength could be confirmed with your profile's own words | Make your profile more specific                                                                                      |
| "This job post contains text that tries to instruct AI tools" | The posting contains prompt-injection text                   | It was ignored; treat the posting with caution                                                                       |

## Applying

- The extension **never fills in or submits** forms on OnlineJobs.ph. Use **Copy all**, then **Open job post to apply**, and paste the text on the site yourself.
- "Applied: reported by you, unconfirmed": the extension can't see the site; check your messages there.
- Editing a draft that was "Ready to use" withdraws the approval; review and mark it ready again.

## Data

- Everything is stored on this device (unencrypted browser storage). Delete it under Settings → Your data, or remove the extension.
- "Saved data could not be read": use "Reset this section". The unreadable data is set aside (quarantined), not silently deleted.
