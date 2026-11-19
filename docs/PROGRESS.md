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

The current checkout has no configured OpenAI key. The provider contract was exercised against a local HTTP server and the browser workflow uses the labeled demo provider. For a pilot, run the synthetic live-provider check documented in DEVELOPMENT.md, evaluate model quality, verify actual SMTP delivery and measure latency under the academy's expected load. External deployment and hosted CI for these workspace changes are unverified.

## Subsequent implementation

- Email invitation links retain the requested survey through sign-in.
- Authorized managers can inspect participation and latest email delivery for identified surveys. Anonymous surveys keep aggregate participation.
- Large surveys use bounded OpenAI requests and merge validated evidence references. The contract test covers 130 input comments, three initial requests and one merge request.
- The acceptance runner provisions an isolated Compose project, with separate credentials, volumes, mail and ports, then removes its test resources. The CI workflow invokes the same command.

## Subsequent verification

- Workspace build, lint, typecheck and all eight Node tests passed. The OpenAI HTTP contract test validated a 130-comment batch merge with complete evidence coverage. A live OpenAI call remains pending credentials and explicit provider enablement.
- The application, API, Redis, PostgreSQL and Mailpit ran together locally. The web health proxy and the OpenAPI document returned HTTP 200.
- A local authenticated check made 20 report requests, two concurrently, with 99 ms p95 latency. A new Edge browser context displayed dashboard metrics in 1,729 ms. This small local run does not establish production capacity.
- The first disposable stack failed its PostgreSQL readiness check. A fresh run migrated and seeded successfully and verified named email recipients, reminders and privacy restrictions. Its browser invitation deep link exposed a session-cache subscription issue at sign-in. Login now retains the active session query while clearing role-scoped records.
- Final `pnpm test:acceptance` with Edge exited 0. All five scenarios passed in 24.2 seconds on fresh containers. This covered the emailed survey route after login, the invite roster and its access limits, four delivered invitations and three reminders, theme review, issue resolution and closure, stale-update rejection, updated report counts, CSV and PDF. The runner removed its temporary resources. The main localhost deployment was updated separately.

## Workspace design

The sign-in page and workspace now share a new visual style. The overview groups seven measures into four cards and adds a satisfaction area chart, category score bars and collapsible filters. Mobile navigation supports dismissal with the backdrop or Escape.

### Verification

Web TypeScript, workspace lint and the production web image build passed. All five isolated Playwright acceptance scenarios passed in 28 seconds. Browser checks covered sign-in, the dashboard, dark mode, the survey builder and mobile navigation at a 390px viewport with no horizontal overflow.
