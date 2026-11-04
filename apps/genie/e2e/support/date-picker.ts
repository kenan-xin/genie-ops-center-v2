import { expect, type Locator, type Page } from "@playwright/test";

/*
 * The date pickers of `@genie/ui` (owner I8). Each day button carries its ISO day in `data-day`,
 * so a test picks a day by its date, not by its place in the grid.
 */

/** Moves the open calendar to the month of `day` (ISO), at most 24 months, and picks it. */
async function pickInOpenCalendar(
  page: Page,
  day: string,
  monthsLeft = 24
): Promise<void> {
  const target = page.locator(`button[data-day="${day}"]`);

  if (monthsLeft === 0 || (await target.isVisible())) {
    await target.click();

    return;
  }

  const shown = await page
    .locator("button[data-day]")
    .first()
    .getAttribute("data-day");

  await page
    .getByRole("button", {
      name:
        shown !== null && day < shown
          ? "Go to the Previous Month"
          : "Go to the Next Month",
    })
    .click();

  await pickInOpenCalendar(page, day, monthsLeft - 1);
}

/** Opens the calendar, moves to the month of `day` (ISO), and picks it. */
export async function pickDay(
  page: Page,
  opener: Locator,
  day: string
): Promise<void> {
  await opener.click();
  await expect(page.getByRole("grid").first()).toBeVisible();
  await pickInOpenCalendar(page, day);
  await expect(page.getByRole("grid")).toHaveCount(0);
}

/** Opens the range calendar, picks `from` then `to` (ISO days), and presses Done. */
export async function pickRange(
  page: Page,
  trigger: Locator,
  from: string,
  to: string
): Promise<void> {
  await trigger.click();
  await expect(page.getByRole("grid").first()).toBeVisible();
  await pickInOpenCalendar(page, from);
  await pickInOpenCalendar(page, to);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveCount(0);
}
