import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    actionTimeout: 20000,
    baseURL: process.env.WEB_ORIGIN || "http://localhost:3100",
    channel: process.env.PULSE_BROWSER_CHANNEL || undefined,
  },
  webServer:
    process.env.PULSE_E2E_EXTERNAL === "true"
      ? undefined
      : [
          {
            timeout: 180000,
            stdout: "pipe",
            stderr: "pipe",
            command: "node apps/api/dist/main.js",
            url: "http://127.0.0.1:4100/api/v1/health",
            reuseExistingServer: !process.env.CI,
          },
          {
            timeout: 180000,
            stdout: "pipe",
            stderr: "pipe",
            command:
              "node apps/web/node_modules/next/dist/bin/next start apps/web -p 3100",
            url: "http://localhost:3100",
            reuseExistingServer: !process.env.CI,
          },
        ],
});
