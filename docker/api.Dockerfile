FROM node:24-bookworm-slim AS workspace
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/* && npm install --global pnpm@10.32.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/api apps/api
COPY scripts/env.mjs scripts/env.mjs
RUN pnpm turbo build --filter=@pulse/api
USER node
CMD ["sh","-c","pnpm db:migrate && pnpm db:seed && exec node apps/api/dist/main.js"]
