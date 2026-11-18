import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const secret = () => randomBytes(32).toString("hex");
const db = secret();
writeFileSync(
  ".env",
  [
    "POSTGRES_PASSWORD=" + db,
    "DATABASE_URL=postgresql://pulse:" + db + "@127.0.0.1:55432/pulse",
    "JWT_SECRET=" + secret(),
    "ADMIN_EMAIL=admin@pulse.test",
    "ADMIN_PASSWORD=" + secret(),
    "DEMO_MODE=true",
    "DEMO_PASSWORD=" + secret(),
    "WEB_ORIGIN=http://localhost:3100",
    "REDIS_HOST=127.0.0.1",
    "REDIS_PORT=56379",
    "SMTP_HOST=127.0.0.1",
    "SMTP_PORT=51025",
    "MAIL_FROM=pulse@academy.test",
    "SECURE_COOKIES=false",
    "OPENAI_MODEL=gpt-4o-mini",
    "OPENAI_API_KEY=",
  ].join("\n") + "\n",
  { flag: "wx", mode: 0o600 },
);
console.log("Created .env with generated local credentials.");
