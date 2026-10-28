import { expect, test, type Page } from "@playwright/test";

import { scenarioEmail } from "./scenarios.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import {
  brokeredGenieOps,
  INVITE_DB,
  inviteBaseUrl,
  queryBrokerDatabase,
} from "./support/brokered.ts";
import { chooseOption } from "./support/choose-option.ts";
import { withDeploymentLock } from "./support/lock.ts";
import { rpcPost } from "./support/rpc.ts";
import { openNavigation } from "./support/shell.ts";
import { signInThroughBroker } from "./support/sign-in.ts";

/**
 * Spec 3 S3-06: Tenant Settings and ConfigForm (AC-10, and the settings part of AC-19), at the
 * phone and the desktop viewport (DEC-25).
 *
 * The proofs run on the invite deployment, as the Modules proof does. The core section saves change
 * its one `tenant_settings` row, which the invite proof of `done-when.spec.ts` reads, so they hold
 * the `tenant-settings` lock that proof takes and restore the row before releasing it. The
 * placeholder section writes `tenant_module.config`, which the Modules proof's enable parses, so
 * that part holds the `s2-16-entitlement` lock. The page reads fresh rows, so no read here polls
 * for the 10-second readers.
 */
const BASE = inviteBaseUrl();

const LOCK_WAIT_MS = 300_000;

const POLL = { timeout: 30_000, intervals: [1000] };

test.describe.configure({ timeout: 420_000 });

async function sql(query: string): Promise<string> {
  const [first] = await queryBrokerDatabase(INVITE_DB, query);

  return first ?? "";
}

const auditCount = (action: string) =>
  sql(`select count(*) from audit_event where action = '${action}'`).then(
    Number
  );

/** Polls an audit count until it is one above `before`: one row per save (R-90a). */
async function expectOneMore(action: string, before: number): Promise<void> {
  await expect.poll(() => auditCount(action), POLL).toBe(before + 1);
}

const settingsColumn = (column: string) =>
  sql(`select ${column}::text from tenant_settings`);

const placeholderConfig = () =>
  sql("select config::text from tenant_module where module_id = 'placeholder'");

/** The AI settings and the model key back to a fresh deployment: no key, no models. */
const resetAiSettings = () =>
  sql(
    `delete from tenant_integration_key;
     update tenant_settings set allowed_models = '{}', chat_model = null, document_model = null`
  );

const navigator = (page: Page) =>
  page.getByRole("navigation", { name: "Settings sections" });

/** A navigator row: its name starts with the section title, then a Disabled pill or (unsaved). */
const sectionRow = (page: Page, title: string) =>
  navigator(page).getByRole("button", {
    name: new RegExp(
      `^${title.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`
    ),
  });

/** On a phone a section is its own screen; this returns to the list. A desktop shows both. */
async function backToList(page: Page): Promise<void> {
  const back = page.getByRole("button", { name: "All settings" });

  // Either the list or the section shows once the read answered.
  await expect(
    navigator(page).or(back).filter({ visible: true }).first()
  ).toBeVisible();

  if (await back.isVisible()) await back.click();
}

/** Opens a section from the navigator. */
async function openSection(page: Page, name: string): Promise<void> {
  await backToList(page);
  await sectionRow(page, name).click();
  await expect(
    page.getByRole("heading", { level: 2, name, exact: true })
  ).toBeVisible();
}

async function saveAndExpect(
  page: Page,
  section: string,
  action: string
): Promise<void> {
  const before = await auditCount(action);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(`${section} saved. Written to the audit log.`).first()
  ).toBeVisible();
  await expectOneMore(action, before);
}

