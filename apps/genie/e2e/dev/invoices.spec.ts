import { mintDevSession } from "@genie/core/testing";
import { readDemoCsv } from "@genie/module-invoices/testing";
import { expect, test, type Page } from "@playwright/test";

import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { DEMO_ACCOUNT_EMAIL, DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

declare global {
  interface Window {
    /** Written before a row link is clicked and read after it, so a document reload cannot pass. */
    __genieMarker?: number;
  }
}

/**
 * The seeded demo pages, on the development run's own disposable database (Task 9, P17). The
 * global setup seeds the demo pack and the demo account's roles with `seed-demo.ts`; these cases
 * read what the assembled pages show at the phone and the desktop viewport (R-59, R-60, DEC-25).
 */

const PUBLIC_URL = `http://127.0.0.1:${DEV_PORT}`;

/** A development server compiles a route when it is first asked for (see `devtools.spec.ts`). */
const FIRST_PAINT = { timeout: 120_000 };

const MONEY = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "SGD",
});

const sgd = (dollars: number) => MONEY.format(dollars);

/** Below Tailwind's `md`, `DataTable` draws its card list instead of the table. */
const onPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

type ShownRow = {
  /** The identity cell: the invoice number or the payment label. */
  readonly label: string;
  /** The badge's text, which is the status on both layouts. */
  readonly status: string;
  readonly text: string;
};

/** Every shown row of a list, read from whichever layout the viewport draws. */
function shownRows(page: Page, label: string): Promise<readonly ShownRow[]> {
  return onPhone(page)
    ? page
        .getByRole("list", { name: label })
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.map((item) => ({
            label: item.querySelector("a")?.textContent?.trim() ?? "",
            status:
              item.querySelector('[data-slot="badge"]')?.textContent?.trim() ??
              "",
            text: item.textContent ?? "",
          }))
        )
    : page
        .getByRole("table", { name: label })
        .locator("tbody tr")
        .evaluateAll((rows) =>
          rows.map((row) => ({
            label: row.querySelector("td")?.textContent?.trim() ?? "",
            status:
              row.querySelector('[data-slot="badge"]')?.textContent?.trim() ??
              "",
            text: row.textContent ?? "",
          }))
        );
}

/**
 * The demonstration account's session, minted directly (no realm in this run). Authorization stays
 * real: `can()` reads the roles the seed granted the same person.
 */
async function signIn(page: Page): Promise<void> {
  const { name, value, url, httpOnly, sameSite, expires } =
    await mintDevSession({
      databaseUrl: `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`,
      publicUrl: PUBLIC_URL,
      secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
      subject: { email: DEMO_ACCOUNT_EMAIL },
    });

  // Playwright refuses a cookie that carries both `url` and `path`; the `url` names the path.
  await page
    .context()
    .addCookies([{ name, value, url, httpOnly, sameSite, expires }]);
}

/** The pack's status word in the page's word (P9). */
function statusText(invoice: Readonly<Record<string, string>>): string {
  switch (invoice.status) {
    case "overdue":
      return `Overdue · ${invoice.days_overdue} days`;
    case "paid":
      return "Paid";
    case "open":
      return "Open";
    case "due_date_unspecified":
      return "No due date";
    default:
      throw new Error(
        `The demo pack names an unknown status ${invoice.status}.`
      );
  }
}

/** One fact of a record page, read through the term that labels it. */
const fact = (page: Page, label: string) =>
  page.locator(
    `xpath=//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`
  );

test("the Invoices list shows every seeded invoice with its outstanding amount and status", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page);
  await page.goto("/m/invoices/invoices");

  await expect(
    page.getByRole("heading", { level: 1, name: "Invoices" })
  ).toBeVisible(FIRST_PAINT);
  await expect(
    page.getByText("Balances as of 2026-10-27, the reporting date.")
  ).toBeVisible();

  const expected = readDemoCsv("04_Demo_Guide/expected_invoice_status.csv");

  expect(expected).toHaveLength(36);

  const shown = await shownRows(page, "Invoices");

  expect(shown).toHaveLength(expected.length);

  const problems = expected.flatMap((invoice) => {
    const row = shown.find((entry) => entry.label === invoice.invoice_id);

    if (row === undefined) return [`${invoice.invoice_id}: not shown`];

    const found: string[] = [];
    const status = statusText(invoice);

    if (row.status !== status) {
      found.push(
        `${invoice.invoice_id}: status ${JSON.stringify(row.status)}, expected ${JSON.stringify(status)}`
      );
    }

    const amount = sgd(Number(invoice.outstanding_amount));

    if (!row.text.includes(amount)) {
      found.push(
        `${invoice.invoice_id}: no ${amount} in ${JSON.stringify(row.text)}`
      );
    }

    return found;
  });

  expect(problems).toEqual([]);

  await expectNoAxeViolations(page, "invoices list");
});

