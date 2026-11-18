import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Opens a recipient from the Grants list (P12-17): a search that leaves exactly one row, then its
 * open button. Search by a unique name or an email; e2e people share one name.
 */
export async function openRecipient(page: Page, search: string): Promise<void> {
  await page
    .getByRole("searchbox", { name: "Search groups and people" })
    .fill(search);

  // The list keeps the last page while the new search loads, so only a row that holds the search
  // text counts: a table row from 768 px, else a card.
  const open = page
    .getByRole("row")
    .or(page.getByRole("listitem"))
    .filter({ hasText: search })
    .getByRole("button", { name: /^Open .+ in Grants$/ });

  await expect(open).toHaveCount(1);
  await open.click();
  await expect(
    page.getByRole("group", { name: "Granted", exact: true })
  ).toBeVisible();
}

/** Back from the editor to the list. */
export async function backToList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "All groups and people" }).click();
  await expect(
    page.getByRole("heading", { name: "Groups and people" })
  ).toBeVisible();
}

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

  // Exact: a staged row's Remove is named "..., not saved yet".
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(sheet).toBeHidden();
}
