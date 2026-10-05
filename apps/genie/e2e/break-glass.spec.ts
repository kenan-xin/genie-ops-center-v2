import {
  insertCredentialPerson,
  markSetupDone,
  startDisposableDeployment,
  type DisposableDeployment,
} from "@genie/core/testing";
import { expect, test } from "@playwright/test";

import {
  E2E_BREAK_GLASS_PASSWORD,
  e2eBreakGlassEmail,
} from "../testing/e2e-keycloak.ts";
import { imageHostPort } from "../testing/image-ports.ts";
import { startImage, type RunningImage } from "../testing/image-process.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { fillAuthenticatorCode, totpCode } from "./support/break-glass.ts";
import { expectSecurityHeaders } from "./support/headers.ts";

/**
 * The break-glass door at phone and desktop viewports (Spec 2 AC-3, AC-15, R-19 to R-21, R-62 to
 * R-65, DEC-24): the forced first sign-in through both steps, the neutral rate-limit notice, and a
 * sign-in that works with the realm unreachable. The codes are real TOTP values, computed from the
 * manual key the enrollment card shows.
 */
const NEW_PASSWORD = "BreakGlass1!sw0rd";

/** The bound on a cold disposable image's first request under CPU contention. */
const COLD_REQUEST_MS = 60_000;

/** Starts a disposable app whose realm is a closed port, and one break-glass credential account. */
async function startStandaloneBreakGlass(port: number): Promise<{
  readonly deployment: DisposableDeployment;
  readonly image: RunningImage;
  readonly url: string;
}> {
  const deployment = await startDisposableDeployment([]);

  await markSetupDone(deployment.context);
  await insertCredentialPerson(deployment.context, {
    email: "standalone@example.invalid",
    password: E2E_BREAK_GLASS_PASSWORD,
    mustChangePassword: true,
    twoFactorEnabled: false,
  });

  const url = `http://127.0.0.1:${port}`;

  const image = await startImage(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: url,
      // A closed port: the realm never answers, exactly as a stopped Keycloak (R-54d, DEC-24).
      KEYCLOAK_URL: "http://127.0.0.1:1",
    },
    port
  );

  // The published port answers before the first navigation, exactly as the compose stack's
  // readiness is checked. Health is `degraded` with the realm closed, so only the status matters.
  await expect
    .poll(
      async () =>
        fetch(`${url}/api/health`)
          .then((response) => response.status)
          .catch(() => 0),
      { timeout: 60000 }
    )
    .toBe(200);

  return { deployment, image, url };
}

test("a limited break-glass session stays limited across navigation (S1, R-30)", async ({
  page,
}, testInfo) => {
  const email = e2eBreakGlassEmail(testInfo.project.name);

  // R-71: the break-glass door carries the Section 0 headers; it passes axe (DEC-21).
  expectSecurityHeaders(await page.goto("/admin/login"), "/admin/login");
  await expectNoAxeViolations(page, "/admin/login");

  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(E2E_BREAK_GLASS_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The door itself is exempt and shows the first unmet step.
  await expect(page.getByLabel("Current password")).toBeVisible();
  await expectNoAxeViolations(page, "forced password change");

  // Every other route answers the limited-session page, with the Section 0 headers (R-71).
  expectSecurityHeaders(await page.goto("/"), "limited-session page");
  await expect(page.getByTestId("limited-session-page")).toBeVisible();
  await expectNoAxeViolations(page, "limited-session page");

  // "Continue setup" is a full navigation back to the door.
  await page.getByRole("link", { name: "Continue setup" }).click();
  await expect(page.getByLabel("Current password")).toBeVisible();
  await expect(page.getByTestId("limited-session-page")).toHaveCount(0);

  // The door's member-sign-in transition is a full navigation too, so the limited page returns.
  await page.getByRole("link", { name: "Member sign-in" }).click();
  await expect(page.getByTestId("limited-session-page")).toBeVisible();
});

test("a first break-glass sign-in changes the password and enrolls an authenticator (AC-15)", async ({
  page,
}, testInfo) => {
  const email = e2eBreakGlassEmail(testInfo.project.name);

  await page.goto("/admin/login");

  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(E2E_BREAK_GLASS_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Forced password change.
  await page.getByLabel("Current password").fill(E2E_BREAK_GLASS_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set password and continue" }).click();

  // Enrollment: read the manual key and confirm with a real code.
  const manualKey = await page
    .getByTestId("enrollment-manual-key")
    .textContent();

  await expectNoAxeViolations(page, "authenticator enrollment");

  expect(manualKey).toBeTruthy();

  await fillAuthenticatorCode(page, totpCode(manualKey ?? ""));
  await page
    .getByRole("button", { name: "Confirm and open the console" })
    .click();

  // The limited session is gone: the account page answers, not the limited-session page.
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 30000 })
    .toBe("/admin/account");
  await expect(page.getByTestId("limited-session-page")).toHaveCount(0);
  await expectNoAxeViolations(page, "/admin/account");
});

test("a rate-limited break-glass sign-in shows the neutral notice and disables its inputs (R-21)", async ({
  page,
}, testInfo) => {
  const port = imageHostPort(3600 + testInfo.workerIndex * 2);
  const stack = await startStandaloneBreakGlass(port);

  try {
    await page.goto(`${stack.url}/admin/login`);

    const form = page.getByTestId("break-glass-sign-in");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each attempt is one credential request
      const refused = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/sign-in/email"),
        { timeout: 15000 }
      );

      // oxlint-disable-next-line no-await-in-loop
      await page.getByLabel("Email").fill("standalone@example.invalid");
      // oxlint-disable-next-line no-await-in-loop
      await page
        .getByLabel("Password", { exact: true })
        .fill("wrong-password-1!");
      // oxlint-disable-next-line no-await-in-loop
      await page.getByRole("button", { name: "Sign in" }).click();
      // oxlint-disable-next-line no-await-in-loop
      expect((await refused).status()).toBe(401);
      // oxlint-disable-next-line no-await-in-loop
      await expect(form.getByRole("alert")).toBeVisible();
    }

    // The eleventh attempt is refused by the fixed window: the neutral notice, inputs disabled.
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("rate-limit-notice")).toContainText(
      "Too many sign-in attempts"
    );
    await expect(page.getByTestId("rate-limit-notice")).toContainText(
      "minutes"
    );
    await expect(page.getByLabel("Email")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  } finally {
    await stack.image.stop();
    await stack.deployment.stop();
  }
});

