import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { DOCUMENT_REVIEW_CHAT_ID } from "../../testing/document-review-chat.ts";
import { SLIDES_CHANGE_DECK_ID } from "../../testing/slides-change.ts";
import {
  expectNoIconFindings,
  iconCheckSize,
  type IconCheckRoute,
  walkIconAlignment,
} from "../support/icon-alignment.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  closeAgentPanelDatabase,
  removeReviewDocument,
  resetReviewDocument,
} from "./agent-panel-support.ts";
import { hideDevelopmentWidgets } from "./ask-support.ts";
import { seedChat } from "./chat-seed.ts";
import {
  expectPageDrawn,
  FIRST_PAINT,
  LEDGER_LOCK,
  LOCK_WAIT,
  signIn,
} from "./dev-support.ts";
import {
  DEMO_ACCOUNT_EMAIL,
  DEV_MODULES,
  SLIDES_PEOPLE,
} from "./global-setup.ts";
import { closeSlidesDatabase, resetChangeDeck } from "./slides-support.ts";

test.skip(
  !["analytics", "invoices", "slides"].every((id) => DEV_MODULES.has(id)),
  "The walk opens the analytics, invoices and slides pages."
);

/**
 * The icon check of `6wz1.113` over the module routes and Ask, in `next dev` on the disposable demo
 * database, as the demo account. Every finding is collected before one assertion, so one red run
 * lists every route. The review desk is the fixed review document's, not the fresh upload that
 * `review.spec.ts` opens: the same screen, stable between runs (P07-49). The fixed deck and review
 * document are shared with other specs, so they are
 * opened under the ledger lock and put back after.
 */

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(async () => {
  await closeSlidesDatabase();
  await closeAgentPanelDatabase();
});

const walk = (page: Page, routes: readonly IconCheckRoute[]) =>
  walkIconAlignment(page, routes, { paint: FIRST_PAINT });

// T5-a: a screen composes shared parts into a misaligned layout that no story shows.
test("every module route and Ask lines its icons up with their text", async ({
  page,
}, testInfo) => {
  test.setTimeout(LOCK_WAIT + 600_000);

  await page.setViewportSize(iconCheckSize(testInfo.project.name));

  // A finished answer. `seedChat` stores text turns only, so no steps: the stories hold that state.
  const chatId = randomUUID();

  await seedChat({
    email: DEMO_ACCOUNT_EMAIL,
    sessionId: chatId,
    turns: [
      {
        question: "How many invoices are overdue?",
        answer: "Three invoices are overdue, together SGD 12,450.00.",
      },
    ],
  });
  await signIn(page);

  const findings = await walk(page, [
    { path: "/ask" },
    {
      path: `/ask/${chatId}`,
      // The id is new each run, so the red list keys the line by a fixed label.
      label: "/ask/<stored chat>",
      ready: (shown) =>
        expect(
          shown.getByText("Three invoices are overdue", { exact: false })
        ).toBeVisible(FIRST_PAINT),
    },
    { path: "/m/slides/decks" },
    { path: "/m/invoices/invoices" },
    { path: "/m/invoices/documents" },
    { path: "/m/analytics/dashboards" },
  ]);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      // Decks are their owner's only, so the fixed deck is the demo account's for this walk.
      await resetChangeDeck(DEMO_ACCOUNT_EMAIL);
      await resetReviewDocument();

      try {
        findings.push(
          ...(await walk(page, [
            {
              path: `/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`,
              ready: (shown) =>
                expect(
                  shown.locator("main [data-shown-slide] [data-slide-canvas]")
                ).toBeVisible(FIRST_PAINT),
            },
            {
              path: `/m/invoices/documents/${DOCUMENT_REVIEW_CHAT_ID}`,
              ready: async (shown) => {
                await expect(
                  shown.getByRole("heading", {
                    level: 1,
                    name: "Review the invoice",
                  })
                ).toBeVisible(FIRST_PAINT);
                await expectPageDrawn(shown);
              },
            },
          ]))
        );
      } finally {
        // The state the slides specs reset to, and no fixed document in other specs' inbox counts.
        await resetChangeDeck(SLIDES_PEOPLE.chat);
        await removeReviewDocument();
      }
    },
    LOCK_WAIT
  );

  expectNoIconFindings(findings);
});
