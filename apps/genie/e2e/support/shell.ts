import { expect, type Locator, type Page } from "@playwright/test";

/** Tailwind's `lg` breakpoint: from here the shell shows its aside, below it a drawer. */
const LG = 1024;

/** Whether this project's viewport shows the desktop aside rather than the phone drawer. */
export function atLg(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= LG;
}

/**
 * The shell's navigation panel (Spec 3 R-38). Below `lg` it opens the drawer and answers the
 * dialog "Navigation"; from `lg` it answers the complementary landmark of the same name. A click
 * before hydration does nothing, so the drawer open retries until the dialog shows.
 */
export async function openNavigation(page: Page): Promise<Locator> {
  if (atLg(page)) {
    const aside = page.getByRole("complementary", { name: "Navigation" });

    await expect(aside).toBeVisible();

    return aside;
  }

  // The shell stays mounted across a client navigation, so the drawer that a link just closed still
  // shows while it slides out; only an open one counts (Base UI's `data-open`).
  const drawer = page
    .getByRole("dialog", { name: "Navigation" })
    .and(page.locator("[data-open]"));

  // Each retry clicks only while the target is closed, so a slow open is never toggled shut.
  await expect(async () => {
    if (!(await drawer.isVisible())) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    await expect(drawer).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  return drawer;
}

/** Opens the navigation, then the user footer's menu (R-32), and answers the `menu`. */
export async function openUserMenu(page: Page): Promise<Locator> {
  const navigation = await openNavigation(page);
  const menu = page.getByRole("menu");

  await expect(async () => {
    if (!(await menu.isVisible())) {
      await navigation.locator("[data-shell-user-menu]").click();
    }

    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  return menu;
}
