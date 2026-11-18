import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const destination = process.argv[2];
if (!destination) throw Error("Usage: pnpm db:backup <new archive path>");
const archive = resolve(destination);
const temporary = archive + "." + randomUUID() + ".partial";
await mkdir(dirname(archive), { recursive: true, mode: 0o700 });
const file = await open(temporary, "wx", 0o600);

function postgres(args, stdio) {
  const child = spawn(
    "docker",
    ["compose", "exec", "-T", "postgres", ...args],
    { stdio },
  );
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(args[0] + " failed")),
    );
  });
  return { child, finished };
}

try {
  const dump = postgres(
    ["pg_dump", "-U", "pulse", "-d", "pulse", "-Fc"],
    ["ignore", file.fd, "inherit"],
  );
  await dump.finished;
  await file.sync();
  await file.close();
  const check = postgres(
    ["pg_restore", "--file=/dev/null"],
    ["pipe", "ignore", "inherit"],
  );
  await Promise.all([
    check.finished,
    pipeline(createReadStream(temporary), check.child.stdin),
  ]);
  // Expose the complete archive atomically and preserve any existing destination.
  await link(temporary, archive);
  console.log("Verified PostgreSQL archive saved to " + archive);
} finally {
  await file.close();
  await unlink(temporary);
}
