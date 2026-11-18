# Implementation checkpoint

## Current phase
Phase 8 local deployment and acceptance verified on 2026-11-19. The original workspace contained a separate SQLite edition. The PostgreSQL application lives in apps/api, apps/web and packages.

## Completed implementation
1. pnpm workspace, pinned package manager, lockfile, strict TypeScript, Turbo, ESLint, Prettier, shared schemas and CI.
2. PostgreSQL domain schema, two migrations, idempotent seeds, scrypt password hashes, JWT bearer access, rotating HttpOnly refresh sessions, role and resource-level guards.
3. Survey drafts, ordering, target groups, immutable published configuration, atomic submission and anonymity constraints. BullMQ scheduling, SMTP and a notification outbox.
4. Strict structured OpenAI output, reference validation, distinct response counts, separate demo mode and explicit human review.
5. Sample thresholds, canonical questions, weighted scores, date filters, group/lecturer comparisons and follow-up.
6. Issue ownership, priority, deadlines, transitions, comments, links and version-checked history.
7. Next.js pages, accessible controls, filters, CSV export, printable reports, light/dark modes and responsive layout.
8. Docker images, full-stack Compose profile, local SMTP inbox, health checks and a PostgreSQL backup command that preserves existing archives.

## Executed checks

| Command or check | Observed result |
| --- | --- |
| pnpm build | All three workspace builds succeeded. The final host run reused Turbo artifacts. |
| pnpm lint and pnpm typecheck | Both exited successfully. |
| pnpm test | Eight passed. Four exercise the PostgreSQL edition's shared rules and AI adapter, and four cover the earlier SQLite edition. |
| docker compose --profile app up --build -d --wait | Both application images built. Web, API, PostgreSQL, Redis and Mailpit reported healthy. |
| PostgreSQL migration ledger | Both initial schema and domain constraint migrations finished. Startup seed completed. |
| HTTP requests | Login, the API documentation and the health endpoint through the Next.js proxy returned 200. |
| pnpm e2e with Edge | Five passed in 24.1 seconds against the Compose deployment. |
| pnpm db:backup | Produced a custom-format archive. A separate disposable PostgreSQL 17 instance restored it with pg_restore --exit-on-error and returned two completed migrations. |

The browser journey created a course and a group, published a survey, recorded student submissions, reviewed and published a demo theme, created its issue and recorded a lecturer's status update. The director's report showed three responses from four invitations, one open issue, CSV download and printable PDF output. Routing from a published theme now carries its survey and theme into the issue form during client-side navigation.

The job and API checks covered scheduled delivery to Mailpit, reminder exclusion for completed students, deadline and duplicate rejection, identity separation in PostgreSQL, closed-survey publication, optional rating suppression below the minimum, historical decline and subsequent-survey follow-up. Access checks covered refresh rotation, logout, role-change revocation, restricted lecturer access and cross-domain issue owner permissions. Runs created uniquely named acceptance fixtures in the local demo database.

## Operational boundaries
No production OpenAI key was supplied. The provider contract was exercised against a local HTTP server; the full browser workflow used the labeled demo provider. Live model quality, external SMTP deliverability, production load targets and hosted CI remain unverified. The current real provider sends one request per survey analysis, so its capacity is bounded by the configured model's context window. Next acceptance work for a hosted pilot is a live-provider smoke test with approved synthetic input, provider-quality evaluation, production SMTP verification and representative load testing. Deployment instructions and required settings are in DEVELOPMENT.md. No external deployment was performed.
