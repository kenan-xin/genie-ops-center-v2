import { stopEverything } from "./global-setup.ts";

/**
 * Playwright runs this whether the specs passed or failed, so the development
 * server and the disposable database are removed either way.
 */
export default async function globalTeardown(): Promise<void> {
  await stopEverything();
}
