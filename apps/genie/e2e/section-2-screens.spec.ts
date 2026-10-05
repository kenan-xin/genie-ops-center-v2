import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createRealmUser,
  deleteRealmUser,
  E2E_SIGN_IN_REALM,
  E2E_USER_PASSWORD,
  e2eReaderEmail,
} from "../testing/e2e-keycloak.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { queryDatabase } from "./support/database.ts";
import { expectSecurityHeaders } from "./support/headers.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * Section 2 acceptance across its screens (Spec 2 AC-3, AC-18, R-17a, R-62, R-71, DEC-21): every
 * sign-in page state, and every signed-in screen this section adds, carries the Section 0 headers
 * and passes axe at the phone and the desktop viewport. The break-glass door, the limited-session
 * page and the not-set-up page are checked in their own specs, where their state is reached.
 */

/** The sign-in page states by their `?error=` cause; `undefined` is the default state. */
const SIGN_IN_STATES = [
  undefined,
  "signed_out",
  "session_expired",
  "not_registered",
  "access_disabled",
] as const;

test("each sign-in page state carries the headers and passes axe, and the door is not linked", async ({
  page,
}) => {
  for (const state of SIGN_IN_STATES) {
    const path = state === undefined ? "/sign-in" : `/sign-in?error=${state}`;

    // oxlint-disable-next-line no-await-in-loop -- one state at a time on one page.
    const response = await page.goto(path);

    expectSecurityHeaders(response, path);

    // oxlint-disable-next-line no-await-in-loop -- one state at a time on one page.
    await expect(page.locator("main")).toHaveAttribute(
      "data-sign-in-state",
      state ?? "default"
    );

    // oxlint-disable-next-line no-await-in-loop -- one state at a time on one page.
    await expect(page.getByTestId("sign-in-banner")).toHaveCount(
      state === undefined ? 0 : 1
    );

    // oxlint-disable-next-line no-await-in-loop -- one state at a time on one page.
    await expectNoAxeViolations(page, path);
  }

  // R-62: the break-glass door is not linked from the sign-in page.
  await page.goto("/sign-in");
  await expect(page.locator('a[href*="/admin/login"]')).toHaveCount(0);
});

test("a disabled person is refused after the realm authenticated them (R-11, R-17a)", async ({
  page,
}, testInfo) => {
  const email = `e2e.s2-16.banned.${testInfo.project.name}@example.com`;

  // A pre-added person whose row is banned, and a realm user that authenticates them.
  await deleteRealmUser(E2E_SIGN_IN_REALM, email);
  await createRealmUser(E2E_SIGN_IN_REALM, {
    email,
    password: E2E_USER_PASSWORD,
  });
  await queryDatabase(
    `insert into "user" (id, name, email, email_verified, status, banned)
       values ('${randomUUID()}', 'E2E Banned', '${email}', true, 'disabled', true)
     on conflict (email) do update set banned = true, status = 'disabled'`
  );

  await signInThroughKeycloak(page, { email, landing: "/sign-in" });

  expect(new URL(page.url()).searchParams.get("error")).toBe("access_disabled");
  await expect(page.getByTestId("sign-in-banner")).toHaveText(
    "Access for this account is disabled."
  );

  expect(
    await queryDatabase(
      `select count(*) from session where user_id = (select id from "user" where email = '${email}')`
    )
  ).toEqual(["0"]);
});

/** The signed-in screens of Section 2, and the module route the reader may not open. */
const SIGNED_IN_SCREENS = [
  "/",
  "/account",
  "/admin/people",
  "/admin/groups",
  "/admin/roles",
  "/admin/audit",
  "/placeholder",
  "/admin/placeholder",
] as const;

test("every signed-in Section 2 screen carries the headers and passes axe", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("screens", testInfo.project.name),
  });

  for (const path of SIGNED_IN_SCREENS) {
    // oxlint-disable-next-line no-await-in-loop -- one screen at a time on one page.
    const response = await page.goto(path);

    expectSecurityHeaders(response, path);

    // The client screens read through tRPC after hydration; axe runs on the settled page.
    // oxlint-disable-next-line no-await-in-loop -- one screen at a time on one page.
    await page.waitForLoadState("networkidle");

    // oxlint-disable-next-line no-await-in-loop -- one screen at a time on one page.
    await expectNoAxeViolations(page, path);
  }

  // R-35: the reader holds no `placeholder:admin`, so the route refuses on the server for a
  // signed-in person too, not only for an anonymous one.
  await page.goto("/admin/placeholder");
  await expect(page.getByTestId("permission-denied")).toBeVisible();
});
