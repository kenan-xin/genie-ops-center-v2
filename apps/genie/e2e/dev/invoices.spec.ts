import { readDemoCsv } from "@genie/module-invoices/testing";
import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  fact,
  LEDGER_LOCK,
  LOCK_WAIT,
  onPhone,
  sgd,
  signIn,
} from "./dev-support.ts";
import { DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("invoices"),
  "This run does not compile the invoices module."
);

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
 * Navigates and waits for the shell's mount ping, so hydration and any dev-server reload are over
 * before a test reads the page (a cold compile can reload a page while axe runs).
 */
async function openList(
  page: Page,
  path: string,
  heading: string
): Promise<void> {
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible(FIRST_PAINT);
  await mounted;
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

test("the Invoices list shows every seeded invoice with its outstanding amount and status", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/invoices", "Invoices");
      await expect(
        page.getByText("Balances as of 2026-10-27, the reporting date.")
      ).toBeVisible();

      const expected = readDemoCsv("04_Demo_Guide/expected_invoice_status.csv");

      expect(expected).toHaveLength(36);

      const shown = await shownRows(page, "Invoices");

      expect(shown).toHaveLength(expected.length);
      // A whole list offers no next page (czjw.28).
      await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(
        0
      );

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
    },
    LOCK_WAIT
  );
});

test("INV-2026-09-03 opens from its row without a document load and shows its balance, its link, its history and its PDF", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/invoices", "Invoices");

      // A click before hydration would make a full document load even through `PageLink`, so the
      // marker is written only after the client has settled.
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => {
        // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
        window.__genieMarker = 1;
      });

      await page
        .getByRole("link", { name: "INV-2026-09-03", exact: true })
        .click();

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
    },
    LOCK_WAIT
  );
});

test("the Payments list shows every seeded payment and the payment linked to INV-2026-09-03 names it", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/payments", "Payments");
      await expect(
        page.getByText("Amounts as of 2026-10-27, the reporting date.")
      ).toBeVisible();

      const payments = readDemoCsv("01_History_Datasets/payments.csv");

      expect(payments).toHaveLength(30);

      const shown = await shownRows(page, "Payments");

      expect(shown).toHaveLength(payments.length);
      // A whole list offers no next page (czjw.28).
      await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(
        0
      );

      const problems = payments.flatMap((payment) => {
        const row = shown.find(
          (entry) => entry.label === payment.payment_reference
        );

        if (row === undefined) return [`${payment.payment_id}: not shown`];

        const amount = sgd(Number(payment.amount));

        return row.text.includes(amount)
          ? []
          : [
              `${payment.payment_id}: no ${amount} in ${JSON.stringify(row.text)}`,
            ];
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

      await page
        .getByRole("link", { name: reference ?? "", exact: true })
        .click();

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
    },
    LOCK_WAIT
  );
});
