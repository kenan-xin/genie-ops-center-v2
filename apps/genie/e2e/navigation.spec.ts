import { devices, expect, test, type Page } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  brokeredGenieOps,
  brokeredRunning,
  LANDING_DB,
  landingBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Spec 3 S3-04a: the landing route and the navigation tree in the browser (AC-11a, AC-4), on the
 * landing deployment, which runs the fixture image so one module carries the landing flag. Each
 * proof runs at the phone and the desktop viewport through the two Playwright projects (DEC-25).
 *
 * The module entitlement and the category rows are deployment-wide, so every proof that changes
 * or reads them holds one lock and restores them before releasing it. Readers cache for ten
 * seconds (DEC-46), so every read after a change polls.
 */
const BASE = landingBaseUrl();

const LANDING = "/m/landing-fixture";

const ENTRY = "Landing fixture";

const LOCK = "s3-04a-landing";

const POLL = { timeout: 30_000, intervals: [1000] };

// A test can wait up to 300 s for the other viewport's lock, then run its own steps.
test.describe.configure({ timeout: 420_000 });

test.beforeAll(async () => {
  expect(
    await brokeredRunning("landing"),
    "the landing deployment is not running: run the nx target @genie/app:test:e2e, which builds the fixture image"
  ).toBe(true);
});

/** Where the signed-in person lands now: the path `/auth/complete` redirects to. */
async function landedPath(page: Page): Promise<string> {
  await page.goto(`${BASE}/auth/complete`);

  return new URL(page.url()).pathname;
}

/**
 * The shell navigation's blocks: entry links in the `Operations` category group and the
 * `Workspace` nav, and each block's count. `/` redirects to the landing route while it resolves.
 */
async function homeBlocks(page: Page): Promise<readonly number[]> {
  await page.goto(`${BASE}/`);

  const navigation = await openNavigation(page);

  const operations = navigation.getByRole("group", {
    name: "Operations",
    exact: true,
  });

  const workspace = navigation.getByRole("navigation", {
    name: "Workspace",
    exact: true,
  });

  const entry = { name: ENTRY, exact: true };

  return [
    await operations.getByRole("link", entry).count(),
    await workspace.getByRole("link", entry).count(),
    await operations.count(),
    await workspace.count(),
  ];
}

async function expectEmptyState(page: Page): Promise<void> {
  await expect(page.getByText("No solutions yet")).toBeVisible();
  await expect(
    page.getByText("Ask your administrator to grant you access to a solution.")
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: ENTRY, exact: true })
  ).toHaveCount(0);
}

test("a person with the landing grant lands on the landing route after sign-in (R-30)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    LOCK,
    async () => {
      await signInThroughBroker(page, {
        baseUrl: BASE,
        email: scenarioEmail("landing", "member", testInfo.project.name),
        landing: LANDING,
      });

      await expect(
        page.getByRole("heading", { level: 1, name: ENTRY })
      ).toBeVisible();
    },
    300_000
  );
});

test("a person with no grants sees the empty state and no entry (R-34)", async ({
  page,
}, testInfo) => {
  await signInThroughBroker(page, {
    baseUrl: BASE,
    email: scenarioEmail("landing", "nogrant", testInfo.project.name),
  });

  await expectEmptyState(page);
  await expect(
    page.getByRole("link", {
      name: "Contact Brokered Group support",
      exact: true,
    })
  ).toHaveAttribute("href", "mailto:support@example.invalid");

  await expectNoAxeViolations(page, "no-grants empty state");
});

test("a disabled landing module opens the empty state (R-30)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    LOCK,
    async () => {
      await signInThroughBroker(page, {
        baseUrl: BASE,
        email: scenarioEmail("landing", "member", testInfo.project.name),
        landing: LANDING,
      });

      try {
        await brokeredGenieOps("landing", [
          "module",
          "disable",
          "landing-fixture",
        ]);

        await expect.poll(() => landedPath(page), POLL).toBe("/");
        await expectEmptyState(page);
        await expectNoAxeViolations(
          page,
          "empty state of a disabled landing module"
        );
      } finally {
        await brokeredGenieOps("landing", [
          "module",
          "enable",
          "landing-fixture",
        ]);
        await expect.poll(() => landedPath(page), POLL).toBe(LANDING);
      }
    },
    300_000
  );
});

