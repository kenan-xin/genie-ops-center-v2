import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ANALYTICS_ADD_ANSWER,
  ANALYTICS_CHAT_DASHBOARD,
  ANALYTICS_HANDOFF_MESSAGE,
  ANALYTICS_HANDOFF_TITLE,
  ANALYTICS_QUESTION,
  ANALYTICS_QUESTION_MESSAGE,
  ANALYTICS_SHOW_ANSWER,
  HANDOFF_PANEL_TITLES,
  OUT_OF_TOOLS_ASK_ANSWER,
  OUT_OF_TOOLS_ASK_MESSAGE,
  OUT_OF_TOOLS_DASHBOARD_ANSWER,
  OUT_OF_TOOLS_DASHBOARD_MESSAGE,
  QUESTION_DASHBOARD_NAME,
} from "../../testing/analytics-chat.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  openAgentPanel,
  openUntilVisible,
  signInAs,
} from "./ask-support.ts";
import {
  closeDashboardDatabase,
  resetChatDashboard,
} from "./dashboard-support.ts";
import { LEDGER_LOCK, LOCK_WAIT, onPhone } from "./dev-support.ts";
import {
  ANALYTICS_PEOPLE,
  DEV_MODULES,
  SLIDES_PEOPLE,
} from "./global-setup.ts";
import { closeSlidesDatabase, removeOwnDecks } from "./slides-support.ts";
import {
  closeSurfaceDatabase,
  handedOverFrom,
  handOverDeck,
  insertEmptyDashboard,
  openSurfaceAgent,
  removeDashboardsNamed,
  send,
  warm,
} from "./surface-support.ts";

test.skip(
  !(
    DEV_MODULES.has("analytics") &&
    DEV_MODULES.has("invoices") &&
    DEV_MODULES.has("placeholder") &&
    DEV_MODULES.has("slides")
  ),
  "The synthetic handoff fixtures hold the default selection's tool list."
);

/**
 * The surface agents and the Ask handoff in `next dev` (Spec 7 R-42, R-42b, R-46, AC-13). Ask's
 * panel beside the Slides or Dashboards list is an Ask chat, and the synthetic fixtures hold that
 * page's line, so the handoff starts there. The worker of `global-setup.ts` runs the handed-over
 * build. The build fixtures answer each step in about 1.5 s, so the page shows it fill.
 */

// The development widgets float over the chat's Send in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(async () => {
  await closeSlidesDatabase();
  await closeDashboardDatabase();
  await closeSurfaceDatabase();
});

/** A tap on the phone project, where a fixed bar may cover a control. */
async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/**
 * Waits until `count` reaches `total` and answers each count it saw on the way, so a test can
 * tell a page that fills step by step from one that shows the record only at the end.
 */
