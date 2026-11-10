# Wikara

A Chrome extension that enhances the Wikipedia reading and research experience, plus a companion marketing website and user dashboard.

## Structure

This is a monorepo managed with npm workspaces:

- `packages/extension` — the Chrome extension (React + Vite + CRXJS, Manifest V3)
- `packages/website` — the marketing site + dashboard (Next.js 14)
- `packages/shared` — TypeScript types and utilities shared by both

Separate from Wikara, and not part of the npm workspaces:

- `daily-limits` — a standalone Chrome extension (plain JavaScript, no build step) that sets daily time limits on distracting sites. See `daily-limits/README.md`.

## Getting started

Install everything from the project root:

```bash
npm install
```

See `PROGRESS.md` for the running build log.
