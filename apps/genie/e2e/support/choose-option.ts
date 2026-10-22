import type { Page } from "@playwright/test";

/**
 * Picks an option of a Base UI Select, which is not a native `<select>`: open the combobox by its
 * label, then click the option by its name. A multiple select takes one call per option, then the
 * caller presses Escape to close the list.
 */
export async function chooseOption(
  page: Page,
  label: string,
  option: string
): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