test("changes onboarding mode, local accounts and idle minutes, one core:settings_updated row each (AC-10)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "tenant-settings",
    async () => {
      const realmSupport = await settingsColumn(
        "realm_supports_local_accounts"
      );

      const action = "core:settings_updated";

      try {
        await sql(
          "update tenant_settings set realm_supports_local_accounts = false"
        );
        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });

        await page.goto(`${BASE}/admin/settings`);
        await expect(
          page.getByRole("heading", { level: 1, name: "Tenant settings" })
        ).toBeVisible();
        await openSection(page, "Sign-in & accounts");

        // A brokered-only realm: the switch is disabled with the design's note (R-74).
        const local = page.getByRole("switch", {
          name: "Allow local accounts",
        });

        await expect(local).toBeDisabled();
        await expect(
          page.getByText(
            "The tenant realm is brokered only. Ask your Genie operator to add local accounts to the realm."
          )
        ).toBeVisible();
        await expectNoAxeViolations(page, "Sign-in & accounts");

        // Onboarding mode, saved and still there after a reload, then restored through the page.
        await page.getByRole("radio", { name: /Just-in-time/ }).check();
        await saveAndExpect(page, "Sign-in & accounts", action);
        expect(await settingsColumn("onboarding_mode")).toBe("jit");
        await page.reload();
        await openSection(page, "Sign-in & accounts");
        await expect(
          page.getByRole("radio", { name: /Just-in-time/ })
        ).toBeChecked();
        await page.getByRole("radio", { name: /Invite only/ }).check();
        await saveAndExpect(page, "Sign-in & accounts", action);
        expect(await settingsColumn("onboarding_mode")).toBe("invite");

        // Local accounts, once the realm holds them.
        await sql(
          "update tenant_settings set realm_supports_local_accounts = true"
        );
        await page.reload();
        await openSection(page, "Sign-in & accounts");
        await expect(local).toBeEnabled();
        await local.click();
        await saveAndExpect(page, "Sign-in & accounts", action);
        expect(await settingsColumn("local_accounts_enabled")).toBe("true");
        await local.click();
        await saveAndExpect(page, "Sign-in & accounts", action);
        expect(await settingsColumn("local_accounts_enabled")).toBe("false");

        // Idle minutes: 15 by default, 4 and 481 refused with the fixed text, 5 and 480 saved.
        await openSection(page, "Sessions");

        const idle = page.getByRole("spinbutton", { name: "Idle timeout" });
        const save = page.getByRole("button", { name: "Save", exact: true });

        await expect(idle).toHaveValue("15");

        /* eslint-disable no-await-in-loop -- each value is entered after the previous one, in one form. */
        for (const refused of ["4", "481"]) {
          await idle.fill(refused);
          await idle.blur();
          await expect(
            page.getByText("Enter a whole number from 5 to 480.")
          ).toBeVisible();
          await expect(save).toBeDisabled();
        }

        await expectNoAxeViolations(page, "Sessions with an error");

        // A failed save keeps its reason readable in dark (6wz1.71). The invite branding keeps
        // `system`, so the emulated scheme switches the theme live.
        const saveSessions = "**/api/rpc/settings/saveSessions";

        await idle.fill("20");
        await page.route(saveSessions, (route) => route.abort());
        await save.click();

        // The failure names what was not saved, the cause and the kept edit, and takes focus.
        const failure = page
          .getByRole("alert")
          .filter({ hasText: "The idle timeout was not saved." });

        await expect(failure).toHaveText(
          "The idle timeout was not saved. The server could not be reached. Check your connection. Your change is kept."
        );
        await expect(failure).toBeFocused();
        await expect(idle).toHaveValue("20");
        await page.emulateMedia({ colorScheme: "dark" });
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark"
        );
        await expectNoAxeViolations(page, "Sessions not saved, dark");
        await page.emulateMedia({ colorScheme: "light" });
        await page.unroute(saveSessions);

        // A refusal names its reason. The body is the transport's own `forbidden` answer.
        await page.route(saveSessions, (route) =>
          route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              json: {
                defined: false,
                code: "forbidden",
                status: 403,
                message: "You may not do that.",
                data: { appCode: "forbidden", requestId: "e2e-refused" },
              },
              meta: [],
            }),
          })
        );
        await save.click();
        await expect(failure).toHaveText(
          "The idle timeout was not saved. You do not have permission to make this change. Your change is kept."
        );
        await expect(failure).toBeFocused();
        await page.unroute(saveSessions);

        for (const accepted of ["5", "480", "15"]) {
          await idle.fill(accepted);
          await saveAndExpect(page, "Sessions", action);
          expect(await settingsColumn("session_idle_minutes")).toBe(accepted);
        }
        /* eslint-enable no-await-in-loop */

        await page.reload();
        await openSection(page, "Sessions");
        await expect(idle).toHaveValue("15");
      } finally {
        await sql(
          `update tenant_settings set onboarding_mode = 'invite', local_accounts_enabled = false,
             session_idle_minutes = 15, realm_supports_local_accounts = ${realmSupport === "true"}`
        );
      }
    },
    LOCK_WAIT_MS
  );
});

