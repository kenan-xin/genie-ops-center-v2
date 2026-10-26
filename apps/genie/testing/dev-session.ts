import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { mintDevSession } from "@genie/core/testing";

/**
 * Prints a real session cookie for one person of the local dev database, as the JSON of CDP
 * `Network.setCookie`, so an unattended agent signs in to `next dev` without the realm
 * (genie-ops-center-v2-xok3.25). It reads the same settings file as the dev app.
 *
 * Usage: pnpm nx run @genie/app:dev-session -- <email>
 *        pnpm nx run @genie/app:dev-session -- --role "<role name>"
 */
const { values, positionals } = parseArgs({
  options: { role: { type: "string" } },
  allowPositionals: true,
});

// `pnpm run` passes the arguments through a shell string and drops their quotes, so a role name
// with a space arrives as several words; with `--role`, the remaining words belong to the name.
const subject =
  values.role !== undefined
    ? { role: [values.role, ...positionals].join(" ") }
    : positionals.length === 1 && positionals[0] !== undefined
      ? { email: positionals[0] }
      : undefined;

if (subject === undefined) {
  console.error(
    'usage: pnpm nx run @genie/app:dev-session -- <email> | --role "<role name>"'
  );
  process.exit(2);
}

process.loadEnvFile(resolve(import.meta.dirname, "../.env.development.local"));

const { DATABASE_URL, PUBLIC_URL, BETTER_AUTH_SECRET } = process.env;

if (
  DATABASE_URL === undefined ||
  PUBLIC_URL === undefined ||
  BETTER_AUTH_SECRET === undefined
) {
  console.error(
    "apps/genie/.env.development.local needs DATABASE_URL, PUBLIC_URL and BETTER_AUTH_SECRET"
  );
  process.exit(2);
}

const cookie = await mintDevSession({
  databaseUrl: DATABASE_URL,
  publicUrl: PUBLIC_URL,
  secret: BETTER_AUTH_SECRET,
  subject,
});

console.log(JSON.stringify(cookie));
