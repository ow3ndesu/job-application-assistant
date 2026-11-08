import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Application Assistant',
    description:
      'AI-assisted job discovery and application drafting. You review and submit every application yourself.',
    // Least privilege, no install warnings:
    //  - storage: local persistence of settings, profile, jobs and drafts.
    //  - activeTab + scripting: read the job page the user is looking at, only
    //    after they click the extension on that tab. No host permissions; no
    //    always-on content scripts; no background fetching of job sites.
    // The Anthropic API is reached via CORS and needs no host permission (verified in T04).
    permissions: ['storage', 'activeTab', 'scripting'],
    // Stricter than the MV3 default: only bundled scripts, no plugins/frames/
    // forms, no <base> tricks, and network access limited to the extension
    // itself and the Anthropic API. Defence in depth against data exfiltration.
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'self' https://api.anthropic.com",
    },
    // Test builds only (E2E_HOST_ACCESS=1): headless Chrome cannot click the
    // toolbar icon to grant activeTab, so the end-to-end test grants host access
    // instead. Never set for release builds.
    ...(process.env.E2E_HOST_ACCESS === '1'
      ? { host_permissions: ['https://www.onlinejobs.ph/*'] }
      : {}),
  },
});
