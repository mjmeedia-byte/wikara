import { defineManifest } from '@crxjs/vite-plugin';

// The manifest is the extension's "ID card": it tells Chrome the name,
// what code to run where, and what permissions the extension needs.
export default defineManifest({
  manifest_version: 3,
  name: 'Wikara',
  version: '0.1.0',
  description: 'A better way to read and research on Wikipedia.',
  action: {
    default_title: 'Wikara',
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      // Run on every Wikipedia article page.
      matches: ['*://*.wikipedia.org/wiki/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['https://*.supabase.co/*'],
});
