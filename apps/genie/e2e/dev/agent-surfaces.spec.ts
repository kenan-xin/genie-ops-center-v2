import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ANALYTICS_ADD_ANSWER,
  ANALYTICS_CHAT_DASHBOARD,
  ANALYTICS_HANDOFF_MESSAGE,
  ANALYTICS_HANDOFF_TITLE,
  ANALYTICS_QUESTION,
  ANALYTICS_CHART_TITLE,
  ANALYTICS_QUESTION_MESSAGE,
  ANALYTICS_SHOW_ANSWER,
  HANDOFF_PANEL_TITLES,
  OUT_OF_TOOLS_ASK_ANSWER,
  OUT_OF_TOOLS_ASK_MESSAGE,
  OUT_OF_TOOLS_DASHBOARD_ANSWER,
  OUT_OF_TOOLS_DASHBOARD_MESSAGE,
  QUESTION_DASHBOARD_NAME,
} from "../../testing/analytics-chat.ts";
import {
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
} from "../../testing/slides-change.ts";
import {
  MONTHLY_DECK,
  SLIDES_CHAT_MESSAGE,
} from "../../testing/slides-chat.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  askQuestion,
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
import {
  closeSlidesDatabase,
  removeOwnDecks,
  resetChangeDeck,
} from "./slides-support.ts";
import {
  closeSurfaceDatabase,
  handedOverFrom,
  handOverDeck,
  insertEmptyDashboard,
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

/**
 * The Ask chat is in Ask's group of the history, and the chat it handed over to never opens in Ask:
 * it links to its record page (R-42, DEC-57 item 11).
 */
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

  await expect(
    history
      .getByRole("group", { name: "Ask chats" })
      .locator(`a[href="/ask/${askId}"]`)
  ).toHaveCount(1, {
    timeout: FIRST_PAINT.timeout,
  });
  await expect(history.locator(`a[href="/ask/${surfaceId}"]`)).toHaveCount(0);
  // It is listed in its agent's group, as a link to its record page on that chat (R14).
  await expect(
    history.locator(`[role="group"] a[href$="?chat=${surfaceId}"]`)
  ).toHaveCount(1);
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

        const surface = page.getByRole("region", { name: "Ask", exact: true });

        await expect(chip(surface, "Building")).toBeVisible(FIRST_PAINT);

        const seen = await countsUntil(() => slideButtons(page).count(), 5);

        await expect(
          surface.getByText("From Ask", { exact: true })
        ).toBeVisible(FIRST_PAINT);

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

/** Ask's history, behind Show chats below the large breakpoint. */
async function openAskHistory(page: Page): Promise<Locator> {
  if (onPhone(page)) {
    await activate(
      page,
      page.getByRole("button", { name: "Show chats" }).filter({ visible: true })
    );
  }

  return page.getByRole("navigation", { name: "Chats" });
}

/**
 * Ask in the main menu while `count` runs work (R15): from `lg` the entry in the aside, below it
 * the menu button of the top bar.
 */
function menuRuns(page: Page, count: number): Locator {
  if (!onPhone(page)) {
    return page
      .getByRole("complementary", { name: "Navigation" })
      .getByRole("link", {
        name: count === 0 ? "Ask" : `Ask, ${count} working`,
        exact: true,
      });
  }

  return page.getByRole("button", {
    name:
      count === 0
        ? "Open navigation"
        : count === 1
          ? "Open navigation, 1 chat working"
          : `Open navigation, ${count} chats working`,
    exact: true,
  });
}

test("Ask history groups chats by agent and opens a surface chat on its record page", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        const askId = await handOverDeck(page);
        const handed = await handedOverFrom(askId);

        if (handed === undefined) throw new Error("Ask handed nothing over.");

        // The handoff started a run, so Ask in the menu shows it on the deck page (DEC-57 item 11).
        await expect(
          chip(
            page.getByRole("region", { name: "Ask", exact: true }),
            "Building"
          )
        ).toBeVisible(FIRST_PAINT);

        if (onPhone(page)) {
          // The record page's own top bar replaces the menu button on a phone (follow-up bead).
          await expect(
            page.locator(
              '[data-shell-top-bar] button[aria-label^="Open navigation"]'
            )
          ).toBeHidden();
        } else {
          await expect(menuRuns(page, 1)).toBeVisible();
        }

        // Leave the deck while it builds, so the person never sees the run end (DEC-57 item 11).
        await page.goto("/ask");

        // Ask's page shows the menu, so the running deck shows there: the rail's spinner from
        // `lg`, the menu button's dot below it.
        await expect(menuRuns(page, 1)).toBeVisible(FIRST_PAINT);

        if (onPhone(page)) {
          await expect(page.locator("[data-shell-working-dot]")).toBeVisible();
          // Outside the repository, so `next dev` does not reload on the write.
          await page.screenshot({
            path: test.info().outputPath("phone-menu-dot.png"),
          });
        }

        const row = (await openAskHistory(page))
          .getByRole("group", { name: "Slides chats" })
          .locator(`a[href$="?chat=${handed.id}"]`);

        const unseen = row.getByRole("img", {
          name: "Finished, not opened yet",
        });

        // Ask reads its history every 5 s while a chat works, so the dot comes without a reload.
        await expect(unseen).toBeVisible({ timeout: 60_000 });

        const seen = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/rpc/agent/markSeen") && response.ok()
        );

        await activate(page, row);

        // The record page opens with the Slides agent on that chat (R14).
        await expect(
          page.getByRole("heading", { level: 1, name: MONTHLY_DECK.title })
        ).toBeVisible(FIRST_PAINT);
        expect(new URL(page.url()).searchParams.get("chat")).toBe(handed.id);

        const surface = page.getByRole("region", { name: "Ask", exact: true });

        await expect(
          surface.getByText("From Ask", { exact: true })
        ).toBeVisible(FIRST_PAINT);
        await seen;

        await page.goBack();
        // The run ended, so the menu shows no spinner or dot.
        await expect(menuRuns(page, 0)).toBeVisible(FIRST_PAINT);

        const back = (await openAskHistory(page))
          .getByRole("group", { name: "Slides chats" })
          .locator(`a[href$="?chat=${handed.id}"]`);

        await expect(back).toBeVisible(FIRST_PAINT);
        await expect(
          back.getByRole("img", { name: "Finished, not opened yet" })
        ).toHaveCount(0);
        await expectNoAxeViolations(page, "Ask history after the run");
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
});

