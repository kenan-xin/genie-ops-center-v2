import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { currentSessionId, sessionRowCount } from "./support/sessions.ts";
import { openNavigation, openUserMenu } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * The browser idle count (Spec 2 R-15a, R-17, Spec 3 R-33) on the real stack, at the phone and the
 * desktop viewport. The browser time runs on Playwright's clock while the server keeps real time,
 * so a test can put the browser clock ahead of the server, behind it, or change it while the page
 * is open (code review shell H-1), and can share one count between tabs (shell M-1, bead
 * `6wz1.33`). The tenant's idle window is read, never changed, because other specs run against
 * the same deployment.
 */
test.describe.configure({ timeout: 120_000 });

const POLL = { timeout: 15_000 };

type IdleTimes = {
  readonly minutes: number;
  readonly idleMs: number;
  readonly leadMs: number;
  readonly promptMs: number;
};

/** The tenant's window, and when the warning opens: two minutes before the end, or half way. */
async function idleTimes(): Promise<IdleTimes> {
  const [value] = await queryDatabase(
    "select session_idle_minutes from tenant_settings"
  );

  const minutes = Number(value);
  const idleMs = minutes * 60_000;
  const leadMs = Math.min(120_000, idleMs / 2);

  return { minutes, idleMs, leadMs, promptMs: idleMs - leadMs };
}

function idleEmail(testInfo: TestInfo): string {
  return e2eReaderEmail("idle", testInfo.project.name);
}

function isActivity(url: string): boolean {
  return url.endsWith("/api/session/activity");
}

const warningOf = (page: Page) =>
  page.getByRole("dialog", { name: "Still there?" });

/** No warning, after the page had real time to render one that a timer just opened. */
async function expectNoWarning(page: Page): Promise<void> {
  await page.waitForTimeout(1_000);
  await expect(warningOf(page)).toHaveCount(0);
}

/** Signs in on the real clock and lets the landing page's own mount call finish. */
async function signIn(page: Page, testInfo: TestInfo): Promise<void> {
  await signInThroughKeycloak(page, { email: idleEmail(testInfo) });
  await page.waitForLoadState("networkidle");
}

/** Loads the account page and waits for its mount call, which starts both counts (R-15a). */
async function openAccount(page: Page): Promise<void> {
  const mounted = page.waitForResponse((response) =>
    isActivity(response.url())
  );

  await page.goto("/account");

  expect((await mounted).status()).toBe(200);
}

/** Input the idle count hears, with no side effect on the page. */
async function touch(page: Page): Promise<void> {
  await page.keyboard.press("Shift");
}

async function expectExpiredBanner(page: Page, minutes: number): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, POLL).toBe("/sign-in");

  expect(new URL(page.url()).searchParams.get("error")).toBe("session_expired");
  await expect(page.getByTestId("sign-in-banner")).toContainText(
    `${minutes} minutes`
  );
}

for (const [label, offset] of [
  ["ahead of", 3_600_000],
  ["behind", -3_600_000],
] as const) {
  test(`a browser clock ${label} the server does not warn early (H-1)`, async ({
    page,
  }, testInfo) => {
    const { promptMs } = await idleTimes();

    await signIn(page, testInfo);

    const current = await currentSessionId(page, idleEmail(testInfo));

    await page.clock.install({ time: Date.now() + offset });
    await openAccount(page);

    await page.clock.fastForward(promptMs - 5_000);
    await expectNoWarning(page);
    expect(new URL(page.url()).pathname).toBe("/account");

    await page.clock.fastForward(10_000);
    await expect(warningOf(page)).toBeVisible();
    expect(await sessionRowCount(current)).toBe("1");
  });
}

