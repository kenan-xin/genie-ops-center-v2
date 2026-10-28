import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  brokeredGenieOps,
  INVITE_DB,
  inviteBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { rpcPost } from "./support/rpc.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Spec 3 S3-05: the Modules and Categories pages (AC-11, and the whole-module part of AC-19), at the
 * phone and the desktop viewport (DEC-25).
 *
 * The proofs run on the invite deployment, not the shared stack, because many shared-stack specs
 * read the placeholder entry without a lock. The placeholder row there is guarded by the lock the
 * AC-26 proof of `done-when.spec.ts` already holds, so every proof here takes it too and restores
 * the row before releasing it. The navigation caches for 10 s (DEC-46), so its reads poll.
 */
const BASE = inviteBaseUrl();

const LOCK = "s2-16-entitlement";

const LOCK_WAIT_MS = 300_000;

const POLL = { timeout: 30_000, intervals: [1000] };

const SAVED = "Saved. Written to the audit log.";

test.describe.configure({ timeout: 420_000 });

async function sql(query: string): Promise<string> {
  const [first] = await queryBrokerDatabase(INVITE_DB, query);

  return first ?? "";
}

const auditCount = (action: string) =>
  sql(`select count(*) from audit_event where action = '${action}'`).then(
    Number
  );

const placeholderEnabled = () =>
  sql("select enabled from tenant_module where module_id = 'placeholder'");

async function restorePlaceholder(): Promise<void> {
  if ((await placeholderEnabled()) !== "t") {
    await brokeredGenieOps("invite", ["module", "enable", "placeholder"]);
  }
}

/** The Placeholder links in a member's navigation; the entry is pinned too, so it can be two. */
async function placeholderLinks(page: Page): Promise<number> {
  await page.goto(`${BASE}/`);

  return (await openNavigation(page))
    .getByRole("link", { name: "Placeholder", exact: true })
    .count();
}

/**
 * Exactly one new row per change (R-90a): polls until the count leaves `before`, then reads it once
 * more. A poll for `before + 1` alone passes on the way to a second row, and times out on a double
 * write rather than naming it.
 */
async function expectOneMore(action: string, before: number): Promise<void> {
  await expect.poll(() => auditCount(action), POLL).not.toBe(before);
  expect(await auditCount(action), action).toBe(before + 1);
}

