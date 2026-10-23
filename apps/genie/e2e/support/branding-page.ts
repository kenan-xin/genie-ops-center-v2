import { expect, type Page } from "@playwright/test";

/** Publishes the Branding draft through the confirm dialog. The header holds Publish on a desktop, the bar on a phone. */
export async function publishBranding(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish", exact: true }).click();

  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published", { exact: true }).first()
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
}
