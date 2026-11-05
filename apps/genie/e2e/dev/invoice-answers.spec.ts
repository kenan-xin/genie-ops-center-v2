import { readFileSync } from "node:fs";

import { DEMO_PACK } from "@genie/module-invoices/testing";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { escapeRegExp } from "es-toolkit";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  askQuestion,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
import { FIRST_PAINT, LEDGER_LOCK, LOCK_WAIT, onPhone } from "./dev-support.ts";
import { DEV_MODULES, INVOICE_ASK_PEOPLE } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("placeholder") || !DEV_MODULES.has("invoices"),
  "The invoice answer recordings hold the default selection's tool list."
);

declare global {
  interface Window {
    /** Written before a row link is clicked and read after it, so a document reload cannot pass. */
    __genieMarker?: number;
  }
}

/**
 * The invoice answers in Ask at the phone and the desktop viewport (Spec 7 AC-8, R-44, DEC-25),
 * in `next dev` with the model stand-in. The stand-in replays the app's live answer recordings
 * (`<question-id>-<n>.json`), and every row comes from the chart gate over the seeded demo history.
 * Each answer opens with its result, and its tables are cards that show their first rows.
 */

// SAFETY: the module's expected-answers file is read verbatim, and this spec owns its shape.
const QUESTIONS = (
  JSON.parse(
    readFileSync(new URL("../expected-answers.json", DEMO_PACK), "utf8")
  ) as {
    readonly questions: readonly {
      readonly id: string;
      readonly prompt: string;
    }[];
  }
).questions;

const RECORD_PATH = /^\/m\/invoices\/invoices\/[0-9a-f-]{36}$/;

const MORE = /^\d+ more rows, open the full list$/;

/** The cold route compiles plus the answer, with room for the lock to wait for the queue. */
const TEST_TIMEOUT = LOCK_WAIT + FIRST_PAINT.timeout + 60_000;

/** Console errors and uncaught errors of the current test's page: `next dev` shows each as an issue badge. */
let pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

/** The card of an answer's artifact: a button named by the artifact's title. */
const card = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}`) });

/** The first rows of the answer's `index`th table card, in the order the answer made them. */
const firstRows = (page: Page, index: number) =>
  page
    .getByRole("list", { name: "First rows" })
    .nth(index)
    .getByRole("listitem");

/** Opens a card in the artifact panel and answers the panel's table of that title. */
async function openCard(page: Page, title: string) {
  await card(page, title).click();

  return page
    .getByRole("region", { name: "Artifact", exact: true })
    .getByRole("group", { name: title, exact: true });
}

/** Asks the question of `id` on Ask as this project's own person, so no two runs share a list. */
async function askOnAsk(
  page: Page,
  testInfo: TestInfo,
  id: string,
  result: string
) {
  const prompt = QUESTIONS.find((question) => question.id === id)?.prompt;

  if (prompt === undefined) throw new Error(`No expected answer ${id}.`);

  // A development server compiles the shell, Ask, the route and the chart gate on first use.
  test.setTimeout(TEST_TIMEOUT);

  await hideDevelopmentWidgets(page);
  await signInAs(
    page,
    testInfo.project.name === "phone"
      ? INVOICE_ASK_PEOPLE.phone
      : INVOICE_ASK_PEOPLE.desktop
  );

  // The shell posts on mount, so this response proves hydration: a fill or Send before it can be
  // lost, leaving Send disabled and the conversation empty (`documents.spec.ts` waits the same).
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto("/ask");
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible(FIRST_PAINT);
  await mounted;

  await askQuestion(page, prompt);
  // The result comes first (R-44).
  await expect(page.getByText(result, { exact: true })).toBeVisible(
    FIRST_PAINT
  );
}

/** The viewport of the project, no page error, axe, and a full-page capture as evidence. */
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const width = testInfo.project.name === "phone" ? 390 : 1440;

  await page.setViewportSize({
    width,
    height: testInfo.project.name === "phone" ? 844 : 900,
  });
  await expectNoAxeViolations(page, name);
  expect(pageErrors, "the page logged an error").toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${width}-light.png`),
    fullPage: true,
  });
}

