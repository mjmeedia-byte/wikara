import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// Vite is the build tool. The `crx` plugin (CRXJS) teaches Vite how to
// package everything into a Manifest V3 Chrome extension.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
});