async function countsUntil(
  count: () => Promise<number>,
  total: number
): Promise<readonly number[]> {
  const seen: number[] = [];
  const end = Date.now() + FIRST_PAINT.timeout;

  /* eslint-disable no-await-in-loop -- the page is read again until it holds the whole record. */
  while (Date.now() < end) {
    const now = await count();

    if (seen.at(-1) !== now) seen.push(now);

    if (now >= total) return seen;

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(`The page showed ${JSON.stringify(seen)}, never ${total}.`);
}

/** The surface panel's header chip. */
const chip = (surface: Locator, text: "Building" | "Saved") =>
  surface.locator("header").getByText(text, { exact: true });

/** The Ask chat is in Ask history, and the chat it handed over to is not (R-42). */
async function expectAskHistory(
  page: Page,
  askId: string,
  surfaceId: string
): Promise<void> {
  await page.goto(`/ask/${askId}`);

  // Below the large breakpoint the history is a sheet behind Show chats.
  if (onPhone(page)) {
    await activate(
      page,
      page.getByRole("button", { name: "Show chats" }).filter({ visible: true })
    );
  }

  const history = page.getByRole("navigation", { name: "Chats" });

  await expect(history.locator(`a[href="/ask/${askId}"]`)).toHaveCount(1, {
    timeout: FIRST_PAINT.timeout,
  });
  await expect(history.locator(`a[href="/ask/${surfaceId}"]`)).toHaveCount(0);
}

/** The record page's Chats tab lists the handed-over chat under On this page (R-42). */
async function expectSurfaceChats(
  page: Page,
  surface: Locator,
  title: string
): Promise<void> {
  await activate(page, surface.getByRole("tab", { name: "Chats" }));

  await expect(
    surface
      .getByRole("region", { name: "On this page" })
      .getByRole("button", { name: title, exact: true })
  ).toBeVisible();
}

const slideButtons = (page: Page) =>
  page
    .getByRole("navigation", { name: "Slides" })
    .getByRole("button", { name: /^Slide \d+:/ });

test("Ask hands a deck over, and the deck page fills slide by slide", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        const askId = await handOverDeck(page);

        const surface = page.getByRole("region", { name: "Slides agent" });

        await expect(chip(surface, "Building")).toBeVisible(FIRST_PAINT);

        const seen = await countsUntil(() => slideButtons(page).count(), 5);

        expect(
          seen.some((count) => count > 0 && count < 5),
          `the deck showed ${JSON.stringify(seen)} slides on the way to 5`
        ).toBe(true);
        await expect(chip(surface, "Saved")).toBeVisible(FIRST_PAINT);
        await expectNoAxeViolations(page, "deck page after the handoff");

        const handed = await handedOverFrom(askId);

        if (handed === undefined) throw new Error("Ask handed nothing over.");

        await expectSurfaceChats(page, surface, handed.title);
        await expectAskHistory(page, askId, handed.id);
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
});

test("Stop on a building deck ends the run with the stopped notice", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        await handOverDeck(page);

        const surface = page.getByRole("region", { name: "Slides agent" });

        await activate(
          page,
          surface.getByRole("button", { name: "Stop building" })
        );

        // Wait for the end, so the next handoff of this person finds no live run.
        await expect(
          surface.getByText("You stopped this work.", { exact: true })
        ).toBeVisible(FIRST_PAINT);
        await expect(chip(surface, "Building")).toHaveCount(0);
        expect(await slideButtons(page).count()).toBeLessThan(5);
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
});

test("Ask hands a dashboard over, and the dashboard page fills panel by panel", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  const email = ANALYTICS_PEOPLE.chat;

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeDashboardsNamed(email, [ANALYTICS_HANDOFF_TITLE]);

      try {
        await signInAs(page, email);
        await resetChatDashboard();
        await warm(
          page,
          `/m/analytics/dashboards/${ANALYTICS_CHAT_DASHBOARD.id}`,
          ANALYTICS_CHAT_DASHBOARD.name
        );
        await warm(page, "/m/analytics/dashboards", "Dashboards");

        const askId = await send(
          page,
          await openAgentPanel(page),
          ANALYTICS_HANDOFF_MESSAGE
        );

        await expect(
          page.getByRole("heading", { level: 1, name: ANALYTICS_HANDOFF_TITLE })
        ).toBeVisible(FIRST_PAINT);

        const surface = page.getByRole("region", { name: "Dashboards agent" });

        await expect(chip(surface, "Building")).toBeVisible(FIRST_PAINT);

        const panels = async () => {
          const counts = await Promise.all(
            HANDOFF_PANEL_TITLES.map((name) =>
              page
                .getByRole("main")
                .getByRole("figure", { name, exact: true })
                .count()
            )
          );

          return counts.reduce((sum, count) => sum + count, 0);
        };

        const seen = await countsUntil(panels, 3);

        expect(
          seen.some((count) => count > 0 && count < 3),
          `the dashboard showed ${JSON.stringify(seen)} panels on the way to 3`
        ).toBe(true);
        await expect(chip(surface, "Saved")).toBeVisible(FIRST_PAINT);
        await expectNoAxeViolations(page, "dashboard page after the handoff");

        const handed = await handedOverFrom(askId);

        if (handed === undefined) throw new Error("Ask handed nothing over.");

        await expectSurfaceChats(page, surface, handed.title);
        await expectAskHistory(page, askId, handed.id);
      } finally {
        await removeDashboardsNamed(email, [ANALYTICS_HANDOFF_TITLE]);
      }
    },
    LOCK_WAIT
  );
});

