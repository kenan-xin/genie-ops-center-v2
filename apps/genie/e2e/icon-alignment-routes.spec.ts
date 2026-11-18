import { test } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import { inviteBaseUrl } from "./support/brokered.ts";
import {
  expectNoIconFindings,
  iconCheckSize,
  walkIconAlignment,
} from "./support/icon-alignment.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * The icon check of `6wz1.113` over the app's own routes, where screens compose the shared parts
 * in ways no story shows. Each route is measured at the project's width, and every finding is
 * collected before one assertion, so one red run lists every route.
 *
 * The signed-in walk runs on the invite deployment as the Section 3 acceptance administrator,
 * whom no proof signs out, then opens the placeholder page as the AC-26 person, who holds its key.
 * `tenant-settings.spec.ts` turns the placeholder module off and `modules-categories.spec.ts`
 * edits categories under the entitlement lock, so the walk holds it.
 */
const BASE = inviteBaseUrl();

const ENTITLEMENT_LOCK = "s2-16-entitlement";

const LOCK_WAIT_MS = 300_000;

/** Two broker sign-ins and 14 routes, after up to `LOCK_WAIT_MS` of lock wait. */
test.describe.configure({ timeout: 420_000 });

const SIGNED_IN_ROUTES = [
  "/",
  "/account",
  "/admin/people",
  "/admin/groups",
  "/admin/roles",
  "/admin/access/grants",
  "/admin/access/overview",
  "/admin/branding",
  "/admin/settings",
  "/admin/audit",
  "/admin/modules",
  "/admin/categories",
  "/ask",
] as const;

/** The administrator holds no module key, so the placeholder page is walked as the AC-26 person. */
const PLACEHOLDER_ROUTES = ["/placeholder"] as const;

const SIGNED_OUT_ROUTES = ["/sign-in", "/admin/login"] as const;

const routes = (paths: readonly string[]) => paths.map((path) => ({ path }));

// T5-a: a screen composes shared parts into a misaligned layout that no story shows.
test("every signed-in route lines its icons up with their text", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(iconCheckSize(testInfo.project.name));

  const findings = await withDeploymentLock(
    ENTITLEMENT_LOCK,
    async () => {
      await signInThroughBroker(page, {
        baseUrl: BASE,
        email: scenarioEmail("invite", "acceptance", testInfo.project.name),
      });

      const admin = await walkIconAlignment(page, routes(SIGNED_IN_ROUTES), {
        base: BASE,
      });

      await page.context().clearCookies();
      await signInThroughBroker(page, {
        baseUrl: BASE,
        email: scenarioEmail("invite", "mixed", testInfo.project.name),
      });

      return [
        ...admin,
        ...(await walkIconAlignment(page, routes(PLACEHOLDER_ROUTES), {
          base: BASE,
        })),
      ];
    },
    LOCK_WAIT_MS
  );

  expectNoIconFindings(findings);
});

// T5-a, the pages a person sees before a session, on the shared stack where `auth.spec.ts` and
// `break-glass.spec.ts` open them.
test("the sign-in pages line their icons up with their text", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.setViewportSize(iconCheckSize(testInfo.project.name));

  expectNoIconFindings(
    await walkIconAlignment(page, routes(SIGNED_OUT_ROUTES), { base: baseURL })
  );
});
