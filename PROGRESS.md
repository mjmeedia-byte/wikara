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

## Next up: Phase 3 — Supabase setup

Accounts and database: create the Supabase project, add environment variables, run the schema, set up Row Level Security, and add sign-in to the extension.
