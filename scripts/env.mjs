import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const [, ...args] = process.argv.slice(2);
const manager = process.env.npm_execpath;
if (!manager)
  throw new Error("Run this script through a pnpm workspace command.");
const native = manager.toLowerCase().endsWith(".exe");
const child = spawn(
  native ? manager : process.execPath,
  native ? args : [manager, ...args],
  { stdio: "inherit", env: process.env },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
