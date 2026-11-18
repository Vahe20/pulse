import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , input, output] = process.argv;
if (!input || !output || !existsSync(input) || existsSync(output)) {
  console.error('Usage: npm run backup -- <existing database> <new backup file>');
  process.exit(1);
}
const destination = resolve(output);
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(resolve(input), { readOnly: true });
try {
  await backup(db, destination);
  console.log(`Pulse backup saved to ${destination}`);
} finally {
  db.close();
}
