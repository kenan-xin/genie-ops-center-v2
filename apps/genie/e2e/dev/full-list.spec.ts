import { readFileSync } from "node:fs";

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readSheet } from "read-excel-file/node";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  askQuestion,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
import { FIRST_PAINT, LEDGER_LOCK, LOCK_WAIT } from "./dev-support.ts";
import { DEV_MODULES, INVOICE_ASK_PEOPLE } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("placeholder") || !DEV_MODULES.has("invoices"),
  "The full list recordings hold the default selection's tool list."
);

/**
 * A full list (S7-35, `czjw.85`) in Ask at the phone and the desktop viewport: the answer shows
 * the first 5 rows and how many more, the table artifact holds every row, and a core background
 * job makes an Excel file while the chat goes on. The stand-in replays `full-list-*.json`.
 */

/** The cold route compiles plus three answers and the file job, with room for the lock. */
const TEST_TIMEOUT = LOCK_WAIT + FIRST_PAINT.timeout + 120_000;

const MORE = /^(\d+) more rows, open the full list$/;

const widthOf = (testInfo: TestInfo) =>
  testInfo.project.name === "phone" ? 390 : 1440;

const shot = (page: Page, testInfo: TestInfo, screen: string) =>
  page.screenshot({
    path: testInfo.outputPath(
      `czjw.85-${screen}-${widthOf(testInfo)}-light.png`
    ),
  });

/** The lines of a CSV file: no selected field holds a line break. */
const csvLines = (path: string) =>
  readFileSync(path, "utf8").trimEnd().split(/\r?\n/);

test("a list answer shows 5 rows and how many more, opens the full list, and makes an Excel file while the chat goes on", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await hideDevelopmentWidgets(page);
      await signInAs(
        page,
        testInfo.project.name === "phone"
          ? INVOICE_ASK_PEOPLE.phone
          : INVOICE_ASK_PEOPLE.desktop
      );

      // The shell posts on mount, so this response proves hydration before the question.
      const mounted = page.waitForResponse((response) =>
        response.url().endsWith("/api/session/activity")
      );

      await page.goto("/ask");
      await expect(
        page.getByRole("textbox", { name: "Message", exact: true })
      ).toBeVisible(FIRST_PAINT);
      await mounted;

      // 1. The table card shows its first 5 rows and how many more.
      await askQuestion(page, "List all invoices.");
      await expect(
        page.getByRole("list", { name: "First rows" }).getByRole("listitem")
      ).toHaveCount(5, FIRST_PAINT);

      const more = page
        .getByRole("button", { name: MORE })
        .or(page.getByRole("link", { name: MORE }));

      await expect(more).toBeVisible();

      const name = (await more.textContent()) ?? "";
      const hidden = Number(/^(\d+)/.exec(name)?.[1] ?? 0);

      expect(hidden).toBeGreaterThan(0);
      await expectNoAxeViolations(page, "Ask with a short list");
      await more.scrollIntoViewIfNeeded();
      await shot(page, testInfo, "short-list");

      // 2. The full list opens as the table artifact, which holds every row.
      await more.click();

      const panel = page.getByRole("region", { name: "Artifact", exact: true });

      await expect(
        panel.getByRole("heading", { name: "All invoices", exact: true })
      ).toBeVisible(FIRST_PAINT);

      const rows = page.waitForEvent("download");

      await panel.getByRole("button", { name: "Download the rows" }).click();

      const rowsFile = await (await rows).path();

      expect(csvLines(rowsFile)).toHaveLength(1 + 5 + hidden);
      await expectNoAxeViolations(page, "The table artifact");
      await shot(page, testInfo, "table-artifact");
      await panel
        .getByRole("button", {
          name:
            testInfo.project.name === "phone"
              ? "Back to the chat"
              : "Close the artifact",
        })
        .click();

      // 3. A file of the same list, made by a background job.
      await askQuestion(page, "Make an Excel file of all invoices.");

      const card = page.getByRole("group", { name: "All invoices" });

      await expect(card.getByText("Excel file", { exact: false })).toBeVisible(
        FIRST_PAINT
      );

      // 4. The chat goes on while the job runs, whatever its state.
      await askQuestion(page, "Thank you.");
      await expect(
        page.getByText("You are welcome.", { exact: true })
      ).toBeVisible(FIRST_PAINT);

      // 5. The file holds every row.
      const download = card.getByRole("button", { name: "Download" });

      await expect(download).toBeVisible(FIRST_PAINT);

      const file = page.waitForEvent("download");

      await download.click();

      const saved = await file;

      expect(saved.suggestedFilename()).toBe("All invoices.xlsx");
      expect(await readSheet(readFileSync(await saved.path()))).toHaveLength(
        1 + 5 + hidden
      );
    },
    LOCK_WAIT
  );
});