test("a clock set forward while the page is open does not sign out early (H-1)", async ({
  page,
}, testInfo) => {
  const { promptMs } = await idleTimes();

  await signIn(page, testInfo);

  const current = await currentSessionId(page, idleEmail(testInfo));

  await page.clock.install();
  await openAccount(page);

  // The wall clock jumps an hour; the monotonic clock does not move.
  await page.clock.setSystemTime(Date.now() + 3_600_000);
  await page.clock.fastForward(promptMs + 5_000);

  await expectNoWarning(page);
  expect(new URL(page.url()).pathname).toBe("/account");
  expect(await sessionRowCount(current)).toBe("1");

  // The count restarted and still hears input, which slides the server session.
  const activity = page.waitForResponse((response) =>
    isActivity(response.url())
  );

  await touch(page);

  expect((await activity).status()).toBe(200);
  await expectNoWarning(page);
});

test("a clock set back while the page is open does not hold the activity call back (H-1)", async ({
  page,
}, testInfo) => {
  const { promptMs } = await idleTimes();

  await signIn(page, testInfo);
  await page.clock.install();
  await openAccount(page);

  await page.clock.setSystemTime(Date.now() - 3_600_000);

  // The half window has not passed, so only the clock check makes this call a leading one.
  const activity = page.waitForResponse(
    (response) => isActivity(response.url()),
    { timeout: 10_000 }
  );

  await touch(page);

  expect((await activity).status()).toBe(200);

  await page.clock.fastForward(promptMs - 5_000);
  await expectNoWarning(page);
});

test("the idle sign-out ends a live session at the end of the browser count (R-17)", async ({
  page,
}, testInfo) => {
  const { minutes, leadMs, promptMs } = await idleTimes();

  await signIn(page, testInfo);
  await page.clock.install();
  await openAccount(page);

  const current = await currentSessionId(page, idleEmail(testInfo));

  await page.clock.fastForward(promptMs + 1_000);
  await expect(warningOf(page)).toBeVisible();

  const signOut = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/auth/sign-out?idle=1")
  );

  await page.clock.fastForward(leadMs + 1_000);
  await signOut;

  // Only seconds of real time passed since the mount call, so the server window was still open.
  await expectExpiredBanner(page, minutes);
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "genie-session"
    )
  ).toBe(false);
  await expect.poll(() => sessionRowCount(current), POLL).toBe("0");
});

test("a closed laptop lid past the idle window signs out at once", async ({
  page,
}, testInfo) => {
  const { minutes, idleMs } = await idleTimes();

  await signIn(page, testInfo);
  await page.clock.install();
  await openAccount(page);

  const current = await currentSessionId(page, idleEmail(testInfo));

  // The server clock moves while the lid is closed too.
  await queryDatabase(
    `update session set last_active_at = now() - interval '${minutes + 1} minutes' where id = '${current}'`
  );

  // Both browser clocks move, and the warning's timer fires late: the count skips the warning.
  await page.clock.fastForward(idleMs + 60_000);

  await expectExpiredBanner(page, minutes);
  await expect.poll(() => sessionRowCount(current), POLL).toBe("0");
});

test("activity in one tab keeps an idle second tab signed in (M-1, 6wz1.33)", async ({
  page,
}, testInfo) => {
  const { minutes, leadMs, promptMs } = await idleTimes();

  await signIn(page, testInfo);

  const context = page.context();
  const current = await currentSessionId(page, idleEmail(testInfo));

  await context.clock.install();

  const a = page;

  await openAccount(a);

  const b = await context.newPage();

  await openAccount(b);

  // a. Input in A, late in the count. B's own count since its load passes the prompt time, so
  // only the shared count keeps B quiet.
  await context.clock.fastForward(promptMs - 30_000);

  const activity = a.waitForResponse((response) => isActivity(response.url()));

  await touch(a);

  expect((await activity).status()).toBe(200);

  await context.clock.fastForward(60_000);
  await expectNoWarning(b);
  expect(new URL(b.url()).pathname).toBe("/account");

  // b. Both tabs idle: both warn.
  await context.clock.fastForward(promptMs);
  await expect(warningOf(a)).toBeVisible();
  await expect(warningOf(b)).toBeVisible();

  // c. A new tab restarts the count of the others, and their warnings close.
  const c = await context.newPage();

  await openAccount(c);
  await context.clock.fastForward(1_500);
  await expect(warningOf(a)).toHaveCount(0);
  await expect(warningOf(b)).toHaveCount(0);

  // d. Stay signed in in one tab closes the warning in every tab.
  await context.clock.fastForward(promptMs + 1_000);

  await Promise.all(
    [a, b, c].map((tab) => expect(warningOf(tab)).toBeVisible())
  );

  await warningOf(a).getByRole("button", { name: "Stay signed in" }).click();

  await Promise.all(
    [a, b, c].map((tab) => expect(warningOf(tab)).toHaveCount(0))
  );

  // e. Every tab reaches the end together. The later idle sign-outs find no session and still
  // land on the banner.
  await context.clock.fastForward(promptMs + 1_000);
  await context.clock.fastForward(leadMs + 1_000);

  await Promise.all([a, b, c].map((tab) => expectExpiredBanner(tab, minutes)));

  await expect.poll(() => sessionRowCount(current), POLL).toBe("0");
});

