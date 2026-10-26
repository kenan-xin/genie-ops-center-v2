import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * The idle rule and the account page as a browser sees them (Spec 2 R-14, R-15, R-15a, R-18,
 * AC-5), at the phone and the desktop viewport, signed in through the real Keycloak realm the
 * setup run created. The idle boundary itself is staged in the database - the tenant's real
 * window is 15 minutes, and no e2e run waits it out - while every read, slide, and refusal the
 * assertions see goes through the real routes. The foreign-origin refusals, the session-expired
 * link to a live session and the idle sign-out are proved over the built server by
 * `testing/session-clearing.integration.test.ts`.
 */

/** The tenant's seeded idle window; the expired banner names it (R-14). */
const IDLE_MINUTES = 15;

const WINDOWS_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function sessionsEmail(testInfo: TestInfo): string {
  return e2eReaderEmail("sessions", testInfo.project.name);
}

/** Inserts one live session row for the person, carrying a recognizable device line. */
async function insertOtherSession(
  email: string,
  input: { readonly userAgent: string; readonly address: string }
): Promise<string> {
  const [id] = await queryDatabase(
    `insert into session (id, expires_at, token, user_agent, ip_address, last_active_at, user_id)
     values ('e2e-other-' || md5(random()::text), now() + interval '1 hour', md5(random()::text), '${input.userAgent}', '${input.address}', now(), (select id from "user" where email = '${email}'))
     returning id`
  );

  if (id === undefined)
    throw new Error("the other session insert returned no row");

  return id;
}

async function sessionRowCount(id: string): Promise<string> {
  const [count] = await queryDatabase(
    `select count(*) from session where id = '${id}'`
  );

  return count ?? "0";
}

/** The current browser session's row id, read through the cookie the sign-in set. */
async function currentSessionId(page: Page, email: string): Promise<string> {
  const cookie = (await page.context().cookies()).find(
    (entry) => entry.name === "genie-session"
  );

  if (cookie === undefined)
    throw new Error("the browser holds no session cookie");

  const token = decodeURIComponent(cookie.value).split(".")[0] ?? "";

  const [id] = await queryDatabase(
    `select id from session where token = '${token}' and user_id = (select id from "user" where email = '${email}')`
  );

  if (id === undefined)
    throw new Error("no session row for the browser cookie");

  return id;
}

test("the account page shows sessions and roles, and both sign-outs work (R-18)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  const current = await currentSessionId(page, email);

  const other = await insertOtherSession(email, {
    userAgent: WINDOWS_CHROME_UA,
    address: "192.0.2.50",
  });

  await page.goto("/account");

  // Profile: the person the directory synced.
  await expect(page.getByText(email)).toBeVisible();

  // Sessions: phone uses cards while desktop exposes the responsive table in the built app.
  const sessionsList = page.getByRole("list", { name: "Sessions" });
  const sessionsTable = page.getByRole("table");

  if (testInfo.project.name === "desktop") {
    await expect(sessionsList).toBeHidden();
    await expect(sessionsTable).toBeVisible();
    await expect(sessionsTable.getByText("THIS DEVICE")).toBeVisible();
    await expect(
      sessionsTable
        .getByRole("row")
        .filter({ hasText: "192.0.2.50" })
        .getByText("Windows")
    ).toBeVisible();
  } else {
    await expect(sessionsTable).toBeHidden();
    await expect(sessionsList.getByText("THIS DEVICE")).toBeVisible();
    await expect(sessionsList.getByText("Windows")).toBeVisible();
  }

  const sessionContainer =
    testInfo.project.name === "desktop" ? sessionsTable : sessionsList;

  const otherCard = sessionContainer
    .getByRole(testInfo.project.name === "desktop" ? "row" : "listitem")
    .filter({ hasText: "192.0.2.50" });

  // Roles and access: the seeded reader role, tenant-wide and direct (R-27 loader).
  await expect(page.getByText("E2E reader")).toBeVisible();
  await expect(page.getByText("Whole tenant")).toBeVisible();
  await expect(page.getByText("Direct", { exact: true })).toBeVisible();

  // Per-session sign-out, from the row's overflow menu (R-23): the dialog names the device, and
  // the confirm deletes the row.
  await otherCard.getByRole("button", { name: /^Actions for / }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText(/Windows/)).toBeVisible();

  dialog.getByRole("button", { name: "Sign out" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "That session was signed out." })
  ).toBeVisible();
  await expect
    .poll(() => sessionRowCount(other), { timeout: 10_000 })
    .toBe("0");

  // Sign out everywhere: a third row goes, the caller's own stays. The block re-reads the
  // server data, which now sees the row this test just inserted.
  const third = await insertOtherSession(email, {
    userAgent: WINDOWS_CHROME_UA,
    address: "192.0.2.51",
  });

  await page.reload();

  await page
    .getByRole("button", { name: "Sign out all other sessions" })
    .click();

  await expect(dialog.getByText(/1 other session/)).toBeVisible();

  dialog.getByRole("button", { name: "Sign out" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Every other session was signed out." })
  ).toBeVisible();
  await expect
    .poll(() => sessionRowCount(third), { timeout: 10_000 })
    .toBe("0");
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("1");
});

