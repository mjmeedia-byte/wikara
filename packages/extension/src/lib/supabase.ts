import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Supabase normally stores the login session in localStorage, which we can't use
// in an extension. This adapter stores it in chrome.storage.local instead, so the
// popup, background worker, and content script all share one session.
const chromeStorage = {
  getItem: (k: string) => chrome.storage.local.get(k).then((r) => (r[k] as string | undefined) ?? null),
  setItem: (k: string, v: string) => chrome.storage.local.set({ [k]: v }),
  removeItem: (k: string) => chrome.storage.local.remove(k),
};

export const supabase = createClient(url, key, {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No URL-based session detection — that's a website thing, not an extension thing.
    detectSessionInUrl: false,
  },
});