test("sets and clears the reporting date (R-9)", async ({ page }, testInfo) => {
  await withDeploymentLock(
    "tenant-settings",
    async () => {
      const action = "core:settings_updated";

      try {
        await sql("update tenant_settings set reporting_date = null");
        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });

        await page.goto(`${BASE}/admin/settings?section=reporting`);
        await expect(
          page.getByRole("heading", { level: 2, name: "Reporting" })
        ).toBeVisible();

        const date = page.getByLabel("Reporting date");
        const save = page.getByRole("button", { name: "Save", exact: true });

        await expect(page.getByText(/Blank means today in .+\./)).toBeVisible();

        await date.fill("2026-10-27");
        await saveAndExpect(page, "Reporting", action);
        expect(await settingsColumn("reporting_date")).toBe("2026-10-27");

        await page.reload();
        await expect(date).toHaveValue("2026-10-27");
        await expectNoAxeViolations(page, "Reporting");

        // A half-typed date blocks Save instead of saving as blank, which would clear the
        // setting to today and move every figure (Review Focus 3). Mobile Chromium opens the
        // native picker instead and has no keyboard-editable segments, so this runs on desktop.
        if (testInfo.project.name === "desktop") {
          await date.click({ position: { x: 8, y: 10 } });
          await page.keyboard.press("Backspace");
          await expect(date).toHaveValue("");
          await expect(save).toBeDisabled();
          await expect(
            page.getByText(
              "Enter a whole date, or clear the field to use today."
            )
          ).toBeVisible();
          expect(await settingsColumn("reporting_date")).toBe("2026-10-27");
        }

        await page.reload();
        await page.getByRole("button", { name: "Use today" }).click();
        await saveAndExpect(page, "Reporting", action);
        expect(await settingsColumn("reporting_date")).toBe("");
      } finally {
        await sql("update tenant_settings set reporting_date = null");
      }
    },
    LOCK_WAIT_MS
  );
});

test("the placeholder section renders five kinds, refuses an invalid value and saves into tenant_module.config, also while disabled (AC-10, AC-19)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "s2-16-entitlement",
    async () => {
      const original = await placeholderConfig();

      const action = "core:module_configured";

      try {
        // A stored value that fails the schema, written outside the page.
        await sql(
          `update tenant_module set config = '{"pageSize": 500}'::jsonb where module_id = 'placeholder'`
        );
        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });
        await page.goto(`${BASE}/admin/settings?section=placeholder`);
        await expect(
          page.getByRole("heading", { level: 2, name: "Placeholder" })
        ).toBeVisible();

        // The image compiles one module with settings, so the Modules group holds exactly it.
        await backToList(page);
        await expect(
          navigator(page).getByRole("list").nth(1).getByRole("button")
        ).toHaveText([/Placeholder/]);
        await openSection(page, "Placeholder");

        // Five kinds, the stored failure shown at once, Save disabled while any field is invalid.
        await expect(
          page.getByRole("textbox", { name: "Title" })
        ).toBeVisible();
        await expect(
          page.getByRole("switch", { name: "Enabled" })
        ).toBeVisible();
        await expect(
          page.getByRole("combobox", { name: "Mode" })
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Add entry" })
        ).toBeVisible();

        const pageSize = page.getByRole("spinbutton", { name: "Page size" });
        const save = page.getByRole("button", { name: "Save", exact: true });

        await expect(
          page.getByText("Page size must be at most 100.")
        ).toBeVisible();
        await expect(save).toBeDisabled();
        await expectNoAxeViolations(page, "Placeholder settings");

        // Another field shows its message on blur.
        const title = page.getByRole("textbox", { name: "Title" });

        await title.fill("");
        await title.blur();
        await expect(page.getByText("Title is required.")).toBeVisible();
        await title.fill("Renamed");
        await pageSize.fill("40");
        await pageSize.blur();
        await expect(
          page.getByText("Page size must be at most 100.")
        ).toHaveCount(0);
        await saveAndExpect(page, "Placeholder", action);
        expect(JSON.parse(await placeholderConfig())).toMatchObject({
          title: "Renamed",
          pageSize: 40,
        });

        await page.reload();
        await openSection(page, "Placeholder");
        await expect(pageSize).toHaveValue("40");

        // A disabled module stays configurable, and a save never switches it on (R-77, R-79).
        await brokeredGenieOps("invite", ["module", "disable", "placeholder"]);
        await page.reload();
        await openSection(page, "Placeholder");
        await expect(
          page.getByText("Placeholder is switched off.")
        ).toBeVisible();
        await title.fill("Prepared");
        await saveAndExpect(page, "Placeholder", action);
        expect(
          await sql(
            "select enabled::text from tenant_module where module_id = 'placeholder'"
          )
        ).toBe("false");
      } finally {
        await sql(
          `update tenant_module set config = '${original.replaceAll("'", "''")}'::jsonb where module_id = 'placeholder'`
        );

        if (
          (await sql(
            "select enabled::text from tenant_module where module_id = 'placeholder'"
          )) !== "true"
        )
          await brokeredGenieOps("invite", ["module", "enable", "placeholder"]);
      }
    },
    LOCK_WAIT_MS
  );
});

