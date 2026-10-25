import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import type { AuditMetadataValue } from "../src/services/audit/index.ts";
import {
  principalFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { setModuleEnabledIn } from "../src/services/module-management/index.ts";
import {
  readSettings,
  saveModuleSettings,
  saveSessionSettings,
  saveSignInSettings,
} from "../src/services/settings/index.ts";
import {
  insertPersonWith,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The Tenant Settings service of Spec 3 (R-72 to R-80, AC-10, AC-19) against a real Postgres: one
 * audit row per save that changes a value, refusals with issues, the section permission as an AND
 * on `core:settings:manage`, and module saves that write `tenant_module.config` only.
 */
function fixtureCopy(id: string, overrides: Partial<Module> = {}): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id, displayName: `Module ${id}` },
    schema: { ...validModule.schema, migrationsTable: moduleLedgerTable(id) },
    ...overrides,
  };
}

const { configuration: fixtureConfiguration, ...withoutConfiguration } =
  validModule;

if (fixtureConfiguration === undefined)
  throw new Error("the fixture declares configuration");

/** Its section needs `fixture:admin` on top of the base key. */
const restricted = fixtureCopy("restricted", {
  configuration: {
    ...fixtureConfiguration,
    section: {
      id: "restricted",
      title: "Restricted",
      additionalPermission: "fixture:admin",
    },
  },
});

/** Compiled, but declares no configuration, so it has no section. */
const bare: Module = {
  ...withoutConfiguration,
  identity: { ...validModule.identity, id: "bare", displayName: "Bare" },
  schema: { ...validModule.schema, migrationsTable: moduleLedgerTable("bare") },
};

const compiled = [validModule, restricted, bare];

const BASE = "core:settings:manage";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let actorUserId: string;

async function query<Row extends QueryResultRow = Record<string, string>>(
  text: string,
  values: unknown[] = []
) {
  return (await deployment.context.db.$client.query<Row>(text, values)).rows;
}

async function clock(): Promise<Date> {
  const [row] = await query<{ now: Date }>("select clock_timestamp() as now");

  if (row === undefined) throw new Error("the clock read returned no row");

  return row.now;
}

async function callerWith(permissions: readonly string[]) {
  const { userId } = await insertPersonWith(deployment.context, permissions);

  return principalFor({
    tenant: deployment.context,
    modules: compiled,
    userId,
    authenticated: true,
  });
}

