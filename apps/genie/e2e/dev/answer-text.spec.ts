import { expect, test, type Locator } from "@playwright/test";

import {
  BOLD_ANSWER_LEAD,
  BOLD_ANSWER_LINE,
  BOLD_ANSWER_MESSAGE,
  BOLD_ANSWER_STRONG,
} from "../../testing/answer-text.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  openAgentPanel,
  signInAs,
} from "./ask-support.ts";
import { LEDGER_LOCK, LOCK_WAIT } from "./dev-support.ts";
import { ANALYTICS_PEOPLE, DEV_MODULES } from "./global-setup.ts";
import { closeSurfaceDatabase, send, warm } from "./surface-support.ts";

test.skip(
  !(
    DEV_MODULES.has("analytics") &&
    DEV_MODULES.has("invoices") &&
    DEV_MODULES.has("placeholder") &&
    DEV_MODULES.has("slides")
  ),
  "The Ask recordings hold the default selection's tool list."
);

/**
 * An answer's text on the real page (czjw.184): one body size and the foreground color for every
 * paragraph, as the person's message reads, with its key figure or name in bold. The replay of
 * `ask-bold-1` to `-4`, from Ask's panel beside the Dashboards list.
 */

// The development widgets float over the chat's Send in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(closeSurfaceDatabase);

const textStyle = (element: Locator) =>
  element.evaluate((node) => {
    const { fontSize, color } = getComputedStyle(node);

    return { fontSize, color };
  });

test("an answer reads in one body size, with its key figure bold", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signInAs(page, ANALYTICS_PEOPLE.chat);
      await warm(page, "/m/analytics/dashboards", "Dashboards");

      const chat = await openAgentPanel(page);

      await send(page, chat, BOLD_ANSWER_MESSAGE);

      const log = chat.getByRole("log", { name: "Conversation" });

      const lead = log.locator("p", { hasText: BOLD_ANSWER_LEAD });

      const line = log.locator("p", { hasText: BOLD_ANSWER_LINE });

      await expect(line).toBeVisible(FIRST_PAINT);
      await expect(lead.locator("strong")).toHaveText(BOLD_ANSWER_STRONG);

      const foreground = await page.evaluate(
        () => getComputedStyle(document.body).color
      );

      const leadStyle = await textStyle(lead);

      expect(leadStyle.color).toBe(foreground);
      expect(await textStyle(line)).toEqual(leadStyle);
      expect(
        (await textStyle(log.getByText(BOLD_ANSWER_MESSAGE, { exact: true })))
          .fontSize
      ).toBe(leadStyle.fontSize);
      await expectNoAxeViolations(page, "an answer with a bold key name");
    },
    LOCK_WAIT
  );
});
