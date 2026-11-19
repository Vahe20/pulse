import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(program + " exited with " + result.status);
  return result.stdout?.trim();
}

const portFinder = createServer();
await new Promise((ok, fail) =>
  portFinder.once("error", fail).listen(0, "127.0.0.1", ok),
);
const port = portFinder.address().port;
await new Promise((ok, fail) =>
  portFinder.close((err) => (err ? fail(err) : ok())),
);
const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "pulse-acceptance-"));
const envFile = join(directory, ".env");
const origin = "http://localhost:" + port;
try {
  run(process.execPath, [resolve("scripts/setup.mjs")], { cwd: directory });
  const env = {
    ...process.env,
    ...parseEnv(readFileSync(envFile, "utf8")),
    PULSE_ACCEPTANCE_ENV: envFile,
    PULSE_ACCEPTANCE_PORT: String(port),
    PULSE_ACCEPTANCE_ORIGIN: origin,
    WEB_ORIGIN: origin,
    PULSE_E2E_EXTERNAL: "true",
  };
  const args = [
    "compose",
    "--project-name",
    "pulse-check-" + randomUUID(),
    "--env-file",
    envFile,
    "-f",
    "docker-compose.yml",
    "-f",
    "docker/compose.acceptance.yml",
    "--profile",
    "app",
  ];
  const compose = (...command) => run("docker", [...args, ...command], { env });
  const published = (service, internalPort) =>
    run("docker", [...args, "port", service, internalPort], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  try {
    try {
      compose("up", "--build", "-d", "--wait");
    } catch (error) {
      compose("ps", "-a");
      compose("logs", "--tail", "35", "postgres", "api", "web");
      throw error;
    }
    env.PULSE_E2E_API = "http://" + published("api", "4100") + "/api/v1";
    env.PULSE_E2E_MAIL = "http://" + published("mail", "8025");
    const db = new URL(env.DATABASE_URL);
    db.host = published("postgres", "5432");
    env.DATABASE_URL = db.href;
    run(
      process.execPath,
      [join(root, "node_modules/@playwright/test/cli.js"), "test"],
      { env },
    );
  } finally {
    compose("down", "--volumes", "--rmi", "local");
  }
} finally {
  try {
    unlinkSync(envFile);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  rmdirSync(directory);
}
