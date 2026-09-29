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
import { fillAuthenticatorCode, totpCode } from "./support/break-glass.ts";

/**
 * The break-glass door at phone and desktop viewports (Spec 2 AC-3, AC-15, R-19 to R-21, R-62 to
 * R-65, DEC-24): the forced first sign-in through both steps, the neutral rate-limit notice, and a
 * sign-in that works with the realm unreachable. The codes are real TOTP values, computed from the
 * manual key the enrollment card shows.
 */
const NEW_PASSWORD = "BreakGlass1!sw0rd";

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
      { timeout: 15000 }
    );

    await page.getByRole("button", { name: "Sign in" }).click();

    // The credential step completes with no realm: Better Auth answers, then the forced card.
    expect((await signedIn).status(), await stack.image.logs()).toBe(200);

    await expect(page.getByLabel("Current password")).toBeVisible({
      timeout: 15000,
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
