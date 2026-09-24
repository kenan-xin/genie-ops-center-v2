import { IMAGE, HOST_PORT, composeWithEnv } from "./stack.ts";

const READY_URL = `http://127.0.0.1:${HOST_PORT}/api/health`;

/** The modules the fixture image compiled (`tools/build-fixture-image.ts`). */
const FIXTURE_MODULES = [
  "failing-viewer",
  "invalid-viewer",
  "permitted-viewer",
] as const;

/**
 * Stand-in for the `seed` step (R-20), which `genie-ops setup` brings in genie-ops-center-v2-1ia.2.
 * The fixture stack runs no setup yet, so without these rows R-8 refuses each fixture module's
 * viewer document before its provider runs. It runs after health answers 200, which reads no
 * entitlement, so no cache is filled first.
 */
async function seedEnabledModules(): Promise<void> {
  const rows = FIXTURE_MODULES.map((id) => `('${id}', true)`).join(", ");

  await composeWithEnv(
    [
      "exec",
      "-T",
      "database",
      "psql",
      "-U",
      "genie",
      "-d",
      "genie",
      "-c",
      `insert into tenant_module (module_id, enabled) values ${rows} on conflict (module_id) do update set enabled = true`,
    ],
    {}
  );
}

/**
 * Brings up the fixture stack: the disposable compose deployment, with the
 * fixture image and host port supplied as the command's own defaults, so the
 * gate needs no operator environment. Standing aside is still supported for a
 * deployment started by hand, under the same project name.
 */
export default async function fixtureGlobalSetup(): Promise<void> {
  if (process.env.GENIE_E2E_EXTERNAL === "1") return;

  await composeWithEnv(["up", "-d", "--wait"], {});

  const deadline = Date.now() + 120000;

  // Polling is sequential by definition: each attempt exists only because the
  // previous one did not answer 200.
  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    const ready = await fetch(READY_URL)
      .then((response) => response.status === 200)
      .catch(() => false);

    if (ready) {
      await seedEnabledModules();

      return;
    }

    await new Promise((settle) => setTimeout(settle, 500));
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(
    `The fixture stack never became ready on ${READY_URL} (image ${IMAGE}).`
  );
}