test("a reload starts both counts together (R-15a)", async ({
  page,
}, testInfo) => {
  const { promptMs } = await idleTimes();

  await signIn(page, testInfo);
  await page.clock.install();
  await openAccount(page);

  const current = await currentSessionId(page, idleEmail(testInfo));

  const [before] = await queryDatabase(
    `select last_active_at::text from session where id = '${current}'`
  );

  await page.clock.fastForward(Math.floor(promptMs * 0.75));
  await expectNoWarning(page);

  const reloaded = page.waitForResponse((response) =>
    isActivity(response.url())
  );

  await page.reload();

  expect((await reloaded).status()).toBe(200);

  const [slid] = await queryDatabase(
    `select (last_active_at > '${before ?? ""}'::timestamptz)::text from session where id = '${current}'`
  );

  expect(slid).toBe("true");

  // The count restarted at the reload, not at the first load.
  await page.clock.fastForward(promptMs - 5_000);
  await expectNoWarning(page);

  await page.clock.fastForward(10_000);
  await expect(warningOf(page)).toBeVisible();
});

for (const [label, end, state] of [
  [
    "the idle count ends",
    async (page: Page, { leadMs, promptMs }: IdleTimes) => {
      await page.clock.fastForward(promptMs + 1_000);
      await expect(warningOf(page)).toBeVisible();
      await page.clock.fastForward(leadMs + 1_000);
    },
    "session_expired",
  ],
  [
    "Sign out is chosen",
    async (page: Page) => {
      const menu = await openUserMenu(page);

      await menu
        .getByRole("menuitem", { name: "Sign out", exact: true })
        .click();
    },
    "signed_out",
  ],
] as const) {
  test(`when ${label} on a page that a shell link opened, the sign-in page follows and sends no activity call (NAV-1)`, async ({
    page,
  }, testInfo) => {
    const times = await idleTimes();

    await signIn(page, testInfo);
    await page.clock.install();
    await openAccount(page);

    let activityCalls = 0;

    page.on("request", (request) => {
      if (isActivity(request.url())) activityCalls += 1;
    });

    // The fake clock fakes `performance.timeOrigin` too, so a window value marks the document.
    await page.evaluate(() => Object.assign(window, { nav1Document: true }));

    await (
      await openNavigation(page)
    )
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("link", { name: "Placeholder", exact: true })
      .click();
    await expect(page).toHaveURL(/\/placeholder$/);
    expect(await page.evaluate(() => "nav1Document" in window)).toBe(true);

    await end(page, times);

    await expect
      .poll(() => new URL(page.url()).pathname, POLL)
      .toBe("/sign-in");
    expect(new URL(page.url()).searchParams.get("error")).toBe(state);

    // Past the throttle wait, input makes a call if an activity client is still mounted.
    const before = activityCalls;

    await page.clock.fastForward(times.idleMs / 2 + 1_000);
    await touch(page);
    await page.waitForTimeout(1_000);
    expect(activityCalls).toBe(before);
  });
}