test("on a dashboard, a chart request asks first: Add makes a panel with Undo, and Just show it here makes an artifact", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  const email = ANALYTICS_PEOPLE.chat;

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      try {
        await signInAs(page, email);

        const surface = page.getByRole("region", { name: "Dashboards agent" });

        /**
         * Opens the agent of a new empty dashboard. The question fixtures hold version 1 of the
         * dashboard and a new chat, so each answer gets its own dashboard, as in the app test.
         */
        const openEmptyDashboard = async () => {
          await removeDashboardsNamed(email, [QUESTION_DASHBOARD_NAME]);

          const id = await insertEmptyDashboard(email, QUESTION_DASHBOARD_NAME);

          await warm(
            page,
            `/m/analytics/dashboards/${id}`,
            QUESTION_DASHBOARD_NAME
          );
          // On a record page the Agent button opens the surface's own agent.
          await openUntilVisible(
            page.getByRole("button", { name: "Agent", exact: true }),
            surface
          );
        };

        const empty = page.getByText("No panels yet", { exact: true });

        const panel = page
          .getByRole("main")
          .getByRole("figure", { name: "Monthly collections (SGD)" });

        /** Asks for the chart, and expects the question with nothing added. */
        const ask = async () => {
          await send(page, surface, ANALYTICS_QUESTION_MESSAGE);
          await expect(
            surface.getByText(ANALYTICS_QUESTION, { exact: true })
          ).toBeVisible(FIRST_PAINT);
          await expect(empty).toBeVisible();
        };

        await openEmptyDashboard();
        await ask();
        await send(page, surface, ANALYTICS_ADD_ANSWER);

        await expect(panel).toBeVisible(FIRST_PAINT);
        await expectNoAxeViolations(page, "dashboard after Add");

        await activate(page, page.getByRole("button", { name: "Undo" }));

        await expect(empty).toBeVisible(FIRST_PAINT);

        await openEmptyDashboard();
        await ask();
        await send(page, surface, ANALYTICS_SHOW_ANSWER);

        await expect(
          surface
            .getByRole("list", { name: "Artifacts" })
            .getByText("Monthly collections (SGD)")
        ).toBeVisible(FIRST_PAINT);
        await expect(empty).toBeVisible();
        await expect(panel).toHaveCount(0);
      } finally {
        await removeDashboardsNamed(email, [QUESTION_DASHBOARD_NAME]);
      }
    },
    LOCK_WAIT
  );
});

// The replay of `synthetic-out-of-tools-ask-1` and `-dashboard-1`, through the browser's page context.
test("Ask answers a request outside its tools with one sentence", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signInAs(page, ANALYTICS_PEOPLE.chat);
      await warm(page, "/m/analytics/dashboards", "Dashboards");

      const chat = await openAgentPanel(page);

      await send(page, chat, OUT_OF_TOOLS_ASK_MESSAGE);

      await expect(
        chat.getByText(OUT_OF_TOOLS_ASK_ANSWER, { exact: true })
      ).toBeVisible(FIRST_PAINT);
    },
    LOCK_WAIT
  );
});

test("the Dashboards agent answers a request outside its tools with one sentence and adds nothing", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  const email = ANALYTICS_PEOPLE.chat;

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeDashboardsNamed(email, [QUESTION_DASHBOARD_NAME]);

      try {
        // A new dashboard opens a new chat, so the request holds this message alone.
        const id = await insertEmptyDashboard(email, QUESTION_DASHBOARD_NAME);

        await signInAs(page, email);
        await warm(
          page,
          `/m/analytics/dashboards/${id}`,
          QUESTION_DASHBOARD_NAME
        );

        const surface = await openSurfaceAgent(page, "Dashboards agent");

        await send(page, surface, OUT_OF_TOOLS_DASHBOARD_MESSAGE);

        await expect(
          surface.getByText(OUT_OF_TOOLS_DASHBOARD_ANSWER, { exact: true })
        ).toBeVisible(FIRST_PAINT);
        await expect(
          page.getByText("No panels yet", { exact: true })
        ).toBeVisible();
      } finally {
        await removeDashboardsNamed(email, [QUESTION_DASHBOARD_NAME]);
      }
    },
    LOCK_WAIT
  );
});