beforeAll(async () => {
  deployment = await startDisposableDeployment(compiled);

  await query(
    "insert into tenant_module (module_id, enabled) select unnest($1::text[]), false",
    [["fixture", "restricted", "bare", "excluded"]]
  );
  await query(
    "insert into tenant_settings default values on conflict do nothing"
  );
  await seedRoles(deployment.context, compiled);
  actorUserId = await insertUser(deployment.context, { name: "Ada Admin" });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

let since: Date;

beforeEach(async () => {
  await query("update tenant_module set enabled = false, config = '{}'::jsonb");
  await query(
    `update tenant_settings set onboarding_mode = 'invite', local_accounts_enabled = false,
       realm_supports_local_accounts = true, session_idle_minutes = 15, updated_by_user_id = null`
  );
  since = await clock();
});

async function auditRows() {
  return query<{
    action: string;
    target_type: string;
    target_id: string;
    summary: string;
    metadata: AuditMetadataValue;
  }>(
    `select action, target_type, target_id, summary, metadata
       from audit_event where occurred_at >= $1 order by occurred_at, id`,
    [since]
  );
}

async function settingsRow() {
  const [row] = await query<{
    onboarding_mode: string;
    local_accounts_enabled: boolean;
    realm_supports_local_accounts: boolean;
    session_idle_minutes: number;
    updated_by_user_id: string | null;
  }>("select * from tenant_settings");

  return row;
}

async function adminKey() {
  const [row] = await query<{ held: boolean }>(
    "select 'fixture:admin' = any(permissions) as held from role where name = 'Tenant administrator'"
  );

  return row?.held;
}

async function moduleRow(id: string) {
  const [row] = await query<{
    enabled: boolean;
    config: AuditMetadataValue;
  }>("select enabled, config from tenant_module where module_id = $1", [id]);

  return row;
}

describe("core section saves", () => {
  it("each core save writes exactly one core:settings_updated row and changes only its own fields", async () => {
    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "jit",
        localAccountsEnabled: true,
      })
    ).resolves.toEqual({ changed: true });

    await expect(
      saveSessionSettings(deployment.context, {
        actorUserId,
        sessionIdleMinutes: 30,
      })
    ).resolves.toEqual({ changed: true });

    expect(await settingsRow()).toMatchObject({
      onboarding_mode: "jit",
      local_accounts_enabled: true,
      realm_supports_local_accounts: true,
      session_idle_minutes: 30,
      updated_by_user_id: actorUserId,
    });

    expect(await auditRows()).toEqual([
      {
        action: "core:settings_updated",
        target_type: "settings",
        target_id: "sign-in",
        summary: "Changed Sign-in & accounts",
        metadata: {
          section: "sign-in",
          changes: {
            onboardingMode: { from: "invite", to: "jit" },
            localAccountsEnabled: { from: false, to: true },
          },
        },
      },
      {
        action: "core:settings_updated",
        target_type: "settings",
        target_id: "sessions",
        summary: "Changed Sessions",
        metadata: {
          section: "sessions",
          changes: { sessionIdleMinutes: { from: 15, to: 30 } },
        },
      },
    ]);
  });

  it("a save of the stored values answers changed false and writes no audit row", async () => {
    await expect(
      saveSessionSettings(deployment.context, {
        actorUserId,
        sessionIdleMinutes: 15,
      })
    ).resolves.toEqual({ changed: false });
    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "invite",
        localAccountsEnabled: false,
      })
    ).resolves.toEqual({ changed: false });

    expect(await auditRows()).toEqual([]);
    expect((await settingsRow())?.updated_by_user_id).toBeNull();
  });

  it("idle minutes 4 and 481 refuse with settings-invalid and the issue for sessionIdleMinutes; 5 and 480 save", async () => {
    await Promise.all(
      [4, 481, 7.5].map((minutes) =>
        expect(
          saveSessionSettings(deployment.context, {
            actorUserId,
            sessionIdleMinutes: minutes,
          })
        ).rejects.toMatchObject({
          code: "settings-invalid",
          issues: [
            {
              path: "sessionIdleMinutes",
              message: "Enter a whole number from 5 to 480.",
            },
          ],
        })
      )
    );

    expect(await auditRows()).toEqual([]);

    await saveSessionSettings(deployment.context, {
      actorUserId,
      sessionIdleMinutes: 5,
    });
    expect((await settingsRow())?.session_idle_minutes).toBe(5);

    await saveSessionSettings(deployment.context, {
      actorUserId,
      sessionIdleMinutes: 480,
    });
    expect((await settingsRow())?.session_idle_minutes).toBe(480);
  });

  it("an onboarding mode outside the two refuses with settings-invalid", async () => {
    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "open",
        localAccountsEnabled: false,
      })
    ).rejects.toMatchObject({
      code: "settings-invalid",
      issues: [expect.objectContaining({ path: "onboardingMode" })],
    });
  });

  it("local accounts on refuses with local-accounts-unavailable while the realm does not support them", async () => {
    await query(
      "update tenant_settings set realm_supports_local_accounts = false"
    );

    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "invite",
        localAccountsEnabled: true,
      })
    ).rejects.toMatchObject({ code: "local-accounts-unavailable" });

    expect((await settingsRow())?.local_accounts_enabled).toBe(false);
    expect(await auditRows()).toEqual([]);

    // A save that leaves the switch off still saves in a brokered-only realm.
    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "jit",
        localAccountsEnabled: false,
      })
    ).resolves.toEqual({ changed: true });
    expect((await settingsRow())?.realm_supports_local_accounts).toBe(false);
  });

  it("a stored local accounts on switches off in a realm without local accounts, and stays refused back on", async () => {
    await query(
      "update tenant_settings set local_accounts_enabled = true, realm_supports_local_accounts = false"
    );

    // Saving the stored value again changes nothing and never refuses.
    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "invite",
        localAccountsEnabled: true,
      })
    ).resolves.toEqual({ changed: false });

    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "invite",
        localAccountsEnabled: false,
      })
    ).resolves.toEqual({ changed: true });

    expect((await settingsRow())?.local_accounts_enabled).toBe(false);
    expect(await auditRows()).toEqual([
      expect.objectContaining({
        action: "core:settings_updated",
        metadata: {
          section: "sign-in",
          changes: { localAccountsEnabled: { from: true, to: false } },
        },
      }),
    ]);

    await expect(
      saveSignInSettings(deployment.context, {
        actorUserId,
        onboardingMode: "invite",
        localAccountsEnabled: true,
      })
    ).rejects.toMatchObject({ code: "local-accounts-unavailable" });
  });
});