test("a break-glass sign-in works with the realm unreachable (DEC-24)", async ({
  page,
}, testInfo) => {
  // The disposable image is cold: its first sign-in loads the auth route and runs the password
  // hash, which on a two-core CI runner beside the full suite took past 15 seconds (develop run
  // 37341899682). Health already answered, so the only wait left is that first request; the
  // budget is the one bound below, inside a test bound that leaves room for the rest.
  test.setTimeout(180_000);

  const port = imageHostPort(3610 + testInfo.workerIndex * 2);
  const stack = await startStandaloneBreakGlass(port);

  try {
    await page.goto(`${stack.url}/admin/login`);

    await page.getByLabel("Email").fill("standalone@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill(E2E_BREAK_GLASS_PASSWORD);

    const signedIn = page.waitForResponse(
      (response) => response.url().endsWith("/api/auth/sign-in/email"),
      { timeout: COLD_REQUEST_MS }
    );

    await page.getByRole("button", { name: "Sign in" }).click();

    // The credential step completes with no realm: Better Auth answers, then the forced card.
    expect((await signedIn).status(), await stack.image.logs()).toBe(200);

    await expect(page.getByLabel("Current password")).toBeVisible({
      timeout: COLD_REQUEST_MS,
    });

    await page.getByLabel("Current password").fill(E2E_BREAK_GLASS_PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page
      .getByRole("button", { name: "Set password and continue" })
      .click();

    const manualKey = await page
      .getByTestId("enrollment-manual-key")
      .textContent();

    await fillAuthenticatorCode(page, totpCode(manualKey ?? ""));
    await page
      .getByRole("button", { name: "Confirm and open the console" })
      .click();

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30000 })
      .toBe("/admin/account");
  } finally {
    await stack.image.stop();
    await stack.deployment.stop();
  }
});

test("re-enroll replaces the authenticator and the new code signs in (R-66, B3)", async ({
  page,
}, testInfo) => {
  const port = imageHostPort(3620 + testInfo.workerIndex * 2);
  const stack = await startStandaloneBreakGlass(port);

  try {
    await page.goto(`${stack.url}/admin/login`);

    // First sign-in: change the password, enroll with the first authenticator.
    await page.getByLabel("Email").fill("standalone@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill(E2E_BREAK_GLASS_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("Current password").fill(E2E_BREAK_GLASS_PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page
      .getByRole("button", { name: "Set password and continue" })
      .click();

    const firstKey = await page
      .getByTestId("enrollment-manual-key")
      .textContent();

    await fillAuthenticatorCode(page, totpCode(firstKey ?? ""));
    await page
      .getByRole("button", { name: "Confirm and open the console" })
      .click();

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30000 })
      .toBe("/admin/account");

    // Re-enroll: disable the current authenticator with the current password, then enroll anew.
    await page.getByRole("button", { name: "Re-enroll" }).click();
    await page.getByLabel("Confirm your password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Start re-enroll" }).click();

    const secondKey = await page
      .getByTestId("enrollment-manual-key")
      .textContent();

    expect(secondKey).toBeTruthy();

    await page.getByLabel("Code from the app").fill(totpCode(secondKey ?? ""));
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByTestId("enrollment-manual-key")).toHaveCount(0);

    // Sign in afterwards with the new authenticator's code.
    await page.context().clearCookies();
    await page.goto(`${stack.url}/admin/login`);
    await page.getByLabel("Email").fill("standalone@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await fillAuthenticatorCode(page, totpCode(secondKey ?? ""));
    await page.getByRole("button", { name: "Verify" }).click();

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30000 })
      .toBe("/admin/account");
  } finally {
    await stack.image.stop();
    await stack.deployment.stop();
  }
});