test("lists every compiled module and switches one off through the confirm dialog; Access stays read-only and keeps its holders muted (R-82 to R-86)", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;

  await withDeploymentLock(
    LOCK,
    async () => {
      // The member who holds `placeholder:use`, whose navigation and route the switch changes.
      const memberContext = await browser.newContext();
      const member = await memberContext.newPage();

      try {
        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "modules", project),
        });
        await signInThroughBroker(member, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "mixed", project),
        });
        await expect
          .poll(() => placeholderLinks(member), POLL)
          .toBeGreaterThan(0);

        await page.goto(`${BASE}/admin/modules`);
        await expect(
          page.getByRole("heading", { level: 1, name: "Modules" })
        ).toBeVisible();

        // Setup seeds one `tenant_module` row per compiled module, so the counts match.
        const compiled = Number(
          await sql("select count(*) from tenant_module")
        );

        const toggle = page
          .getByRole("switch", { name: "Placeholder on" })
          .filter({ visible: true });

        await expect(
          page.getByRole("switch").filter({ visible: true })
        ).toHaveCount(compiled);
        await expect(toggle).toBeChecked();

        // Access lists the holders that `can()` grants, links to Roles and grants nothing here. No
        // break-glass account (R-39), no erased or banned person, no archived group (R-32).
        const holders = Number(
          await sql(
            `select count(*) from role_assignment a
               join role r on r.id = a.role_id
               left join "user" u on a.principal_type = 'user' and u.id = a.principal_id
               left join "group" g on a.principal_type = 'group' and g.id::text = a.principal_id
              where 'placeholder:use' = any(r.permissions)
                and ((u.id is not null and u.is_break_glass = false and u.erased_at is null
                      and not (u.banned is true and (u.ban_expires is null or u.ban_expires > now())))
                  or (g.id is not null and g.archived_at is null))`
          )
        );

        // A desktop cell names three holders; "+N" opens the full list, one line per role (DR-26).
        // A phone card has one "Who can open it" row instead, the whole row a link to Roles.
        const expectHolderList = async () => {
          if (project === "phone") {
            const who = page.getByRole("link", {
              name: /^Who can open it for Placeholder/,
            });

            await expect(who).toHaveAttribute("href", "/admin/roles");
            await expect(who).not.toContainText("No one yet");

            return;
          }

          await expect(
            page.getByRole("link", { name: "Manage in Roles for Placeholder" })
          ).toHaveAttribute("href", "/admin/roles");
          await page
            .getByRole("button", { name: /more holders of Placeholder$/ })
            .filter({ visible: true })
            .click();

          const holderList = page.getByRole("dialog", {
            name: "Holders of Placeholder",
          });

          await expect(holderList.getByRole("listitem")).toHaveCount(holders);
          await expect(holderList).toContainText(`S2-16 Mixed ${project}`);
          await page.keyboard.press("Escape");
          await expect(holderList).toBeHidden();
        };

        await expectHolderList();
        await expect(
          page.getByRole("button", { name: /assign|grant/i })
        ).toHaveCount(0);
        await expectNoAxeViolations(page, "Modules page");

        // Off asks first, with Cancel focused (R-83).
        const disabledBefore = await auditCount("core:module_disabled");

        await toggle.click();

        const confirm = page.getByRole("dialog", {
          name: "Switch off Placeholder?",
        });

        await expect(confirm).toContainText(
          "Members lose Placeholder from their navigation until it is switched on again. Its data stays."
        );
        await expect(
          confirm.getByRole("button", { name: "Cancel" })
        ).toBeFocused();
        await expectNoAxeViolations(page, "switch-off confirm");
        await confirm.getByRole("button", { name: "Switch off" }).click();

        await expect(page.getByText(SAVED)).toBeVisible();
        await expect(toggle).not.toBeChecked();
        await expectOneMore("core:module_disabled", disabledBefore);
        expect(await placeholderEnabled()).toBe("f");

        // Off keeps its holders, muted, beside an Off pill (R-86).
        await expectHolderList();
        await expect(
          page
            .getByRole("row")
            .or(page.getByRole("listitem"))
            .filter({ has: toggle })
            .getByText("Off", { exact: true })
        ).toBeVisible();

        // Home opens at once, inside the reader window, and lands in the shell whichever answer the
        // module route gives: the module page while the cached reader still says on, the no-access
        // state once it says off, never the raw refusal body (6wz1.85).
        await member.goto(`${BASE}/`);
        await openNavigation(member);

        // The member loses the entry and the route refuses, once the cached reader expires.
        await expect.poll(() => placeholderLinks(member), POLL).toBe(0);
        await expect
          .poll(
            async () => (await member.goto(`${BASE}/placeholder`))?.status(),
            POLL
          )
          .toBe(403);

        // The refused module page is the no-access state inside the shell, not JSON (6wz1.85).
        await expect(
          member.getByRole("heading", {
            level: 1,
            name: "You do not have access to this page",
          })
        ).toBeVisible();
        await openNavigation(member);

        // On saves at once, without a dialog.
        const enabledBefore = await auditCount("core:module_enabled");

        await toggle.click();
        await expect(toggle).toBeChecked();
        await expectOneMore("core:module_enabled", enabledBefore);
        expect(await placeholderEnabled()).toBe("t");
        await expect
          .poll(() => placeholderLinks(member), POLL)
          .toBeGreaterThan(0);
      } finally {
        await memberContext.close();
        await restorePlaceholder();
      }
    },
    LOCK_WAIT_MS
  );
});

