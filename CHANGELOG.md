# Changelog

## Unreleased — Saturn HQ

- Phase 1: schema v3 adds project stages, categories, next step, done-when, links, session log and this-week tasks, plus HQ review dates. Old data loads unchanged with defaults; new fields round-trip through `.saturn` backups. All rules live in `public/modules/hq.js`.

## Unreleased — production hardening

- Added schema-v2 migration, UUIDs, atomic persistence, storage-full recovery, unique titles, and atomic wiki-link rewrites.
- Added full `.saturn` backup/restore with validation, merge/replace modes, images, and rollback.
- Added cross-tab conflict preservation and accessible Data & Sync, graph, editor, task-dialog, and keyboard-kanban experiences.
- Added revisioned Firebase sync, tombstones, conflict copies, image Storage/cache support, owner-only rules, and a rollout flag.
- Hardened AI with verified-email allowlisting, Upstash rate limits, payload limits, timeout/cancellation, and security headers.
- Added Node pinning, lint, Vitest, Firebase rules tests, Playwright/axe coverage, and CI.