test("the overdue invoices answer gives its total first, shows its records card, and a record opens in the app", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await askOnAsk(
        page,
        testInfo,
        "overdue-invoices",
        "Five overdue invoices from three customers have SGD 27,350.00 unpaid in all."
      );

      const title = "Overdue invoices and their sources";

      // Five overdue invoices fit the card, so it shows them all and no "more".
      await expect(firstRows(page, 0)).toHaveCount(5, FIRST_PAINT);
      await expect(firstRows(page, 0).first()).toContainText("INV-2026-08-04");
      await capture(page, testInfo, "ask-overdue-invoices");

      const table = await openCard(page, title);

      await expect(table.getByRole("link")).toHaveText(
        [
          "INV-2026-08-04",
          "INV-2026-09-03",
          "INV-2026-09-04",
          "INV-2026-10-01",
          "INV-2026-10-03",
        ],
        FIRST_PAINT
      );

      // A click before hydration would make a full document load, so the marker is written after.
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => {
        // oxlint-disable-next-line no-underscore-dangle -- the marker `invoices.spec.ts` uses.
        window.__genieMarker = 1;
      });
      await table
        .getByRole("link", { name: "INV-2026-08-04", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "INV-2026-08-04" })
      ).toBeVisible(FIRST_PAINT);
      // The host's link routes in the client, so the document, and the marker on it, survive.
      // oxlint-disable-next-line no-underscore-dangle -- as above.
      expect(await page.evaluate(() => window.__genieMarker)).toBe(1);
    },
    LOCK_WAIT
  );
});

test("the late payer answer shows the counts per customer without links and the settled invoices as links", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await askOnAsk(
        page,
        testInfo,
        "repeated-late-payers",
        "Three customers repeatedly pay late."
      );

      await expect(firstRows(page, 0)).toHaveCount(3, FIRST_PAINT);

      // Two customers are late 4 times, so their order is the database's.
      await Promise.all(
        ["ABC Trading", "Harbor Foods", "Orchid Retail"].map((name) =>
          expect(
            page.getByRole("list", { name: "First rows" }).first()
          ).toContainText(name)
        )
      );

      // A table card shows its first 5 rows and how many more (FL2).
      await expect(firstRows(page, 1)).toHaveCount(5);
      await expect(
        page
          .getByRole("link", { name: MORE })
          .or(page.getByRole("button", { name: MORE }))
      ).toBeVisible();
      await capture(page, testInfo, "ask-repeated-late-payers");

      // A customer has no page, so its row opens nothing.
      const counts = await openCard(page, "Customers who repeatedly pay late");

      await expect(
        counts
          .getByText("ABC Trading", { exact: true })
          .filter({ visible: true })
      ).toBeVisible(FIRST_PAINT);
      await expect(counts.getByRole("link")).toHaveCount(0);

      // A phone opens the artifact as a sheet over the chat, so it closes before the next card.
      await page
        .getByRole("button", {
          name: onPhone(page) ? "Back to the chat" : "Close the artifact",
        })
        .click();

      const settled = await openCard(
        page,
        "Settled invoices with known due dates for these customers"
      );

      expect(
        await settled.getByRole("link").first().getAttribute("href")
      ).toMatch(RECORD_PATH);
    },
    LOCK_WAIT
  );
});

test("the monthly answer states both totals first and shows the chart and the invoices behind it", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await askOnAsk(
        page,
        testInfo,
        "monthly-invoiced-and-collected",
        "From May to October, SGD 236,400.00 was invoiced and SGD 195,200.00 was collected."
      );

      await expect(
        card(page, "Invoiced and collected by month, May–October 2026")
      ).toBeVisible(FIRST_PAINT);
      await expect(firstRows(page, 0)).toHaveCount(5);
      await capture(page, testInfo, "ask-monthly-invoiced-and-collected");

      const invoices = await openCard(page, "Invoices dated May–October 2026");

      expect(
        await invoices.getByRole("link").first().getAttribute("href")
      ).toMatch(RECORD_PATH);
    },
    LOCK_WAIT
  );
});
