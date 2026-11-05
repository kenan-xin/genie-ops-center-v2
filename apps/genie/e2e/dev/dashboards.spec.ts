import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  ANALYTICS_CHAT_DASHBOARD,
  ANALYTICS_CHAT_MESSAGE,
} from "../../testing/analytics-chat.ts";
import { RECEIVABLES_OVERVIEW } from "../../testing/receivables-overview.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  openAgentPanel,
  signInAs,
} from "./ask-support.ts";
import {
  closeDashboardDatabase,
  customerIdOf,
  removeTestPayments,
  resetChatDashboard,
} from "./dashboard-support.ts";
import { LEDGER_LOCK, LOCK_WAIT, sgd } from "./dev-support.ts";
import {
  ANALYTICS_PEOPLE,
  DEMO_ACCOUNT_EMAIL,
  DEV_MODULES,
} from "./global-setup.ts";

declare global {
  interface Window {
    /** Written before the chat change and read after the refresh, so a document reload cannot pass. */
    __genieMarker?: number;
  }
}

test.skip(
  !(
    DEV_MODULES.has("analytics") &&
    DEV_MODULES.has("invoices") &&
    DEV_MODULES.has("placeholder")
  ),
  "The analytics chat recordings hold the default selection's tool list."
);

/**
 * The assembled Dashboards pages in `next dev` on the disposable demo database (Spec 7 AC-9,
 * R-48 to R-51). The demo seed writes the Receivables overview starter; the chat adds a panel to
 * a fixed dashboard, a saved payment reaches it without a reload, and Undo removes it.
 */

/** The task's evidence, at the viewport the project runs. */
async function screenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`dashboards-${name}.png`),
    fullPage: true,
  });
}

const figure = (page: Page, title: string) =>
  page.getByRole("figure", { name: title });

// The development widgets float over the chat's Send in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(() => closeDashboardDatabase());

test("the demo account's Receivables overview shows the baseline totals", async ({
  page,
}, testInfo) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signInAs(page, DEMO_ACCOUNT_EMAIL);
      await page.goto("/m/analytics/dashboards");

      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboards" })
      ).toBeVisible(FIRST_PAINT);
      await expectNoAxeViolations(page, "dashboards list");

      await page
        .getByRole("link", { name: RECEIVABLES_OVERVIEW.name, exact: true })
        .click();

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: RECEIVABLES_OVERVIEW.name,
        })
      ).toBeVisible(FIRST_PAINT);

      const totals = [
        ["Invoiced sales", sgd(236_400)],
        ["Collections", sgd(195_200)],
        ["Outstanding", sgd(41_200)],
        ["Overdue", sgd(27_350)],
      ] as const;

      await Promise.all(
        totals.map(([title, amount]) =>
          expect(
            figure(page, title).getByText(amount, { exact: true })
          ).toBeVisible(FIRST_PAINT)
        )
      );

      await expectNoAxeViolations(page, "receivables overview");
      await screenshot(page, testInfo, `receivables-${testInfo.project.name}`);
    },
    LOCK_WAIT
  );
});

test("a dashboard built by chat refreshes after a payment is saved, and Undo removes its panel", async ({
  page,
}, testInfo) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  const reference = `e2e-dashboards-${testInfo.project.name}`;

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeTestPayments("e2e-dashboards-");
      await resetChatDashboard();

      try {
        await signInAs(page, ANALYTICS_PEOPLE.chat);
        await page.goto(
          `/m/analytics/dashboards/${ANALYTICS_CHAT_DASHBOARD.id}`
        );

        // The agent panel: a column beside the dashboard from 1280 px, a sheet below (AG11).
        const chat = await openAgentPanel(page);

        // Before the chat change, so a reload of either the chat path or the refresh drops it.
        await page.evaluate(() => {
          // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
          window.__genieMarker = 1;
        });

        const message = chat.getByRole("textbox", {
          name: "Message",
          exact: true,
        });

        await message.fill(ANALYTICS_CHAT_MESSAGE);

        const send = chat.getByRole("button", { name: "Send" });

        if (testInfo.project.name === "phone") {
          await send.tap({ timeout: 15_000 });
          // The sheet covers the phone screen, so close it to see the dashboard.
          await chat
            .getByRole("button", { name: "Close the agent panel" })
            .tap();
        } else {
          await send.click({ timeout: 15_000 });
        }

        // The panel grid comes before the chat, so the dashboard's own figure is the first. The
        // baseline ledger links every payment, so nothing is unallocated yet.
        const unallocated = figure(page, "Unallocated payments").first();

        await expect(
          unallocated.getByText(sgd(0), { exact: true })
        ).toBeVisible(FIRST_PAINT);

        const saved = await page.request.post("/api/rpc/invoices/savePayment", {
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
          },
          data: {
            json: {
              documentId: null,
              customer: { id: await customerIdOf("Lumi Design") },
              paymentDate: "2026-10-20",
              currency: "SGD",
              amountCents: 123_400,
              reference,
              method: null,
              namedInvoiceNumbers: [],
              allocations: [],
              keepPossibleDuplicate: true,
            },
          },
        });

        expect(saved.ok(), await saved.text()).toBe(true);

        // The saved payment has no link, so all of it is unallocated.
        await expect(
          unallocated.getByText(sgd(1_234), { exact: true })
        ).toBeVisible({ timeout: 15_000 });

        // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
        expect(await page.evaluate(() => window.__genieMarker)).toBe(1);

        // A value the card cuts off still passes `toBeVisible`, so measure the card itself.
        const overflow = await unallocated
          .locator("xpath=ancestor::*[@data-slot='card'][1]")
          .evaluate((element) => element.scrollWidth - element.clientWidth);

        expect(
          overflow,
          "the Unallocated payments KPI is clipped"
        ).toBeLessThanOrEqual(0);

        await expectNoAxeViolations(page, "dashboard after the chat change");
        await screenshot(page, testInfo, `chat-${testInfo.project.name}`);

        await page.getByRole("button", { name: "Undo" }).click();

        await expect(
          page.getByText("No panels yet", { exact: true })
        ).toBeVisible(FIRST_PAINT);
      } finally {
        await removeTestPayments("e2e-dashboards-");
      }
    },
    LOCK_WAIT
  );
});
