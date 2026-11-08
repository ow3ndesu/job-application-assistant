import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Application Assistant',
    description:
      'AI-assisted job discovery and application drafting. You review and submit every application yourself.',
    // Least privilege. `storage`: local persistence of settings, profile, jobs
    // and drafts (no install warning). Per-site optional host permissions are
    // added in T04/T05 as needed.
    permissions: ['storage'],
  },
});