test("INV-2026-09-03 opens from its row without a document load and shows its balance, its link, its history and its PDF", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page);
  await page.goto("/m/invoices/invoices");

  await expect(
    page.getByRole("heading", { level: 1, name: "Invoices" })
  ).toBeVisible(FIRST_PAINT);

  // A click before hydration would make a full document load even through `PageLink`, so the
  // marker is written only after the client has settled.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
    window.__genieMarker = 1;
  });

  await page.getByRole("link", { name: "INV-2026-09-03", exact: true }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "INV-2026-09-03" })
  ).toBeVisible(FIRST_PAINT);

  // `PageLink` routes in the client, so the document, and the marker on it, survive.
  // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
  expect(await page.evaluate(() => window.__genieMarker)).toBe(1);

  await expect(fact(page, "Total")).toHaveText(sgd(7200));
  await expect(fact(page, "Allocated")).toHaveText(sgd(2000));
  await expect(fact(page, "Outstanding")).toHaveText(sgd(5200));
  await expect(fact(page, "Status")).toHaveText("Overdue · 40 days");

  const allocations = onPhone(page)
    ? page.getByRole("list", { name: "Allocations" }).getByRole("listitem")
    : page
        .getByRole("table", { name: "Allocations" })
        .locator("tbody")
        .getByRole("row");

  await expect(allocations).toHaveCount(1);
  await expect(allocations).toContainText("TXN-PAY-2026-026");
  await expect(allocations).toContainText(sgd(2000));

  const history = await shownRows(page, "History");

  expect(history).toHaveLength(1);
  expect(history[0]?.text).toContain("Linked");

  const pdf = page.getByRole("link", {
    name: "Open the source document (PDF)",
  });

  const href = await pdf.getAttribute("href");

  expect(href).toBeTruthy();

  const response = await page.request.get(
    new URL(href ?? "", page.url()).toString()
  );

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");

  await expectNoAxeViolations(page, "invoice record page");
});

test("the Payments list shows every seeded payment and the payment linked to INV-2026-09-03 names it", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page);
  await page.goto("/m/invoices/payments");

  await expect(
    page.getByRole("heading", { level: 1, name: "Payments" })
  ).toBeVisible(FIRST_PAINT);
  await expect(
    page.getByText("Amounts as of 2026-10-27, the reporting date.")
  ).toBeVisible();

  const payments = readDemoCsv("01_History_Datasets/payments.csv");

  expect(payments).toHaveLength(30);

  const shown = await shownRows(page, "Payments");

  expect(shown).toHaveLength(payments.length);

  const problems = payments.flatMap((payment) => {
    const row = shown.find(
      (entry) => entry.label === payment.payment_reference
    );

    if (row === undefined) return [`${payment.payment_id}: not shown`];

    const amount = sgd(Number(payment.amount));

    return row.text.includes(amount)
      ? []
      : [`${payment.payment_id}: no ${amount} in ${JSON.stringify(row.text)}`];
  });

  expect(problems).toEqual([]);

  await expectNoAxeViolations(page, "payments list");

  const allocation = readDemoCsv(
    "01_History_Datasets/payment_allocations.csv"
  ).find((row) => row.invoice_id === "INV-2026-09-03");

  const payment = payments.find(
    (row) => row.payment_id === allocation?.payment_id
  );

  const reference = payment?.payment_reference;

  expect(reference).toBeTruthy();

  await page.getByRole("link", { name: reference ?? "", exact: true }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: reference ?? "" })
  ).toBeVisible(FIRST_PAINT);

  const allocations = onPhone(page)
    ? page.getByRole("list", { name: "Allocations" }).getByRole("listitem")
    : page
        .getByRole("table", { name: "Allocations" })
        .locator("tbody")
        .getByRole("row");

  await expect(allocations).toHaveCount(1);
  await expect(allocations).toContainText("INV-2026-09-03");

  await expectNoAxeViolations(page, "payment record page");
});
