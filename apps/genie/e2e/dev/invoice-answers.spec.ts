import { readFileSync } from "node:fs";

import { DEMO_PACK } from "@genie/module-invoices/testing";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import {
  askQuestion,
  FIRST_PAINT,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
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
 * in `next dev` with the model stand-in. The stand-in replays the app's hand-written answers, and
 * every figure and row comes from the chart gate over the seeded demo history.
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

const MONEY = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "SGD",
});

const sgd = (dollars: number) => MONEY.format(dollars);

const RECORD_PATH = /^\/m\/invoices\/invoices\/[0-9a-f-]{36}$/;

const figure = (page: Page, title: string) =>
  page.getByRole("figure", { name: title });

/** Asks the question of `id` on Ask as this project's own person, so no two runs share a list. */
async function askOnAsk(page: Page, testInfo: TestInfo, id: string) {
  const prompt = QUESTIONS.find((question) => question.id === id)?.prompt;

  if (prompt === undefined) throw new Error(`No expected answer ${id}.`);

  // A development server compiles the shell, Ask, the route and the chart gate on first use.
  test.setTimeout(180_000);

  await hideDevelopmentWidgets(page);
  await signInAs(
    page,
    testInfo.project.name === "phone"
      ? INVOICE_ASK_PEOPLE.phone
      : INVOICE_ASK_PEOPLE.desktop
  );
  await page.goto("/ask");
  await expect(page.getByRole("textbox", { name: "Message Ask" })).toBeVisible(
    FIRST_PAINT
  );
  await askQuestion(page, prompt);
  await expect(
    page.getByText("As of 27 October 2026, the reporting date.")
  ).toBeVisible(FIRST_PAINT);
}

/** The viewport of the project, axe, and a full-page capture as evidence. */
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const width = testInfo.project.name === "phone" ? 390 : 1440;

  await page.setViewportSize({
    width,
    height: testInfo.project.name === "phone" ? 844 : 900,
  });
  await expectNoAxeViolations(page, name);
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${width}-light.png`),
    fullPage: true,
  });
}

test("the overdue invoices answer shows its date, rule, total and records, and a record opens in the app", async ({
  page,
}, testInfo) => {
  await askOnAsk(page, testInfo, "overdue-invoices");

  await expect(page.getByText(/^An invoice is overdue when/)).toBeVisible();
  await expect(
    figure(page, "Overdue total")
      .getByText(sgd(27350))
      .filter({ visible: true })
  ).toBeVisible(FIRST_PAINT);
  await expect(figure(page, "Overdue invoices").getByRole("link")).toHaveText(
    [
      "INV-2026-08-04",
      "INV-2026-09-03",
      "INV-2026-09-04",
      "INV-2026-10-01",
      "INV-2026-10-03",
    ],
    FIRST_PAINT
  );
  await capture(page, testInfo, "ask-overdue-invoices");

  // A click before hydration would make a full document load, so the marker is written after.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    // oxlint-disable-next-line no-underscore-dangle -- the marker `invoices.spec.ts` uses.
    window.__genieMarker = 1;
  });
  await figure(page, "Overdue invoices")
    .getByRole("link", { name: "INV-2026-08-04", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "INV-2026-08-04" })
  ).toBeVisible(FIRST_PAINT);
  // The host's link routes in the client, so the document, and the marker on it, survive.
  // oxlint-disable-next-line no-underscore-dangle -- as above.
  expect(await page.evaluate(() => window.__genieMarker)).toBe(1);
});

test("the late payer answer shows the counts per customer without links and every invoice paid late as a link", async ({
  page,
}, testInfo) => {
  await askOnAsk(page, testInfo, "repeated-late-payers");

  const counts = figure(page, "Late payment by customer");

  await expect(
    counts.getByText("ABC Trading").filter({ visible: true })
  ).toBeVisible(FIRST_PAINT);
  await expect(counts.getByRole("link")).toHaveCount(0);

  const paidLate = figure(page, "Invoices paid late").getByRole("link");

  await expect(paidLate).toHaveCount(13, FIRST_PAINT);
  expect(await paidLate.first().getAttribute("href")).toMatch(RECORD_PATH);
  await expect(
    page.getByText(
      "By that rule, ABC Trading, Harbor Foods and Orchid Retail pay late repeatedly.",
      { exact: false }
    )
  ).toBeVisible();
  await capture(page, testInfo, "ask-repeated-late-payers");
});

test("the monthly answer draws invoiced sales and collections from two datasets in one chart, with the open invoices as links", async ({
  page,
}, testInfo) => {
  await askOnAsk(page, testInfo, "monthly-invoiced-and-collected");

  const months = figure(page, "Invoiced sales and collections by month");

  await months.getByRole("tab", { name: "Table" }).click(FIRST_PAINT);

  // The table row on a desktop, the card on a phone: only one of the two is shown.
  const may = months
    .locator("tr, li")
    .filter({ visible: true, hasText: "May 2026" });

  await expect(may).toContainText(sgd(34900));
  await expect(may).toContainText(sgd(31300));
  await expect(
    figure(page, "Invoices with money outstanding").getByRole("link")
  ).toHaveCount(7, FIRST_PAINT);
  await capture(page, testInfo, "ask-monthly-invoiced-and-collected");
});
