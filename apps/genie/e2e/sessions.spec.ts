import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * The idle rule and the account page as a browser sees them (Spec 2 R-14, R-15, R-15a, R-18,
 * AC-5), at the phone and the desktop viewport, signed in through the real Keycloak realm the
 * setup run created. The idle boundary itself is staged in the database - the tenant's real
 * window is 15 minutes, and no e2e run waits it out - while every read, slide, and refusal the
 * assertions see goes through the real routes.
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

  // Sessions: the current card carries the chip; the other card names its device and address.
  // The application stylesheet does not carry the design tokens yet (Section 3), so the card
  // list is the layout the running app shows; the desktop table is proven in Storybook.
  const sessionsList = page.getByRole("list", { name: "Sessions" });

  await expect(sessionsList.getByText("THIS DEVICE")).toBeVisible();

  // The other card names the device line the inserted row's user agent carries.
  const otherCard = sessionsList
    .getByRole("listitem")
    .filter({ hasText: "192.0.2.50" });

  await expect(otherCard.getByText("Windows")).toBeVisible();

  // Roles and access: the seeded reader role, tenant-wide and direct (R-27 loader).
  await expect(page.getByText("E2E reader")).toBeVisible();
  await expect(page.getByText("Whole tenant")).toBeVisible();
  await expect(page.getByText("Direct", { exact: true })).toBeVisible();

  // Per-session sign-out: the dialog names the device, and the confirm deletes the row.
  await otherCard.getByRole("button", { name: "Sign out" }).click();

  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText(/Windows/)).toBeVisible();

  dialog.getByRole("button", { name: "Sign out" }).click();

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

  await expect
    .poll(() => sessionRowCount(third), { timeout: 10_000 })
    .toBe("0");
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("1");
});

test("the activity call slides a live session and answers the absolute idle expiry (R-15, R-15a)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  const current = await currentSessionId(page, email);

  await page.goto("/");

  // The mount read answers the expiry the client exposes (R-15a).
  const attribute = page.locator("[data-session-idle-expiry]");

  await expect(attribute).toHaveCount(1, { timeout: 10_000 });

  const mounted = await attribute.getAttribute("data-session-idle-expiry");

  expect(mounted).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // Real input: one pointer event reaches the route, which is the one writer of last activity.
  const activity = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/session/activity") &&
      response.status() === 200
  );

  await page.mouse.click(10, 10);

  const answer = await activity;

  // SAFETY: the route's own handler answers `{ idleExpiresAt }` as JSON.
  const body = (await answer.json()) as { readonly idleExpiresAt?: string };

  expect(body.idleExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const [lastActive] = await queryDatabase(
    `select last_active_at is not null from session where id = '${current}'`
  );

  expect(lastActive).toBe("t");
});

test("an idle session is refused and the browser lands on the expired banner (R-14, R-17a)", async ({
  page,
}, testInfo) => {
  const email = sessionsEmail(testInfo);

  await signInThroughKeycloak(page, { email });

  const current = await currentSessionId(page, email);

  await page.goto("/");

  // The tenant's real 15 minute window, staged past: the next enforced read refuses the row.
  await queryDatabase(
    `update session set last_active_at = now() - interval '${IDLE_MINUTES + 1} minutes' where id = '${current}'`
  );

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

  // The idle rule deleted the row; the cleared cookie names no session.
  await expect
    .poll(() => sessionRowCount(current), { timeout: 10_000 })
    .toBe("0");
});
