import { IMAGE, HOST_PORT, composeWithEnv } from "./stack.ts";

const READY_URL = `http://127.0.0.1:${HOST_PORT}/api/health`;

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

    if (ready) return;

    await new Promise((settle) => setTimeout(settle, 500));
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(
    `The fixture stack never became ready on ${READY_URL} (image ${IMAGE}).`
  );
}
