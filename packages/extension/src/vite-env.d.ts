/// <reference types="vite/client" />
/// <reference types="chrome" />

// Types for our environment variables (from packages/extension/.env).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Lets us import a stylesheet as a plain string, e.g.
//   import styles from './sidebar.css?inline';
declare module '*.css?inline' {
  const css: string;
  export default css;
}
