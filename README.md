# Pulse

Pulse collects student feedback, groups recurring themes for human review, compares survey ratings and tracks resulting improvements. The primary application is a TypeScript pnpm/Turborepo workspace with Next.js, NestJS, PostgreSQL, Prisma, Redis and BullMQ.

## Start locally

With Node.js 24 and Docker Desktop or Docker Engine, create local credentials once and start the full application:

```sh
node scripts/setup.mjs
docker compose --profile app up --build -d --wait
```

On subsequent starts reuse the existing .env. To run the web and API directly with pnpm 10.32.1 instead, use the following sequence on a fresh checkout:

```sh
pnpm install --frozen-lockfile
node scripts/setup.mjs
docker compose up -d --wait postgres redis mail
pnpm db:migrate
pnpm build
pnpm db:seed
pnpm start
```

Open [Pulse](http://localhost:3100). Use the generated ADMIN_EMAIL and ADMIN_PASSWORD in the local .env. The seeded educational lead is edu@pulse.test and the student is student@pulse.test. Demo users use the generated DEMO_PASSWORD. Local email appears in [Mailpit](http://localhost:58025).

## Repository

| Location | Contents |
| --- | --- |
| apps/web | Next.js App Router, React forms, charts and SCSS Modules |
| apps/api | NestJS REST API, workers, Prisma schema, migrations and seeds |
| packages/shared, packages/config | Shared validation, types, business rules and compiler configuration |
| e2e, test | Browser journeys, API integration and domain checks |
| docker, docker-compose.yml, .github/workflows | Container images, local services and CI |
| src, public | Earlier SQLite edition. Run with npm run legacy:start |

[Development and deployment](docs/DEVELOPMENT.md) · [Architecture and permissions](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Verification and outstanding work](docs/PROGRESS.md)

OpenAI mode uses Chat Completions with strict structured output, application-side reference validation, background retries and human review. It requires a key and explicit external-processing approval. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
