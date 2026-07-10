# Wikara — Build Progress

A running log of what's been built, phase by phase.

---

## Phase 1 — Environment setup

**Status:** ✅ Complete — July 2, 2026

- **1.1** Installed developer tools: Node.js (LTS), Git, GitHub account, VS Code, Chrome.
- **1.2** Created private GitHub repository: <https://github.com/mjmeedia-byte/wikara>
- **1.3** Scaffolded the monorepo with npm workspaces:
  - `packages/extension` — placeholder, built in Phase 2
  - `packages/website` — placeholder, built in Phase 8
  - `packages/shared` — starter TypeScript types (`Plan` type, `APP_VERSION`)
  - Root config: TypeScript strict mode, ESLint (flat config), Prettier
  - `npm install` completed cleanly (0 vulnerabilities)
- **1.4** Created this `PROGRESS.md` and made the first commit: `feat: initial monorepo scaffold`.

### What each tool does (plain language)

- **npm workspaces** — links the three packages so one `npm install` sets them all up at once.
- **TypeScript strict mode** — catches type mistakes before the code runs.
- **ESLint** — flags suspicious or buggy code patterns.
- **Prettier** — auto-formats code to a consistent style.

---

## Phase 2 — Extension scaffold

**Status:** ✅ Complete — July 2, 2026

- **2.1** Turned `packages/extension` into a real Manifest V3 Chrome extension with Vite + CRXJS: manifest (content script on `*://*.wikipedia.org/wiki/*`, background service worker, popup), permissions `storage` / `activeTab` / `scripting`.
- **2.2** Built the sidebar shell, injected into every Wikipedia article inside a shadow root (isolated from Wikipedia's styles): top stripe, header (title, quality badge placeholder, Aa / settings / close), AI / Sources / Reading tabs, footer (Upgrade, version, Settings). Full design system via CSS tokens.
- **2.3** Added the settings shape + defaults to `packages/shared`, and `chrome.storage.local` get/save helpers in the extension.
- **2.4** Built the settings panel (reading presets, theme tiles, font family/size, line height/width sliders, letter spacing, image display, sidebar position). Typography changes apply to the article instantly and persist across reloads.
- **2.5** Loaded the unpacked extension in Chrome, confirmed the sidebar appears and the settings work live.

### Notes

- Color themes (Sepia, Dusk, etc.) and dark mode currently save the choice but don't recolor the article yet — that's built in Phase 4.
- Dev loop: `npm run build:ext` → click ↻ on the Wikara card in `chrome://extensions` → refresh the page.

---

## Phase 3 — Supabase setup

**Status:** ✅ Complete — July 10, 2026

- **3.1** Created the Supabase project (`wikara`).
- **3.2** Added Supabase credentials as environment variables — `.env` (extension) and `.env.local` (website), with `.env.example` templates committed and the real `.env` files gitignored.
- **3.3** Ran the SQL schema: `profiles`, `usage_counters`, `annotations`, `reading_lists`, `reading_list_items`, `reading_history`, `tldr_cache`, plus an auto-profile trigger on signup (saved to `supabase/schema.sql`).
- **3.4** Enabled Row Level Security on every table with per-user policies (saved to `supabase/rls.sql`).
- **3.5** Built email/password auth in the popup (sign up / log in / sign out) using a `chrome.storage.local` session adapter, so the login is shared across popup, sidebar, and background.
- **3.6** Plan checking: the extension reads the user's plan from Supabase, caches it locally, shows it in the popup, and hides "Upgrade to Pro" for pro/team users.
- **Bonus** — a research-backed mascot onboarding flow in the popup (2-question wizard that personalizes reading style), with a custom SVG mascot.

### Deferred (revisit later)

- **Magic-link sign-in** — needs a custom email provider (Supabase gates email-template editing behind Pro). Revisit with e.g. Resend when building the website.
- **Google sign-in** — needs Google Cloud Console OAuth setup; parked for later.

### Known issue

- The repo lives in iCloud-synced `~/Documents`; after a Mac restart iCloud offloads files and builds hang (`ETIMEDOUT`). Workaround: Finder → Download Now on the folder. Proper fix: move the repo out of iCloud.

---

## Next up: Phase 4 — Free features

Typography, dark/sepia modes, focus mode, banner suppression, fixed table of contents, ORES quality badge, edit-history widget, citation status badges + previews, unsourced-claim highlights, citation export, hover previews, and the selection toolbar.