test("the Ask screen hands a deck over: the deck opens with its panel, and Ask shows the card", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        await signInAs(page, SLIDES_PEOPLE.chat);
        await resetChangeDeck(SLIDES_PEOPLE.chat);
        await warm(
          page,
          `/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`,
          SLIDES_CHANGE_DECK_TITLE
        );

        // The shell posts on mount, so this response proves hydration: a Send before it can be lost.
        const mounted = page.waitForResponse((response) =>
          response.url().endsWith("/api/session/activity")
        );

        await page.goto("/ask");
        await expect(
          page.getByRole("textbox", { name: "Message", exact: true })
        ).toBeVisible(FIRST_PAINT);
        await mounted;

        const askId = await askQuestion(page, SLIDES_CHAT_MESSAGE);

        await expect(
          page.getByRole("heading", { level: 1, name: MONTHLY_DECK.title })
        ).toBeVisible(FIRST_PAINT);

        // `AskRoute.onHandoff` opens the panel, so the deck arrives with its agent.
        const surface = page.getByRole("region", { name: "Ask", exact: true });

        await expect(surface).toBeVisible();
        await expect(
          surface.getByText("From Ask", { exact: true })
        ).toBeVisible(FIRST_PAINT);
        // Wait for the end, so the next handoff of this person finds no live run.
        await expect(chip(surface, "Saved")).toBeVisible(FIRST_PAINT);

        // Back in the Ask chat, the card shows how the run ended (Review Focus 5).
        await page.goto(`/ask/${askId}`);

        const card = page
          .locator("div")
          .filter({
            has: page.getByRole("link", { name: `Open ${MONTHLY_DECK.title}` }),
          })
          .filter({ has: page.locator("details") })
          .last();

        await expect(card.getByText("Done", { exact: true })).toBeVisible(
          FIRST_PAINT
        );
        await expect(
          card.getByText("What Ask passed on", { exact: true })
        ).toBeVisible();
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

        const surface = page.getByRole("region", { name: "Ask", exact: true });

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

        const surface = page.getByRole("region", { name: "Ask", exact: true });

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

        await expect(
          surface.getByText("From Ask", { exact: true })
        ).toBeVisible(FIRST_PAINT);

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

test("on a dashboard, a chart request asks first: Add makes a panel with Undo, and Just show it here makes an artifact that opens over the page", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  const email = ANALYTICS_PEOPLE.chat;

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      try {
        await signInAs(page, email);

        const surface = page.getByRole("region", { name: "Ask", exact: true });

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
          // On a record page the Ask button opens Ask for that surface.
          await openUntilVisible(
            page.getByRole("button", { name: "Ask", exact: true }),
            surface
          );
        };

        const empty = page.getByText("No panels yet", { exact: true });

        const panel = page
          .getByRole("main")
          .getByRole("figure", { name: ANALYTICS_CHART_TITLE });

        /** Taps a choice of the question, which sends it as the person's message (R-46). */
        const choose = (choice: string) =>
          activate(
            page,
            surface
              .getByRole("group", { name: ANALYTICS_QUESTION })
              .getByRole("button", { name: choice, exact: true })
          );

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
        await expectNoAxeViolations(page, "question with its choices");

        // czjw.160: the keyboard reaches the choices from the question and Enter sends one.
        await activate(
          page,
          surface.getByText(ANALYTICS_QUESTION, { exact: true })
        );
        await page.keyboard.press("Tab");
        await expect(
          surface
            .getByRole("group", { name: ANALYTICS_QUESTION })
            .getByRole("button", { name: ANALYTICS_ADD_ANSWER, exact: true })
        ).toBeFocused();
        await page.keyboard.press("Enter");

        await expect(panel).toBeVisible(FIRST_PAINT);
        await expectNoAxeViolations(page, "dashboard after Add");

        await activate(page, page.getByRole("button", { name: "Undo" }));

        await expect(empty).toBeVisible(FIRST_PAINT);

        await openEmptyDashboard();

        const dashboardAddress = page.url();

        await ask();
        await choose(ANALYTICS_SHOW_ANSWER);

        await expect(
          surface
            .getByRole("list", { name: "Charts and tables" })
            .getByText(ANALYTICS_CHART_TITLE)
        ).toBeVisible(FIRST_PAINT);
        await expect(empty).toBeVisible();
        await expect(panel).toHaveCount(0);

        // czjw.162: the card opens the chart in a sheet over the dashboard. The first read and its
        // one retry fail, so the panel shows the failed read with Try again first.
        let failedReads = 0;

        await page.route(
          (url) =>
            url.pathname.startsWith("/api/rpc/") &&
            url.pathname.endsWith("/artifacts"),
          async (route) => {
            if (failedReads >= 2) return route.fallback();

            failedReads += 1;

            return route.fulfill({ status: 500, body: "{}" });
          }
        );

        const card = surface.getByRole("button", {
          name: ANALYTICS_CHART_TITLE,
        });

        await activate(page, card);

        const failed = surface
          .getByRole("alert")
          .filter({ hasText: "The chart or table could not load." });

        await expect(failed).toBeVisible(FIRST_PAINT);
        await expectNoAxeViolations(page, "failed artifact read");
        await activate(page, failed.getByRole("button", { name: "Try again" }));

        const sheet = page.getByRole("dialog", { name: "Chart or table" });

        await expect(
          sheet.getByRole("heading", { name: ANALYTICS_CHART_TITLE })
        ).toBeVisible(FIRST_PAINT);
        expect(page.url()).toBe(dashboardAddress);
        await expectNoAxeViolations(page, "artifact sheet over the dashboard");

        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
        await expect(surface).toBeVisible();
        await expect(card).toBeFocused();
      } finally {
        await removeDashboardsNamed(email, [QUESTION_DASHBOARD_NAME]);
      }
    },
    LOCK_WAIT
  );
});

// The replay of `out-of-tools-ask-1` and `out-of-tools-dashboard-1`, through the browser's page context.
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

        const surface = await openAgentPanel(page);

        const answer = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/agent") &&
            response.request().method() === "POST"
        );

        await send(page, surface, OUT_OF_TOOLS_DASHBOARD_MESSAGE);

        await expect(
          surface.getByText(OUT_OF_TOOLS_DASHBOARD_ANSWER, { exact: true })
        ).toBeVisible(FIRST_PAINT);

        // A panel step can still land after the answer text, so wait for the stream to end and
        // read the dashboard again from the server before the check (Review Focus 5).
        await (await answer).finished();
        await warm(
          page,
          `/m/analytics/dashboards/${id}`,
          QUESTION_DASHBOARD_NAME
        );

        await expect(
          page.getByText("No panels yet", { exact: true })
        ).toBeVisible();
        await expect(page.getByRole("main").getByRole("figure")).toHaveCount(0);
      } finally {
        await removeDashboardsNamed(email, [QUESTION_DASHBOARD_NAME]);
      }
    },
    LOCK_WAIT
  );
});