test("a person without core:settings:manage sees no Modules or Categories entry, and both routes and their procedures refuse (AC-19a, R-93)", async ({
  page,
}, testInfo) => {
  await signInThroughBroker(page, {
    baseUrl: BASE,
    email: scenarioEmail("invite", "nosettings", testInfo.project.name),
  });
  await page.goto(`${BASE}/admin/audit`);

  const navigation = await openNavigation(page);

  for (const [name, procedure] of [
    ["Modules", "/api/rpc/modules/list"],
    ["Categories", "/api/rpc/categories/list"],
  ] as const) {
    // oxlint-disable no-await-in-loop -- one screen at a time in one page.
    await expect(
      navigation.getByRole("link", { name, exact: true })
    ).toHaveCount(0);

    const read = await rpcPost(page.request, `${BASE}${procedure}`);

    expect(read.status(), procedure).toBe(403);
    expect(await read.text()).toContain('"appCode":"forbidden"');
    // oxlint-enable no-await-in-loop
  }

  for (const path of ["/admin/modules", "/admin/categories"]) {
    // oxlint-disable-next-line no-await-in-loop -- one route at a time.
    await page.goto(`${BASE}${path}`);
    // oxlint-disable-next-line no-await-in-loop -- as above.
    await expect(page.getByTestId("permission-denied"), path).toBeVisible();
  }
});

test("genie-ops module disable writes the same row with one ops row and no core row (R-90a) @no-screen", async () => {
  await withDeploymentLock(
    LOCK,
    async () => {
      const opsBefore = await auditCount("ops:module-disable");
      const coreBefore = await auditCount("core:module_disabled");

      try {
        await brokeredGenieOps("invite", ["module", "disable", "placeholder"]);

        expect(await placeholderEnabled()).toBe("f");
        expect(await auditCount("ops:module-disable")).toBe(opsBefore + 1);
        expect(await auditCount("core:module_disabled")).toBe(coreBefore);
      } finally {
        await restorePlaceholder();
      }
    },
    LOCK_WAIT_MS
  );
});

