import { expect, test } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/**
 * `6wz1.129`: an unknown address answers 404 with the branded page and a way home, and inside the
 * workspace shell when signed in. Each proof runs at the phone and the desktop project (DEC-25).
 */
test.describe.configure({ timeout: 120_000 });

test("an unknown address answers 404 with a way home (6wz1.129)", async ({
  page,
}) => {
  const response = await page.goto("/no-such-page");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to home", exact: true })
  ).toHaveAttribute("href", "/");
});

test("an unknown module address answers 404 inside the shell (6wz1.129)", async ({
  page,
}, testInfo) => {
  await signInThroughKeycloak(page, {
    email: e2eReaderEmail("not-found", testInfo.project.name),
  });

  const response = await page.goto("/m/not-a-module");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();

  const navigation = await openNavigation(page);

  await expect(
    navigation.getByRole("navigation", { name: "Workspace", exact: true })
  ).toBeVisible();
});
