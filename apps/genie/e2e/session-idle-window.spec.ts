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

/** `windowReadMs(15)` */
const WINDOW_READ_MS = 60_000;

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

/** Fast-forwards the browser clock to `at`, which real time since the install has moved towards. */
async function advanceTo(page: Page, at: number): Promise<void> {
  await page.clock.fastForward(at - (await page.evaluate(() => Date.now())));
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

test("a lowered idle window reaches a single idle tab, which warns at the new lead (d8l5.53)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "tenant-settings",
    async () => {
      try {
        await setWindow(OLD_MINUTES);
        await page.waitForTimeout(SETTINGS_CACHE_MS);

        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });
        await page.waitForLoadState("networkidle");

        await page.clock.install();
        await openAccount(page);

        const mountedAt = await page.evaluate(() => Date.now());

        // From now on the server ends the session 5 minutes after the mount, on real time.
        await setWindow(LOWERED_MINUTES);
        await page.waitForTimeout(SETTINGS_CACHE_MS);

        const read = page.waitForResponse((response) =>
          response.url().endsWith("/api/session/window")
        );

        await page.clock.fastForward(WINDOW_READ_MS + 1_000);
        expect((await read).status()).toBe(200);

        // The lowered end is 5:00 after the mount, so the warning opens at 3:00.
        await advanceTo(page, mountedAt + 2 * 60_000 + 50_000);
        await page.waitForTimeout(1_000);
        await expect(warningOf(page)).toBeHidden();

        await advanceTo(page, mountedAt + 3 * 60_000 + 10_000);
        await expect(warningOf(page)).toBeVisible();

        const idleSignOut = page.waitForRequest(
          (request) =>
            request.method() === "POST" &&
            request.url().endsWith("/api/auth/sign-out?idle=1"),
          { timeout: 15_000 }
        );

        await advanceTo(page, mountedAt + 5 * 60_000 + 10_000);
        await idleSignOut;

        await expect
          .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
          .toBe("/sign-in");
        expect(new URL(page.url()).searchParams.get("error")).toBe(
          "session_expired"
        );
        await expect(page.getByTestId("sign-in-banner")).toContainText(
          `${LOWERED_MINUTES} minutes`
        );
      } finally {
        await setWindow(OLD_MINUTES);
      }
    },
    LOCK_WAIT_MS
  );
});

test("after a lowered idle window, typing in one tab keeps both tabs from warning or signing out (d8l5.53)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "tenant-settings",
    async () => {
      try {
        await setWindow(OLD_MINUTES);
        await page.waitForTimeout(SETTINGS_CACHE_MS);

        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });
        await page.waitForLoadState("networkidle");

        const context = page.context();

        await context.clock.install();

        const a = page;

        await openAccount(a);

        const mountedAt = await a.evaluate(() => Date.now());

        const b = await context.newPage();

        await openAccount(b);

        const signOuts: string[] = [];

        for (const tab of [a, b]) {
          tab.on("request", (request) => {
            if (
              request.method() === "POST" &&
              request.url().endsWith("/api/auth/sign-out?idle=1")
            )
              signOuts.push(request.url());
          });
        }

        await a.bringToFront();

        // Its trailing activity call is due 150 s after the mount call.
        await advanceTo(a, mountedAt + 5_000);
        await a.keyboard.press("Shift");

        const activity = a.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().endsWith("/api/session/activity")
        );

        // `runFor`, not `fastForward`: a jump would move the 60 s window read from 3:00 to 3:31.
        await a.clock.runFor(
          mountedAt + 2 * 60_000 + 31_000 - (await a.evaluate(() => Date.now()))
        );
        expect((await activity).status()).toBe(200);

        await setWindow(LOWERED_MINUTES);
        await a.waitForTimeout(SETTINGS_CACHE_MS);

        // Without input, the lowered warning would open at 3:05: the Shift at 0:05, plus 3 minutes.
        const read = a.waitForResponse((response) =>
          response.url().endsWith("/api/session/window")
        );

        await advanceTo(a, mountedAt + 3 * 60_000 + 1_000);
        expect((await read).status()).toBe(200);

        // Let the page apply the read before the input: the response resolves at its headers, and
        // the page reads the body first. 3:01.5 is still well before the 3:05 check.
        await a.waitForTimeout(500);

        // Its activity call is due at 5:00, 150 s after the 2:30 call, so no activity answer clears
        // the lowered window first.
        await a.keyboard.press("Shift");

        await advanceTo(a, mountedAt + 3 * 60_000 + 10_000);
        await a.waitForTimeout(1_000);
        await expect(warningOf(a)).toBeHidden();
        await expect(warningOf(b)).toBeHidden();

        await advanceTo(a, mountedAt + 5 * 60_000 + 10_000);
        await a.waitForTimeout(1_000);
        expect(signOuts).toEqual([]);
        expect(new URL(a.url()).pathname).toBe("/account");
      } finally {
        await setWindow(OLD_MINUTES);
      }
    },
    LOCK_WAIT_MS
  );
});