// Each form sends only the fields its person changed, so a form loaded before another
// administrator's save does not write that save's fields back (admin M-1).
describe("saves from two forms loaded at the same time", () => {
  it("two sign-in saves of different fields both survive, and each audit row names only its field", async () => {
    await saveSignInSettings(deployment.context, {
      actorUserId,
      onboardingMode: "jit",
    });
    await saveSignInSettings(deployment.context, {
      actorUserId,
      localAccountsEnabled: true,
    });

    expect(await settingsRow()).toMatchObject({
      onboarding_mode: "jit",
      local_accounts_enabled: true,
    });
    expect(await auditRows()).toEqual([
      expect.objectContaining({
        metadata: {
          section: "sign-in",
          changes: { onboardingMode: { from: "invite", to: "jit" } },
        },
      }),
      expect.objectContaining({
        metadata: {
          section: "sign-in",
          changes: { localAccountsEnabled: { from: false, to: true } },
        },
      }),
    ]);
  });

  it("two module saves of different fields both survive, and each audit row names only its field", async () => {
    const caller = await callerWith([BASE]);

    await saveModuleSettings(deployment.context, compiled, caller, {
      actorUserId,
      moduleId: "fixture",
      values: { title: "From A" },
    });
    await saveModuleSettings(deployment.context, compiled, caller, {
      actorUserId,
      moduleId: "fixture",
      values: { pageSize: 40 },
    });

    expect((await moduleRow("fixture"))?.config).toEqual({
      title: "From A",
      pageSize: 40,
      enabled: false,
      mode: "basic",
      tags: [],
    });
    expect(await auditRows()).toEqual([
      expect.objectContaining({ metadata: { changedFields: ["title"] } }),
      expect.objectContaining({ metadata: { changedFields: ["pageSize"] } }),
    ]);
  });

  it("a module field sent as null drops its stored value and falls back to the default", async () => {
    const caller = await callerWith([BASE]);

    await query(
      `update tenant_module set config = '{"title": "Kept", "pageSize": 40}'::jsonb
         where module_id = 'fixture'`
    );

    await saveModuleSettings(deployment.context, compiled, caller, {
      actorUserId,
      moduleId: "fixture",
      values: { pageSize: null },
    });

    expect((await moduleRow("fixture"))?.config).toMatchObject({
      title: "Kept",
      pageSize: 20,
    });
    expect(await auditRows()).toEqual([
      expect.objectContaining({ metadata: { changedFields: ["pageSize"] } }),
    ]);
  });
});