test("stores and removes the model key write-only, saves the AI models, and shows AI is off without them (Spec 7 R-17, R-18, R-20)", async ({
  page,
}, testInfo) => {
  await withDeploymentLock(
    "tenant-settings",
    async () => {
      const KEY =
        "sk-or-v1-s7-05-e2e-not-a-real-key-0000000000000000000000000000000";

      const CHAT = "openai/gpt-6.1-terra";
      const DOCUMENT = "anthropic/claude-opus-5.5";

      // Every answer the page receives, so the key can be proved absent from all of them. An
      // answer that cannot be read fails the case rather than passing unread.
      const answers: Promise<string>[] = [];
      const unread: string[] = [];

      page.on("response", (response) => {
        if (!response.url().includes("/api/rpc/")) return;

        answers.push(
          response.text().catch(() => {
            unread.push(response.url());

            return "";
          })
        );
      });

      try {
        await resetAiSettings();
        await signInThroughBroker(page, {
          baseUrl: BASE,
          email: scenarioEmail("invite", "settings", testInfo.project.name),
        });

        await page.goto(`${BASE}/admin/settings?section=ai-connection`);
        await expect(
          page.getByRole("heading", { level: 2, name: "AI connection" })
        ).toBeVisible();

        // AI is off without a key, in both sections, and the section raises no axe violation.
        await expect(
          page.getByText("Not stored", { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText("AI is off.", { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText(
            "Store a model provider key in AI connection to turn on AI features."
          )
        ).toBeVisible();
        await expectNoAxeViolations(page, "AI connection");

        // The key is write-only: it saves, the pill turns, and the field empties again.
        const field = page.getByLabel("OpenRouter API key");
        const storedBefore = await auditCount("core:integration_key_stored");

        await field.fill(KEY);
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(
          page.getByText("AI connection saved. Written to the audit log.")
        ).toBeVisible();
        await expect(page.getByText("Stored", { exact: true })).toBeVisible();
        await expect(field).toHaveValue("");
        await expectOneMore("core:integration_key_stored", storedBefore);
        expect(
          await sql(
            "select value from tenant_integration_key where name = 'model-provider'"
          )
        ).toBe(KEY);

        // The key alone is not on: the defaults are still missing.
        await openSection(page, "AI models");
        await expect(
          page.getByText("AI is off.", { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText(
            "Choose the allowed models and the two defaults in AI models to turn on AI features."
          )
        ).toBeVisible();

        // The list and both defaults save together.
        await page
          .getByRole("textbox", { name: "Allowed models" })
          .fill(`${CHAT}\n${DOCUMENT}`);
        await chooseOption(page, "Chat default", CHAT);
        await chooseOption(page, "Document reading", DOCUMENT);
        await saveAndExpect(page, "AI models", "core:settings_updated");

        expect(
          await sql(
            "select array_to_string(allowed_models, ',') from tenant_settings"
          )
        ).toBe(`${CHAT},${DOCUMENT}`);
        expect(await settingsColumn("chat_model")).toBe(CHAT);
        expect(await settingsColumn("document_model")).toBe(DOCUMENT);
        await expect(page.getByText("AI is off.", { exact: true })).toHaveCount(
          0
        );
        await expectNoAxeViolations(page, "AI models");

        // "Stored" survives a reload, and the page never renders the key.
        await page.reload();
        await openSection(page, "AI connection");
        await expect(page.getByText("Stored", { exact: true })).toBeVisible();
        expect(await page.content()).not.toContain(KEY);

        // The state survives the reload too: AI is still on, so no section shows the note.
        await expect(page.getByText("AI is off.", { exact: true })).toHaveCount(
          0
        );

        // Removing the key turns AI off again, and the removal is its own audit event.
        const removedBefore = await auditCount("core:integration_key_removed");

        await page.getByRole("button", { name: "Remove key" }).click();

        const confirm = page.getByRole("dialog", {
          name: "Remove the model provider key?",
        });

        await confirm.getByRole("button", { name: "Remove key" }).click();
        await expect(
          page.getByText(
            "Model provider key removed. Written to the audit log."
          )
        ).toBeVisible();
        await expect(
          page.getByText("Not stored", { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText("AI is off.", { exact: true })
        ).toBeVisible();
        await expectOneMore("core:integration_key_removed", removedBefore);

        // No answer the page received holds the key, and no audit row names or carries it.
        const bodies = await Promise.all(answers);

        expect(unread).toEqual([]);

        for (const body of bodies) expect(body).not.toContain(KEY);
        expect(
          await sql(
            `select count(*) from audit_event
              where action like 'core:integration_key_%'
                and (summary like '%${KEY}%' or metadata::text like '%${KEY}%')`
          )
        ).toBe("0");
      } finally {
        await resetAiSettings();
      }
    },
    LOCK_WAIT_MS
  );
});

test("section navigation, focus on a linked field, a stale link and dirty-navigation recovery (AC-19)", async ({
  page,
}, testInfo) => {
  await signInThroughBroker(page, {
    baseUrl: BASE,
    email: scenarioEmail("invite", "settings", testInfo.project.name),
  });

  // A link to a field opens its section with the field in focus.
  await page.goto(
    `${BASE}/admin/settings?section=sessions&field=sessionIdleMinutes`
  );

  const idle = page.getByRole("spinbutton", { name: "Idle timeout" });

  await expect(idle).toBeFocused();

  // A section that does not exist, or that the viewer may not open, lands on the first section.
  await page.goto(`${BASE}/admin/settings?section=retired-module&field=x`);
  await expect(
    page.getByText(
      "That settings section does not exist, or you may not open it."
    )
  ).toBeVisible();
  await expectNoAxeViolations(page, "stale settings link");

  // Leaving an edited section asks first; Cancel keeps the edit, Discard drops it.
  await page.goto(`${BASE}/admin/settings?section=sessions`);
  await idle.fill("30");

  const back = page.getByRole("button", { name: "All settings" });

  const leave = async () =>
    (await back.isVisible())
      ? back.click()
      : sectionRow(page, "Placeholder").click();

  await leave();

  const confirm = page.getByRole("dialog", {
    name: "Discard the changes in Sessions?",
  });

  await expect(confirm).toContainText(
    "The changes you have not saved are dropped. Nothing was written yet."
  );
  await expectNoAxeViolations(page, "discard confirm");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(idle).toHaveValue("30");

  await leave();
  await confirm.getByRole("button", { name: "Discard" }).click();
  await openSection(page, "Sessions");
  // The core proof may save this row meanwhile, so only the dropped edit is asserted.
  await expect(idle).not.toHaveValue("30");
});

test("a person without core:settings:manage sees no Settings entry and the route refuses (AC-10, R-93)", async ({
  page,
}, testInfo) => {
  await signInThroughBroker(page, {
    baseUrl: BASE,
    email: scenarioEmail("invite", "nosettings", testInfo.project.name),
  });
  await page.goto(`${BASE}/admin/audit`);
  await expect(
    (await openNavigation(page)).getByRole("link", {
      name: "Settings",
      exact: true,
    })
  ).toHaveCount(0);

  await page.goto(`${BASE}/admin/settings`);
  await expect(page.getByTestId("permission-denied")).toBeVisible();
});

test(
  "the settings procedures refuse a person without core:settings:manage (AC-10, R-93) @no-screen",
  { tag: "@no-screen" },
  async ({ page }, testInfo) => {
    await signInThroughBroker(page, {
      baseUrl: BASE,
      email: scenarioEmail("invite", "nosettings", testInfo.project.name),
    });

    const read = await rpcPost(page.request, `${BASE}/api/rpc/settings/read`);

    expect(read.status()).toBe(403);
    expect(await read.text()).toContain('"appCode":"forbidden"');
  }
);
