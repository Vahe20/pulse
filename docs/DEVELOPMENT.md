# Development and operations

Use Node.js 24 and pnpm 10.32.1. On Windows PowerShell use pnpm.cmd when script execution policy blocks the .ps1 shim. Run commands at the repository root.

```sh
pnpm install --frozen-lockfile
node scripts/setup.mjs
docker compose up -d --wait postgres redis mail
pnpm db:migrate
pnpm build
pnpm db:seed
pnpm dev
```

The setup script exclusively creates .env with fresh random database and login secrets. Keep existing files for subsequent starts. The dev command starts the Next.js and NestJS watchers. For a local production run, use `pnpm start`: Turbo builds each application and its dependencies before starting it, reusing current builds from cache. After pulling changes, restart the command to serve the new version. The UI is at http://localhost:3100, the API on 4100, and the Mailpit inbox at http://localhost:58025. Use localhost consistently to match WEB_ORIGIN.

The administrator uses ADMIN_EMAIL and ADMIN_PASSWORD. In local demo mode use DEMO_PASSWORD for edu@pulse.test, ops@pulse.test, lecturer@pulse.test, director@pulse.test and student@pulse.test. Seeds include two historical surveys and a follow-up with a new invitation. Re-running the seed preserves existing records.

| Environment | Purpose |
| --- | --- |
| DATABASE_URL, POSTGRES_PASSWORD | PostgreSQL connection and local Compose database bootstrap |
| JWT_SECRET | Random signing key, at least 32 characters |
| ADMIN_EMAIL, ADMIN_PASSWORD | First system administrator, password at least 12 characters |
| DEMO_MODE, DEMO_PASSWORD | Explicit synthetic development dataset and labeled demo analysis |
| REDIS_HOST, REDIS_PORT | BullMQ connection |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_TLS, MAIL_FROM | Notification transport and sender. Local Compose uses Mailpit. SMTP_TLS selects implicit TLS |
| WEB_ORIGIN, SECURE_COOKIES | Browser origin and HTTPS refresh-cookie policy |
| API_ORIGIN, API_PORT | Next.js build-time reverse-proxy destination and API listener port |
| OPENAI_API_KEY, OPENAI_MODEL, ALLOW_EXTERNAL_AI | Provider credentials, model and explicit permission for external analysis |

## Tests

To exercise the complete Docker deployment on a workstation, install dependencies, build once for the local Prisma test client, install a Playwright browser, then run `pnpm test:acceptance`. On Windows with Edge installed use `$env:PULSE_BROWSER_CHANNEL='msedge'`. This command needs Docker Compose 2.24.4 or later for port overrides. It builds both images, provisions a separate database, queue and mail inbox with generated credentials and runs the browser/API suite on available ports. The runner removes its own containers and volumes on exit. Your local instance can keep running throughout the test.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm e2e
```

Run E2E against a dedicated seeded development database and Mailpit. The suite creates uniquely named fixtures. For installed Microsoft Edge, set PULSE_BROWSER_CHANNEL=msedge. Playwright can start the built servers when their ports are free. CI provisions the services and runs these checks on Linux.

For a live provider smoke test, set OPENAI_API_KEY, OPENAI_MODEL and ALLOW_EXTERNAL_AI=true and run `node --env-file=.env scripts/check-ai.mjs` after building. This sends three synthetic comments through the production adapter and validates its structured response. Review the returned theme titles and references to judge semantic grouping. A live request uses the configured provider account and incurs its usual charges.

## Container deployment

To apply a frontend-only update to a running Compose deployment, run `git pull --ff-only` in the deployment checkout and then `docker compose --profile app up -d --build --no-deps --wait web`.

```sh
docker compose --profile app up --build -d --wait
```

The API container applies migrations and runs the idempotent seed at startup. Compose uses internal service names and publishes the web port on loopback. To move to an actual installation, use a fresh database, set DEMO_MODE=false, provision production secrets and SMTP credentials, set WEB_ORIGIN to the public HTTPS origin and SECURE_COOKIES=true, and terminate TLS in a reverse proxy. The supplied Mailpit transport is for development. Set COMPOSE_SMTP_HOST and COMPOSE_SMTP_PORT to override the container transport address. Set SMTP_USER, SMTP_PASS and SMTP_TLS according to the delivery service. Set ALLOW_EXTERNAL_AI=true only after approving data sharing with the configured provider. Store credentials in deployment secrets. PostgreSQL and Redis data use named volumes. Scale and test storage, backups and SMTP capacity for the intended academy workload.

Set NODE_ENV=production in the API environment for a public installation. The API checks the HTTPS origin, secure cookies and demo setting at startup. Run `pnpm db:backup <new-file.dump>` to export the Compose database. See DATABASE.md for restore instructions.

`docker compose stop` stops services and retains volumes. The legacy SQLite edition has its own instructions in LEGACY.md.