test("a category moves the static entry and the landing flag survives; a deleted category leaves it ungrouped (R-29, R-29a, R-91)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    LOCK,
    async () => {
      await signInThroughBroker(page, {
        baseUrl: BASE,
        email: scenarioEmail("landing", "member", testInfo.project.name),
        landing: LANDING,
      });

      try {
        // The Categories page arrives in S3-05, so SQL is this ticket's seed route for a category.
        await queryBrokerDatabase(
          LANDING_DB,
          "insert into category (name, position) values ('Operations', 1) on conflict (name) do nothing; update tenant_module set category_id = (select id from category where name = 'Operations') where module_id = 'landing-fixture'"
        );

        // [entry under Operations, entry under Workspace, Operations blocks, Workspace blocks]
        await expect.poll(() => homeBlocks(page), POLL).toEqual([1, 0, 1, 0]);
        await expect.poll(() => landedPath(page), POLL).toBe(LANDING);

        // The key is `on delete set null`, so the module falls back to Workspace (R-91).
        await queryBrokerDatabase(
          LANDING_DB,
          "delete from category where name = 'Operations'"
        );

        await expect.poll(() => homeBlocks(page), POLL).toEqual([0, 1, 0, 1]);
      } finally {
        await queryBrokerDatabase(
          LANDING_DB,
          "delete from category where name = 'Operations'; update tenant_module set category_id = null where module_id = 'landing-fixture'"
        );
        await expect.poll(() => homeBlocks(page), POLL).toEqual([0, 1, 0, 1]);
      }
    },
    300_000
  );
});

test("collapsing a category persists on the device and not on another (R-31)", async ({
  page,
  browser,
}, testInfo) => {
  const email = scenarioEmail("landing", "member", testInfo.project.name);

  await withDeploymentLock(
    LOCK,
    async () => {
      // The other device keeps this project's viewport, so the phone run walks the drawer.
      const other = await browser.newContext(
        devices[
          testInfo.project.name === "phone" ? "Pixel 7" : "Desktop Chrome"
        ]
      );

      try {
        await queryBrokerDatabase(
          LANDING_DB,
          "insert into category (name, position) values ('Operations', 1) on conflict (name) do nothing; update tenant_module set category_id = (select id from category where name = 'Operations') where module_id = 'landing-fixture'"
        );

        await signInThroughBroker(page, {
          baseUrl: BASE,
          email,
          landing: LANDING,
        });
        await expect.poll(() => homeBlocks(page), POLL).toEqual([1, 0, 1, 0]);

        const navigation = await openNavigation(page);

        const toggle = navigation.getByRole("button", {
          name: "Operations",
          exact: true,
        });

        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");

        // Collapsed on this device: it stays collapsed after a reload.
        await page.reload();

        const reloaded = await openNavigation(page);

        await expect(
          reloaded.getByRole("button", { name: "Operations", exact: true })
        ).toHaveAttribute("aria-expanded", "false");
        await expect(
          reloaded.getByRole("group", { name: "Operations", exact: true })
        ).toHaveCount(0);

        // Another device (a fresh browser context) shows it expanded.
        const otherPage = await other.newPage();

        await signInThroughBroker(otherPage, {
          baseUrl: BASE,
          email,
          landing: LANDING,
        });

        const otherNavigation = await openNavigation(otherPage);

        await expect(
          otherNavigation.getByRole("button", {
            name: "Operations",
            exact: true,
          })
        ).toHaveAttribute("aria-expanded", "true");
        await expect(
          otherNavigation.getByRole("link", { name: ENTRY, exact: true })
        ).toBeVisible();
      } finally {
        await other.close();
        await queryBrokerDatabase(
          LANDING_DB,
          "delete from category where name = 'Operations'; update tenant_module set category_id = null where module_id = 'landing-fixture'"
        );
        await expect.poll(() => homeBlocks(page), POLL).toEqual([0, 1, 0, 1]);
      }
    },
    300_000
  );
});