test(
  "a document load makes one activity call, which slides a live session (R-15, R-15a)",
  { tag: "@no-screen" },
  async ({ page }, testInfo) => {
    const email = sessionsEmail(testInfo);

    await signInThroughKeycloak(page, { email });

    // The landing page makes its own mount call, which must land before `before` is read.
    await page.waitForLoadState("networkidle");

    const current = await currentSessionId(page, email);

    const [before] = await queryDatabase(
      `select coalesce(last_active_at::text, '') from session where id = '${current}'`
    );

    // The mount call is the throttle's leading call, so a load starts the browser's idle count and
    // the server window together.
    const activity = page.waitForResponse((response) =>
      response.url().endsWith("/api/session/activity")
    );

    await page.goto("/");

    expect((await activity).status()).toBe(200);

    // The slide wrote a later time than the sign-in left (none reads as an empty row), so the call
    // really reached the route.
    const [slid] = await queryDatabase(
      `select (last_active_at > coalesce(nullif('${before ?? ""}', '')::timestamptz, '-infinity'))::text from session where id = '${current}'`
    );

    expect(slid).toBe("true");
  }
);

test("an idle session is refused and the browser lands on the expired banner (R-14, R-17a)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  // The landing page's own mount call must not slide the session after the staging below.
  await page.waitForLoadState("networkidle");

  const current = await currentSessionId(page, email);

  await page.clock.install();

  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto("/");

  expect((await mounted).status()).toBe(200);

  // The tenant's real 15 minute window, staged past: the next enforced read refuses the row.
  await queryDatabase(
    `update session set last_active_at = now() - interval '${IDLE_MINUTES + 1} minutes' where id = '${current}'`
  );

  // Half the window passes in the browser, so the next input makes a leading call (R-15).
  await page.clock.fastForward(IDLE_MINUTES * 30_000 + 1_000);

  // Real input drives the activity call; the unauthenticated answer lands the browser on the
  // sign-in page's session-expired state, and the banner names the idle minutes.
  await page.mouse.click(10, 10);

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe("/sign-in");

  expect(new URL(page.url()).searchParams.get("error")).toBe("session_expired");

  const banner = page.getByTestId("sign-in-banner");

  await expect(banner).toBeVisible();
  await expect(banner).toContainText(`${IDLE_MINUTES} minutes`);

  // The activity call's refusal cleared the cookie.
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "genie-session"
    )
  ).toBe(false);

  // The row ends with the cookie (R-14, amended 2026-10-19).
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("0");
});

test("an idle document reload clears the cookie and lands on the expired banner (R-14, R-17a)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  const current = await currentSessionId(page, email);

  await page.goto("/");

  // Let any activity call the landing started finish first, so it cannot slide the session after
  // the idle time is staged (one phone run reloaded into a live session, S2-16 gate run).
  await page.waitForLoadState("networkidle");

  await queryDatabase(
    `update session set last_active_at = now() - interval '${IDLE_MINUTES + 1} minutes' where id = '${current}'`
  );

  await page.reload();

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe("/sign-in");

  expect(new URL(page.url()).searchParams.get("error")).toBe("session_expired");
  await expect(page.getByTestId("sign-in-banner")).toContainText(
    `${IDLE_MINUTES} minutes`
  );
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "genie-session"
    )
  ).toBe(false);

  // The row ends with the cookie (R-14, amended 2026-10-19).
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("0");
});

test("an idle reload of the account page clears the cookie and lands on the expired banner (genie-ops-center-v2-jfq9)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  const current = await currentSessionId(page, email);

  await page.goto("/account");
  await expect(page.getByText(email)).toBeVisible();

  // As above: no activity call from the landing may slide the session after the idle time.
  await page.waitForLoadState("networkidle");

  await queryDatabase(
    `update session set last_active_at = now() - interval '${IDLE_MINUTES + 1} minutes' where id = '${current}'`
  );

  // The layout and the page both redirect an idle session; both must go to the route that
  // clears the cookie.
  await page.reload();

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe("/sign-in");

  expect(new URL(page.url()).searchParams.get("error")).toBe("session_expired");
  await expect(page.getByTestId("sign-in-banner")).toContainText(
    `${IDLE_MINUTES} minutes`
  );
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "genie-session"
    )
  ).toBe(false);

  // The row ends with the cookie (R-14, amended 2026-10-19).
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("0");
});

test("an idle in-app navigation to the account page clears the cookie and lands on the expired banner (genie-ops-center-v2-jfq9)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  const current = await currentSessionId(page, email);

  // The activity call answers live without reaching the server, so it can neither slide the
  // session nor land the browser on the banner itself. Only the page's redirect can.
  await page.route("**/api/session/activity", (route) =>
    route.fulfill({
      json: { idleExpiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    })
  );

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await queryDatabase(
    `update session set last_active_at = now() - interval '${IDLE_MINUTES + 1} minutes' where id = '${current}'`
  );

  // An in-app navigation: the client router fetches the page's server payload, and the root
  // layout does not run again, so the page's own idle redirect is the one the browser follows.
  // No link to the account page exists yet, so the test drives Next's client router directly.
  const payload = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/account" &&
      request.headers()["rsc"] === "1"
  );

  await page.evaluate(() => {
    // SAFETY: Next sets `window.next.router` to the app router instance in every build; the test
    // calls its `push` and nothing else, and fails loudly below if the router is not there.
    const { next } = window as {
      readonly next?: { readonly router?: { push(href: string): void } };
    };

    if (next?.router === undefined)
      throw new Error("Next's client router is not on window.next");

    next.router.push("/account");
  });

  await payload;

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe("/sign-in");

  expect(new URL(page.url()).searchParams.get("error")).toBe("session_expired");
  await expect(page.getByTestId("sign-in-banner")).toContainText(
    `${IDLE_MINUTES} minutes`
  );
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "genie-session"
    )
  ).toBe(false);

  // The row ends with the cookie (R-14, amended 2026-10-19).
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("0");
});
