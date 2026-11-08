import { expect, test, type Page } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import {
  INVITE_DB,
  inviteBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * A lowered idle window reaches the tabs that are already open (bead `6wz1.92`, Spec 2 R-15a,
 * Spec 3 R-33). The tabs of one browser share one idle count, and the count warns only when every
 * tab agrees, so a tab that kept the old window used to hold back the warning of a tab that read
 * the new one, and the server ended the session with no warning.
 *
 * The proof changes the idle window, so it runs on the invite deployment under the
 * `tenant-settings` lock that `tenant-settings.spec.ts` holds for its own idle change, and it
 * restores the row before it releases the lock. The main deployment's window stays untouched,
 * because `session-idle.spec.ts`, `sessions.spec.ts` and `shell.spec.ts` read it.
 */
const BASE = inviteBaseUrl();

const LOCK_WAIT_MS = 300_000;

/** The window the deployment starts with, and the one `tenant-settings.spec.ts` restores. */
const OLD_MINUTES = 15;

const LOWERED_MINUTES = 5;

/** The settings reader expires after 10 seconds (`DEC-46`). */
const SETTINGS_CACHE_MS = 11_000;

test.describe.configure({ timeout: 420_000 });

const sql = async (query: string) =>
  (await queryBrokerDatabase(INVITE_DB, query))[0] ?? "";

const setWindow = (minutes: number) =>
  sql(`update tenant_settings set session_idle_minutes = ${minutes}`);

const warningOf = (page: Page) =>
  page.getByRole("dialog", { name: "Still there?" });

/** Loads the account page and waits for its mount call, which starts both counts (R-15a). */
async function openAccount(page: Page): Promise<void> {
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto(`${BASE}/account`);

  expect((await mounted).status()).toBe(200);
}

test("a tab loaded before the idle window was lowered lets the new tab warn before the new end (6wz1.92)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "tenant-settings",
    async () => {
      try {
        // The last holder of the lock can leave another window in the reader's cache.
        await setWindow(OLD_MINUTES);
        await page.waitForTimeout(SETTINGS_CACHE_MS);

        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });
        await page.waitForLoadState("networkidle");

        const context = page.context();

        await context.clock.install();

        const stale = page;

        await openAccount(stale);

        await setWindow(LOWERED_MINUTES);
        await stale.waitForTimeout(SETTINGS_CACHE_MS);

        const fresh = await context.newPage();

        await openAccount(fresh);

        // One input in the old tab after a switch back to it.
        await stale.bringToFront();
        await stale.keyboard.press("Shift");
        await stale.waitForTimeout(1_000);

        // The new window warns two minutes before its end.
        await context.clock.fastForward((LOWERED_MINUTES - 2) * 60_000 + 2_000);
        await expect(warningOf(fresh)).toBeVisible();

        const idleSignOut = fresh.waitForRequest(
          (request) =>
            request.method() === "POST" &&
            request.url().endsWith("/api/auth/sign-out?idle=1")
        );

        await context.clock.fastForward(2 * 60_000 + 2_000);
        await idleSignOut;

        await expect
          .poll(() => new URL(fresh.url()).pathname, { timeout: 15_000 })
          .toBe("/sign-in");
        expect(new URL(fresh.url()).searchParams.get("error")).toBe(
          "session_expired"
        );
        await expect(fresh.getByTestId("sign-in-banner")).toContainText(
          `${LOWERED_MINUTES} minutes`
        );
      } finally {
        await setWindow(OLD_MINUTES);
      }
    },
    LOCK_WAIT_MS
  );
});
