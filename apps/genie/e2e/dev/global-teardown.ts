import { COMPOSE, PID_FILE, stopEverything } from "./global-setup.ts";

/**
 * Playwright runs this whether the specs passed or failed, so the development server and the
 * disposable database are removed either way. `GENIE_DEV_E2E_KEEP=1` keeps both for the captures
 * Phase 04 takes and prints the two commands that stop them.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.GENIE_DEV_E2E_KEEP === "1") {
    console.log(
      `Keeping the development server and database. Stop them with:\n  kill -- -$(cat ${PID_FILE})\n  docker ${COMPOSE.join(" ")} down -v`
    );

    return;
  }

  await stopEverything();
}
