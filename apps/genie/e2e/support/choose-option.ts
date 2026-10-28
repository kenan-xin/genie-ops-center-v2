import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Picks an option of a Base UI Select, which is not a native `<select>`: open the combobox by its
 * label, then click the option by its name. A multiple select takes one call per option, then the
 * caller presses Escape to close the list.
 *
 * The option is found only inside the list that this combobox controls, once that list shows. Two
 * selects can offer options of the same name, and under load the list of the previous select is
 * still closing: a page-wide lookup can then bind the click to that list, and Playwright retries
 * the click on the same hidden element until the test times out.
 */
export async function chooseOption(
  page: Page,
  label: string,
  option: string
): Promise<void> {
  const trigger = page.getByLabel(label, { exact: true });

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-controls", /.+/);

  const list = page.locator(
    `[id="${await trigger.getAttribute("aria-controls")}"]`
  );

  await expect(list).toBeVisible();
  await list.getByRole("option", { name: option, exact: true }).click();
}