describe("module section saves", () => {
  it("a module save writes exactly one core:module_configured row and the parsed values to tenant_module.config", async () => {
    const caller = await callerWith([BASE]);

    await expect(
      saveModuleSettings(deployment.context, compiled, caller, {
        actorUserId,
        moduleId: "fixture",
        values: {
          title: "Renamed",
          pageSize: 40,
          enabled: true,
          mode: "advanced",
          tags: ["a"],
        },
      })
    ).resolves.toEqual({ changed: true });

    expect((await moduleRow("fixture"))?.config).toEqual({
      title: "Renamed",
      pageSize: 40,
      enabled: true,
      mode: "advanced",
      tags: ["a"],
    });

    expect(await auditRows()).toEqual([
      {
        action: "core:module_configured",
        target_type: "module",
        target_id: "fixture",
        summary: "Changed the Fixture settings",
        metadata: {
          changedFields: ["title", "pageSize", "enabled", "mode", "tags"],
        },
      },
    ]);
  });

  it("refuses an invalid value with settings-invalid and the field issue, and writes nothing", async () => {
    const caller = await callerWith([BASE]);

    await expect(
      saveModuleSettings(deployment.context, compiled, caller, {
        actorUserId,
        moduleId: "fixture",
        values: {
          title: "Fixture",
          pageSize: 500,
          enabled: false,
          mode: "basic",
          tags: [],
        },
      })
    ).rejects.toMatchObject({
      code: "settings-invalid",
      issues: [{ path: "pageSize", message: "Page size must be at most 100." }],
    });

    await expect(
      saveModuleSettings(deployment.context, compiled, caller, {
        actorUserId,
        moduleId: "fixture",
        values: {
          title: "Fixture",
          pageSize: "x",
          enabled: false,
          mode: "basic",
          tags: [],
        },
      })
    ).rejects.toMatchObject({
      code: "settings-invalid",
      issues: [{ path: "pageSize", message: "Page size is required." }],
    });

    expect((await moduleRow("fixture"))?.config).toEqual({});
    expect(await auditRows()).toEqual([]);
  });

  it("a save of the values the page shows answers changed false", async () => {
    const caller = await callerWith([BASE]);

    const { modules } = await readSettings(
      deployment.context,
      compiled,
      caller
    );

    const shown = modules.find((section) => section.moduleId === "fixture");

    await expect(
      saveModuleSettings(deployment.context, compiled, caller, {
        actorUserId,
        moduleId: "fixture",
        values: shown?.values ?? {},
      })
    ).resolves.toEqual({ changed: false });
    expect(await auditRows()).toEqual([]);
  });

  it("a save drops a stored key the schema does not declare and lists it in changedFields (U-5)", async () => {
    const caller = await callerWith([BASE]);

    await query(
      `update tenant_module set config = '{"title": "Kept", "legacy": "old"}'::jsonb
         where module_id = 'fixture'`
    );

    const { modules } = await readSettings(
      deployment.context,
      compiled,
      caller
    );

    const shown = modules.find((section) => section.moduleId === "fixture");

    await expect(
      saveModuleSettings(deployment.context, compiled, caller, {
        actorUserId,
        moduleId: "fixture",
        values: shown?.values ?? {},
      })
    ).resolves.toEqual({ changed: true });

    expect((await moduleRow("fixture"))?.config).not.toHaveProperty("legacy");
    expect(await auditRows()).toEqual([
      expect.objectContaining({
        action: "core:module_configured",
        metadata: { changedFields: ["legacy"] },
      }),
    ]);
  });

  it("a save that runs during a module enable waits for it, and both the switch and the values survive", async () => {
    const caller = await callerWith([BASE]);
    const enabled = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();

    // The enable holds its row lock until released. The save starts outside its transaction,
    // because withTransaction refuses nesting.
    const enable = withTransaction(deployment.context, async (tx) => {
      await setModuleEnabledIn(tx, compiled, "fixture", true);
      enabled.resolve();
      await release.promise;
    });

    await enabled.promise;

    const save = saveModuleSettings(deployment.context, compiled, caller, {
      actorUserId,
      moduleId: "fixture",
      values: {
        title: "During enable",
        pageSize: 30,
        enabled: false,
        mode: "basic",
        tags: [],
      },
    });

    try {
      // Commit the enable only once the save waits on the same tenant_module row lock.
      await expect
        .poll(async () => {
          const [row] = await query<{ waiting: number }>(
            "select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%from \"tenant_module\"%for update%'"
          );

          return row?.waiting;
        })
        .toBe(1);
    } finally {
      release.resolve();
      await enable;
    }

    await expect(save).resolves.toEqual({ changed: true });
    expect(await moduleRow("fixture")).toEqual({
      enabled: true,
      config: {
        title: "During enable",
        pageSize: 30,
        enabled: false,
        mode: "basic",
        tags: [],
      },
    });
    expect(await auditRows()).toEqual([
      expect.objectContaining({
        action: "core:module_configured",
        metadata: { changedFields: ["title", "pageSize"] },
      }),
    ]);
  });

  it("a disabled module saves valid configuration and stays disabled with the Tenant administrator admin key unchanged", async () => {
    const caller = await callerWith([BASE]);
    const before = await adminKey();

    await saveModuleSettings(deployment.context, compiled, caller, {
      actorUserId,
      moduleId: "fixture",
      values: {
        title: "Prepared",
        pageSize: 20,
        enabled: false,
        mode: "basic",
        tags: [],
      },
    });

    expect(await moduleRow("fixture")).toMatchObject({
      enabled: false,
      config: { title: "Prepared" },
    });
    expect(await adminKey()).toBe(before);
  });
});

