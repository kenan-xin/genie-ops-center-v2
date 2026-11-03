import { expect, type Locator, type Page } from "@playwright/test";

/** Opens Advanced access for the chosen recipient and waits for the sheet. */
export async function openAdvancedAccess(page: Page): Promise<Locator> {
  await page
    .getByRole("button", { name: "Advanced access", exact: true })
    .click();

  const sheet = page.getByRole("dialog", { name: "Advanced access" });

  await expect(sheet).toBeVisible();

  return sheet;
}

/** Saves the sheet and waits for the write; the sheet closes on success. */
export async function saveAdvancedAccess(
  page: Page,
  sheet: Locator
): Promise<void> {
  const response = page.waitForResponse((answer) =>
    answer.url().includes("/api/rpc/roles/saveAdvanced")
  );

  await sheet.getByRole("button", { name: "Save changes" }).click();
  expect((await response).status()).toBe(200);
  await expect(sheet).toBeHidden();
}
