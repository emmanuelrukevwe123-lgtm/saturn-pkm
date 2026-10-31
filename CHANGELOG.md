# Changelog

## Unreleased — React migration and security pass

- Rebuilt the app in React with Vite. Rules, persistence, backup and sync stay plain, tested modules in `src/lib`; data formats and storage keys are unchanged.
- Bundled Firebase from npm instead of loading it from a CDN at runtime, and removed that CDN from the Content Security Policy.
- Security: pasted and dropped content enters notes as plain text; backups accept only image files for images and valid ids; "Delete forever" erases content and tells other devices; AI tokens must be RS256; auth pages no longer get anti-framing headers meant for the app, and `apis.google.com` is allowed for Google sign-in; added HSTS, a cross-origin opener policy and `no-store` on the API.
- Dependencies: production has no known vulnerabilities; upgraded Vite, Vitest, Firebase and firebase-tools.
- Fixed: links to titles containing `&`, quotes or `*`; deleted notes returning through sync; restored notes being deleted again by sync; welcome notes returning after being deleted; failed saves leaving the screen out of step with storage; "Replace" imports deleting other accounts' images; the import message vanishing; screens opened right after loading being forgotten on refresh; project names fighting the cursor; image tokens being sent to AI by Summarize; a last AI line being dropped; white drag handles in dark mode; note and project rows and kanban cards not working from the keyboard.

## Unreleased — Saturn HQ

- Phase 1: schema v3 adds project stages, categories, next step, done-when, links, session log and this-week tasks, plus HQ review dates. Old data loads unchanged with defaults; new fields round-trip through `.saturn` backups. All rules live in `public/modules/hq.js`.
- Phase 2: new Orbit screen (two-slot limit, this week's 3 tasks, Park an idea, all-projects columns, starter projects) and a project header on the Planner board (next step, done when, links, session log, stage buttons, drop-with-reason dialog).
- Phase 3: learning tracks (stored, backed up and synced), the four-step weekly review, a monthly Parked review, and an Orbit section in the usage guide.

## Unreleased — production hardening

- Added schema-v2 migration, UUIDs, atomic persistence, storage-full recovery, unique titles, and atomic wiki-link rewrites.
- Added full `.saturn` backup/restore with validation, merge/replace modes, images, and rollback.
- Added cross-tab conflict preservation and accessible Data & Sync, graph, editor, task-dialog, and keyboard-kanban experiences.
- Added revisioned Firebase sync, tombstones, conflict copies, image Storage/cache support, owner-only rules, and a rollout flag.
- Hardened AI with verified-email allowlisting, Upstash rate limits, payload limits, timeout/cancellation, and security headers.
- Added Node pinning, lint, Vitest, Firebase rules tests, Playwright/axe coverage, and CI.