describe("section access (AC-19)", () => {
  const values = {
    title: "Fixture",
    pageSize: 21,
    enabled: false,
    mode: "basic",
    tags: [],
  };

  it("baseline only, baseline plus the required key, module key only and no key on reads and writes", async () => {
    const baseline = await callerWith([BASE]);
    const baselinePlusKey = await callerWith([BASE, "fixture:admin"]);
    const moduleKeyOnly = await callerWith(["fixture:admin"]);
    const noKey = await callerWith([]);

    const sections = async (caller: typeof baseline) =>
      (await readSettings(deployment.context, compiled, caller)).modules.map(
        (section) => section.moduleId
      );

    expect(await sections(baseline)).toEqual(["fixture"]);
    expect(await sections(baselinePlusKey)).toEqual(["fixture", "restricted"]);
    expect(await sections(moduleKeyOnly)).toEqual([]);
    expect(await sections(noKey)).toEqual([]);

    await expect(
      saveModuleSettings(deployment.context, compiled, baselinePlusKey, {
        actorUserId,
        moduleId: "restricted",
        values,
      })
    ).resolves.toEqual({ changed: true });

    await Promise.all(
      [baseline, moduleKeyOnly, noKey].map((caller) =>
        expect(
          saveModuleSettings(deployment.context, compiled, caller, {
            actorUserId,
            moduleId: "restricted",
            values,
          })
        ).rejects.toMatchObject({ code: "not-found" })
      )
    );

    await expect(
      saveModuleSettings(deployment.context, compiled, moduleKeyOnly, {
        actorUserId,
        moduleId: "fixture",
        values,
      })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("a compiled module without configuration and a module the image does not compile contribute no section, and saving either answers not-found", async () => {
    const caller = await callerWith([BASE, "fixture:admin"]);

    const { modules } = await readSettings(
      deployment.context,
      compiled,
      caller
    );

    expect(modules.map((section) => section.moduleId)).not.toContain("bare");
    expect(modules.map((section) => section.moduleId)).not.toContain(
      "excluded"
    );

    await Promise.all(
      ["bare", "excluded"].map((moduleId) =>
        expect(
          saveModuleSettings(deployment.context, compiled, caller, {
            actorUserId,
            moduleId,
            values,
          })
        ).rejects.toMatchObject({ code: "not-found" })
      )
    );
  });
});

describe("readSettings", () => {
  it("shows a save at once and lastChanged names the actor", async () => {
    const caller = await callerWith([BASE]);

    await saveSessionSettings(deployment.context, {
      actorUserId,
      sessionIdleMinutes: 45,
    });
    await saveModuleSettings(deployment.context, compiled, caller, {
      actorUserId,
      moduleId: "fixture",
      values: {
        title: "Fresh",
        pageSize: 20,
        enabled: false,
        mode: "basic",
        tags: [],
      },
    });

    const { core, modules } = await readSettings(
      deployment.context,
      compiled,
      caller
    );

    const fixture = modules.find((section) => section.moduleId === "fixture");

    expect(core).toMatchObject({
      onboardingMode: "invite",
      localAccountsEnabled: false,
      realmMode: "managed",
      realmSupportsLocalAccounts: true,
      sessionIdleMinutes: 45,
      lastChanged: { by: "Ada Admin" },
    });
    expect(fixture).toMatchObject({
      title: "Fixture",
      enabled: false,
      values: { title: "Fresh", pageSize: 20 },
      lastChanged: { by: "Ada Admin" },
    });
    expect(fixture?.schema.properties["pageSize"]).toMatchObject({
      maximum: 100,
    });
  });

  it("fills a missing stored key with its default and keeps a stored value that fails", async () => {
    const caller = await callerWith([BASE]);

    await query(
      `update tenant_module set config = '{"pageSize": 500}'::jsonb where module_id = 'fixture'`
    );

    const { modules } = await readSettings(
      deployment.context,
      compiled,
      caller
    );

    expect(
      modules.find((section) => section.moduleId === "fixture")
    ).toMatchObject({
      values: { title: "Fixture", pageSize: 500, mode: "basic" },
    });
  });
});
