import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Application Assistant',
    description:
      'AI-assisted job discovery and application drafting. You review and submit every application yourself.',
    // Least privilege: no permissions or host access yet. Later tasks add
    // `storage` (T02) and per-site optional host permissions (T04/T05) as needed.
    permissions: [],
  },
});