test("a category is created, renamed, reordered, assigned to a module and deleted (R-87 to R-91a, AC-19)", async ({
  page,
}, testInfo) => {
  // Run-unique names: the invite database keeps rows between runs.
  const run = `${testInfo.project.name} ${randomUUID().slice(0, 8)}`;
  const first = `S3-05 first ${run}`;
  const renamed = `S3-05 renamed ${run}`;
  const second = `S3-05 second ${run}`;

  await withDeploymentLock(
    LOCK,
    async () => {
      const originalCategory = await sql(
        "select coalesce(category_id::text, 'null') from tenant_module where module_id = 'placeholder'"
      );

      const moduleRows = await sql("select count(*) from tenant_module");

      try {
        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "modules", testInfo.project.name),
        });
        await page.goto(`${BASE}/admin/categories`);

        await expect(
          page.getByRole("heading", { level: 1, name: "Categories" })
        ).toBeVisible();
        await expect(
          page.getByText("Headings that group modules in the navigation.")
        ).toBeVisible();
        await expect(
          page.getByText(
            "A category groups what people already see. It never grants access. Who can open a module is set in Roles."
          )
        ).toHaveCount(1);
        await expectNoAxeViolations(page, "Categories page");

        // Create two, so there is an order to change.
        const createdBefore = await auditCount("core:category_created");

        for (const [index, name] of [first, second].entries()) {
          // oxlint-disable-next-line no-await-in-loop -- each category is created after the previous one.
          await page.getByLabel("New category name").fill(name);
          // oxlint-disable-next-line no-await-in-loop -- as above.
          await page.getByRole("button", { name: "Add", exact: true }).click();
          // oxlint-disable-next-line no-await-in-loop -- as above.
          await expect(
            page.getByRole("listitem", { name, exact: true })
          ).toBeVisible();
          // oxlint-disable-next-line no-await-in-loop -- as above.
          await expectOneMore("core:category_created", createdBefore + index);
        }

        await expect(page.getByText(SAVED).first()).toBeVisible();

        // Rename through the row's own field.
        const renamedBefore = await auditCount("core:category_renamed");

        await page
          .getByRole("button", { name: `Rename ${first}`, exact: true })
          .click();
        await page.getByLabel("Category name", { exact: true }).fill(renamed);
        await page.getByLabel("Category name", { exact: true }).press("Enter");
        await expect(
          page.getByRole("listitem", { name: renamed, exact: true })
        ).toBeVisible();
        await expectOneMore("core:category_renamed", renamedBefore);
        expect(
          await sql(`select count(*) from category where name = '${renamed}'`)
        ).toBe("1");

        // Move the second above the renamed one.
        const position = (name: string) =>
          sql(`select position from category where name = '${name}'`).then(
            Number
          );

        const reorderedBefore = await auditCount("core:category_reordered");

        expect(await position(second)).toBeGreaterThan(await position(renamed));
        await page
          .getByRole("button", { name: `Move ${second} up`, exact: true })
          .click();
        await expectOneMore("core:category_reordered", reorderedBefore);
        expect(await position(second)).toBeLessThan(await position(renamed));

        // File the placeholder module under the renamed category.
        const placedBefore = await auditCount("core:module_category_set");

        const picker = page
          .getByRole("combobox", { name: "Category for Placeholder" })
          .filter({ visible: true });

        // On a phone the toasts sit over the open list, so they close first (4 s each).
        await expect(
          page
            .getByRole("region", { name: /Notifications/ })
            .getByRole("status")
        ).toHaveCount(0, { timeout: 15_000 });
        await picker.click();
        await page.getByRole("option", { name: renamed, exact: true }).click();
        await expectOneMore("core:module_category_set", placedBefore);

        // The count is what `tenant_module.category_id` says (R-88).
        const filed = await sql(
          `select count(*) from tenant_module m join category c on c.id = m.category_id where c.name = '${renamed}'`
        );

        expect(filed).toBe("1");
        await expect(
          page.getByRole("listitem", { name: renamed, exact: true })
        ).toContainText("1 module");

        // The assignment holds after a reload.
        await page.reload();
        await expect(picker).toContainText(renamed);

        // Deleting it leaves the module under Other, and no module row goes with it (R-89, R-91).
        const other = page.getByRole("listitem", {
          name: "Other",
          exact: true,
        });

        const otherBefore = Number(
          (await other.textContent())?.match(/(\d+) modules?/)?.[1]
        );

        const deletedBefore = await auditCount("core:category_deleted");

        await page
          .getByRole("button", { name: `Delete ${renamed}`, exact: true })
          .click();

        const confirm = page.getByRole("dialog", {
          name: `Delete ${renamed}?`,
        });

        await expect(confirm).toContainText("1 module becomes ungrouped");
        await expectNoAxeViolations(page, "delete confirm");
        await confirm
          .getByRole("button", { name: "Delete", exact: true })
          .click();

        await expect(
          page.getByRole("listitem", { name: renamed, exact: true })
        ).toHaveCount(0);
        await expectOneMore("core:category_deleted", deletedBefore);
        await expect(other).toContainText(`${otherBefore + 1} module`);
        await expect(picker).toContainText("No category");
        expect(await sql("select count(*) from tenant_module")).toBe(
          moduleRows
        );
        expect(
          await sql(
            "select coalesce(category_id::text, 'null') from tenant_module where module_id = 'placeholder'"
          )
        ).toBe("null");
      } finally {
        await queryBrokerDatabase(
          INVITE_DB,
          `delete from category where name in ('${first}', '${renamed}', '${second}');
           update tenant_module set category_id = ${originalCategory === "null" ? "null" : `'${originalCategory}'`}
            where module_id = 'placeholder'`
        );
      }
    },
    LOCK_WAIT_MS
  );
});
