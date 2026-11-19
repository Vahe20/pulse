# Architecture

The Next.js App Router serves a React client and proxies same-origin /api/v1 requests to one NestJS process. PostgreSQL stores the domain state. Redis and BullMQ retain scheduled work. Nest starts the job worker and HTTP listener together. Prisma transactions handle edits, participation and audit history. TanStack Query caches role-scoped data in memory. Sign-out clears the query cache. No browser persistence contains credentials.

| Boundary | Responsibility |
| --- | --- |
| auth, core | Password verification, rotating sessions, guards and validation |
| directory | Staff and student accounts, membership, reference data and system settings |
| surveys, jobs | Draft configuration, published audience snapshots, invitations, submission and delivery |
| ai | Provider invocation, validated supporting references and review |
| analytics, issues | Scoped aggregates, comparison rules, assignments, links and change history |
| packages/shared | Contracts and rules shared by TypeScript clients and services |

## Permission matrix

| Role | Reach |
| --- | --- |
| Student | Own survey invitations, submission, own notifications |
| Lecturer | Own teaching surveys and published results, status and comments on assigned issues for those surveys |
| Edu Lead | Survey management, review and publication of analysis, educational issues, cross-cohort reports |
| Admin Lead | Published survey analysis and reports, administrative and technology issues |
| Director | Organization reports and issue management |
| System Admin | Directory, settings, survey management, review, all issues and reports |

Refresh cookies are HttpOnly and SameSite Strict. Cookie-authenticated endpoints require the client header and reject an unexpected browser Origin. The bearer access token expires after ten minutes and is checked against the live session on each request. Refresh rotates the stored token digest. Logout invalidates the session. Terminate TLS at the reverse proxy and enable Secure cookies for public access.

New work is persisted before scheduling. Unique constraints protect invitation, notification and analysis creation. BullMQ retries transient failures with exponential backoff. Each SMTP notification has a stable Message-ID. A crash after the SMTP server accepts mail but before database acknowledgement can deliver a duplicate message.

External analysis requires an explicit data-sharing setting, a configured model and a key. Requests carry redacted free text and temporary reference numbers. Model references are checked against the input. Mention counts use distinct submission IDs. Reviewers see theme aggregates. Model confidence is an uncalibrated estimate. Free text can still disclose personal information through context. The operator must establish appropriate provider and retention arrangements. Development mode selects a labeled demo provider.

The earlier SQLite edition has its own database, service and tests. There is no automatic import from it. The PostgreSQL edition starts from migrations and explicit seeding.

The OpenAI adapter partitions comments by encoded byte size and count. It combines theme descriptors in bounded requests and expands their references back to the original evidence locally. Merge requests must partition all input descriptors. If successive rounds cannot reduce a large collection of distinct themes, their validated thematic descriptions form the summary. Each request has a timeout. BullMQ retries at job level, so a retry can repeat provider calls from earlier batches.
