import { afterEach, describe, expect, it } from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  CORE_HISTORY,
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { startDisposableDeployment, startDisposablePostgres } from "./index.ts";

/**
 * The identity, group, role and notification tables the Section 2 core migration creates (R-1),
 * against a real Postgres that received the real core history, read back from the database's own
 * catalogues the way a reviewer would inspect a deployment with psql. Nothing is mocked.
 *
 * The shape mirrors docs/architecture/data-shape.md ("Identity (Better Auth, generated)",
 * "Groups", "Roles and permissions", "Notifications" and "Tenant settings"), table by table, so
 * the two can be diffed side by side. As in the Section 1 test, an aspect is named on a column
 * only where the document states it, and a column with no stated aspect is still listed because
 * the inventory itself is the contract.
 */

type DocumentedColumn = {
  readonly type?: string;
  readonly nullable?: boolean;
  readonly default?: string;
};

type DocumentedTable = {
  readonly columns: Readonly<Record<string, DocumentedColumn>>;
  readonly primaryKey?: readonly string[];
};

const IDENTITY_TABLES = {
  user: {
    columns: {
      id: { type: "text", nullable: false },
      name: { type: "text", nullable: false },
      email: { type: "text", nullable: false },
      email_verified: { type: "boolean", default: "false" },
      image: { type: "text", nullable: true },
      role: { type: "text" },
      banned: { type: "boolean", default: "false" },
      ban_reason: { type: "text" },
      ban_expires: {},
      two_factor_enabled: { type: "boolean", default: "false" },
      status: { type: "text" },
      must_change_password: { type: "boolean", default: "false" },
      is_break_glass: { type: "boolean", nullable: false, default: "false" },
      onboarding: { type: "text" },
      first_sign_in_at: { nullable: true },
      last_sign_in_at: { nullable: true },
      erased_at: { nullable: true },
      created_at: {},
      updated_at: {},
    },
    primaryKey: ["id"],
  },
  session: {
    columns: {
      id: { type: "text", nullable: false },
      expires_at: { nullable: false },
      token: { type: "text", nullable: false },
      created_at: {},
      updated_at: {},
      ip_address: { type: "text", nullable: true },
      user_agent: { type: "text", nullable: true },
      impersonated_by: { type: "text", nullable: true },
      user_id: { type: "text", nullable: false },
    },
    primaryKey: ["id"],
  },
  account: {
    columns: {
      id: { type: "text", nullable: false },
      account_id: { type: "text", nullable: false },
      provider_id: { type: "text", nullable: false },
      user_id: { type: "text", nullable: false },
      access_token: { type: "text", nullable: true },
      refresh_token: { type: "text", nullable: true },
      id_token: { type: "text", nullable: true },
      access_token_expires_at: { nullable: true },
      refresh_token_expires_at: { nullable: true },
      scope: { type: "text", nullable: true },
      password: { type: "text", nullable: true },
      created_at: {},
      updated_at: {},
    },
    primaryKey: ["id"],
  },
  verification: {
    columns: {
      id: { type: "text", nullable: false },
      identifier: { type: "text", nullable: false },
      value: { type: "text", nullable: false },
      expires_at: { nullable: false },
      created_at: {},
      updated_at: {},
    },
    primaryKey: ["id"],
  },
  two_factor: {
    columns: {
      id: { type: "text", nullable: false },
      secret: { type: "text", nullable: false },
      backup_codes: { type: "text", nullable: false },
      user_id: { type: "text", nullable: false },
      verified: { type: "boolean", default: "true" },
      failed_verification_count: { type: "integer", default: "0" },
      locked_until: { nullable: true },
    },
    primaryKey: ["id"],
  },
  group: {
    columns: {
      id: { type: "uuid", nullable: false },
      name: { type: "text", nullable: false },
      external_id: { type: "text", nullable: true },
      display_label: { type: "text", nullable: true },
      source: { type: "text", nullable: false },
      description: { type: "text", nullable: true },
      last_seen_at: { nullable: true },
      archived_at: { nullable: true },
      created_at: {},
      updated_at: {},
    },
    primaryKey: ["id"],
  },
  group_member: {
    columns: {
      group_id: { type: "uuid", nullable: false },
      user_id: { type: "text", nullable: false },
      source: { type: "text", nullable: false },
      synced_at: {},
    },
    primaryKey: ["group_id", "user_id"],
  },
  role: {
    columns: {
      id: { type: "uuid", nullable: false },
      name: { type: "text", nullable: false },
      description: { type: "text", nullable: true },
      module_id: { type: "text", nullable: true },
      permissions: {},
      is_system: { type: "boolean", nullable: false, default: "false" },
      created_at: {},
      updated_at: {},
    },
    primaryKey: ["id"],
  },
  role_assignment: {
    columns: {
      id: { type: "uuid", nullable: false },
      role_id: { type: "uuid", nullable: false },
      principal_type: { type: "text", nullable: false },
      principal_id: { type: "text", nullable: false },
      scope_type: { type: "text", nullable: true },
      scope_id: { type: "text", nullable: true },
      created_by_user_id: { type: "text", nullable: true },
      created_at: {},
    },
    primaryKey: ["id"],
  },
  notification: {
    columns: {
      id: { type: "uuid", nullable: false },
      user_id: { type: "text", nullable: false },
      kind: { type: "text", nullable: false },
      title: { type: "text", nullable: false },
      body: { type: "text", nullable: false },
      link: { type: "text", nullable: true },
      read_at: { nullable: true },
      created_at: {},
    },
    primaryKey: ["id"],
  },
} satisfies Record<string, DocumentedTable>;

// SAFETY: IDENTITY_TABLES satisfies the named table contract, so every entry has this pair.
const documentedEntries = Object.entries(IDENTITY_TABLES) as Array<
  [string, DocumentedTable]
>;

/**
 * The six Section 1 columns that gain a foreign key to `user.id` in this migration (R-2),
 * nullable, so a row written before a person existed survives.
 */
const PERSON_FOREIGN_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["tenant_settings", "updated_by_user_id"],
  ["tenant_branding", "updated_by_user_id"],
  ["audit_event", "actor_user_id"],
  ["file", "uploaded_by_user_id"],
  ["tenant_api_key", "created_by"],
  ["tenant_integration", "created_by_user_id"],
];

/** The foreign keys the new tables carry to `user`, `group` or `role`. */
const NEW_TABLE_FOREIGN_KEYS: ReadonlyArray<readonly [string, string, string]> =
  [
    ["session", "user_id", "user"],
    ["account", "user_id", "user"],
    ["two_factor", "user_id", "user"],
    ["notification", "user_id", "user"],
    ["group_member", "user_id", "user"],
    ["group_member", "group_id", "group"],
    ["role_assignment", "role_id", "role"],
    ["role_assignment", "created_by_user_id", "user"],
  ];

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** The tables the database holds on the default search path. */
async function publicTables(client: {
  query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
}): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'"
  );

  return result.rows.map((row) => row.table_name);
}

/** One table's columns as the database reports them, keyed by column name. */
async function columnFacts(
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  table: string
): Promise<
  Map<
    string,
    { dataType: string; nullable: boolean; defaultValue: string | null }
  >
> {
  const result = await client.query<{
    column_name: string;
    data_type: string;
    nullable: boolean;
    column_default: string | null;
  }>(
    `select column_name,
            data_type,
            is_nullable = 'YES' as nullable,
            column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table]
  );

  return new Map(
    result.rows.map((row) => [
      row.column_name,
      {
        dataType: row.data_type,
        nullable: row.nullable,
        defaultValue: row.column_default,
      },
    ])
  );
}

/** One table's indexes with the columns each covers, in covered order. */
async function indexFacts(
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  table: string
): Promise<
  Array<{ name: string; unique: boolean; primary: boolean; columns: string[] }>
> {
  const result = await client.query<{
    name: string;
    unique: boolean;
    primary: boolean;
    columns: string[];
  }>(
    `select i.relname as name,
            ix.indisunique as "unique",
            ix.indisprimary as "primary",
            coalesce(
              (select array_agg(a.attname::text order by k.ord)
                 from unnest(ix.indkey) with ordinality as k(attnum, ord)
                 join pg_attribute a
                   on a.attrelid = ix.indrelid and a.attnum = k.attnum),
              '{}'
            ) as columns
       from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
      where ix.indrelid = to_regclass($1)`,
    [`public.${table}`]
  );

  return result.rows;
}

/**
 * One table's foreign keys as `(column, referenced_table)` pairs, the effect a constraint has
 * regardless of how it was written.
 */
async function foreignKeyFacts(
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  table: string
): Promise<Array<{ column: string; referencedTable: string }>> {
  const result = await client.query<{
    column: string;
    referencedTable: string;
  }>(
    `select a.attname as column,
            ref.relname as "referencedTable"
       from pg_constraint c
       join pg_attribute a
         on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       join pg_class ref on ref.oid = c.confrelid
      where c.contype = 'f' and c.conrelid = to_regclass($1)`,
    [`public.${table}`]
  );

  return result.rows;
}

/** The columns two indexes must cover, joined for a comparison against `indexFacts`. */
const covered = (index: { columns: string[] }): string =>
  index.columns.join(",");

describe("the Section 2 identity tables", () => {
  it("creates the ten identity, group, role and notification tables with exactly the documented columns", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const present = await publicTables(client);
    const problems: string[] = [];

    const actualByTable = new Map(
      await Promise.all(
        documentedEntries.map(
          async ([table]): Promise<
            [string, Awaited<ReturnType<typeof columnFacts>>]
          > => [table, await columnFacts(client, table)]
        )
      )
    );

    for (const [table, documented] of documentedEntries) {
      if (!present.includes(table)) {
        problems.push(`${table}: the table does not exist`);

        continue;
      }

      const actual = actualByTable.get(table);

      if (actual === undefined) {
        problems.push(
          `${table}: the column catalogue query returned no result`
        );

        continue;
      }

      for (const column of Object.keys(documented.columns)) {
        if (!actual.has(column)) {
          problems.push(`${table}.${column}: the column is missing`);
        }
      }

      for (const column of actual.keys()) {
        if (!(column in documented.columns)) {
          problems.push(`${table}.${column}: no such column in data-shape.md`);
        }
      }

      for (const [column, expected] of Object.entries(documented.columns)) {
        const fact = actual.get(column);

        if (fact === undefined) continue;

        if (expected.type !== undefined && fact.dataType !== expected.type) {
          problems.push(
            `${table}.${column}: type ${fact.dataType}, data-shape.md says ${expected.type}`
          );
        }

        if (
          expected.nullable !== undefined &&
          fact.nullable !== expected.nullable
        ) {
          problems.push(
            `${table}.${column}: is ${fact.nullable ? "nullable" : "not null"}, data-shape.md says the opposite`
          );
        }

        if (
          expected.default !== undefined &&
          fact.defaultValue !== expected.default
        ) {
          problems.push(
            `${table}.${column}: default ${String(fact.defaultValue)}, data-shape.md says ${expected.default}`
          );
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("gives every new table its documented primary key", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const problems: string[] = [];

    const indexesByTable = new Map(
      await Promise.all(
        documentedEntries.map(
          async ([table]): Promise<
            [string, Awaited<ReturnType<typeof indexFacts>>]
          > => [table, await indexFacts(client, table)]
        )
      )
    );

    for (const [table, documented] of documentedEntries) {
      if (documented.primaryKey === undefined) continue;

      const primary = indexesByTable.get(table)?.find((index) => index.primary);

      if (primary === undefined) {
        problems.push(`${table}: the documented primary key is missing`);

        continue;
      }

      if (covered(primary) !== documented.primaryKey.join(",")) {
        problems.push(
          `${table}: primary key covers (${covered(primary)}), data-shape.md says (${documented.primaryKey.join(",")})`
        );
      }
    }

    expect(problems).toEqual([]);
  });

  it("adds the foreign keys to the six Section 1 person columns (R-2)", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const problems: string[] = [];

    const checks = await Promise.all(
      PERSON_FOREIGN_KEYS.map(async ([table, column]) => ({
        table,
        column,
        facts: await foreignKeyFacts(client, table),
      }))
    );

    for (const { table, column, facts } of checks) {
      if (
        !facts.some(
          (fk) => fk.column === column && fk.referencedTable === "user"
        )
      ) {
        problems.push(`${table}.${column}: no foreign key to user.id`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("wires the new tables' foreign keys to user, group and role", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const problems: string[] = [];

    const checks = await Promise.all(
      NEW_TABLE_FOREIGN_KEYS.map(async ([table, column, referencedTable]) => ({
        table,
        column,
        referencedTable,
        facts: await foreignKeyFacts(client, table),
      }))
    );

    for (const { table, column, referencedTable, facts } of checks) {
      if (
        !facts.some(
          (fk) => fk.column === column && fk.referencedTable === referencedTable
        )
      ) {
        problems.push(
          `${table}.${column}: no foreign key to ${referencedTable}.id`
        );
      }
    }

    expect(problems).toEqual([]);
  });

  it("adds realm_mode with the managed default and a nullable keycloak_url_at_setup", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const facts = await columnFacts(client, "tenant_settings");

    expect(facts.get("realm_mode")).toMatchObject({
      dataType: "text",
      nullable: false,
      defaultValue: "'managed'::text",
    });
    expect(facts.get("keycloak_url_at_setup")).toMatchObject({
      dataType: "text",
      nullable: true,
      defaultValue: null,
    });
  });

  it("creates the group partial unique index and the role_assignment keys", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;

    const groupIndexes = await indexFacts(client, "group");

    expect(
      groupIndexes.some(
        (index) => index.unique && covered(index) === "source,external_id"
      )
    ).toBe(true);

    const assignmentIndexes = await indexFacts(client, "role_assignment");

    expect(
      assignmentIndexes.some(
        (index) =>
          index.unique &&
          covered(index) ===
            "role_id,principal_type,principal_id,scope_type,scope_id"
      )
    ).toBe(true);
    expect(
      assignmentIndexes.some(
        (index) =>
          !index.unique && covered(index) === "principal_type,principal_id"
      )
    ).toBe(true);

    const notificationIndexes = await indexFacts(client, "notification");

    expect(
      notificationIndexes.some(
        (index) => covered(index) === "user_id,read_at,created_at"
      )
    ).toBe(true);
  });

  it("applies the migration to a database that holds only the Section 1 history (AC-17)", async () => {
    const postgres = await startDisposablePostgres();

    const context = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger(),
      []
    );

    cleanups.push(async () => {
      await context.db.$client.end();
      await postgres.stop();
    });

    // A database at the Section 1 history only: the one migration that creates the deployment
    // tables, before the identity migration exists.
    const sectionOne = {
      ...CORE_HISTORY,
      migrations: CORE_HISTORY.migrations.slice(0, 1),
    };

    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: [sectionOne],
      compiledModuleIds: [],
    });

    // Section 1 wrote rows with no user id, because no user table existed yet.
    await context.db.$client.query(
      "insert into tenant_settings default values"
    );
    await context.db.$client.query(
      "insert into audit_event (action, summary) values ('ops:test', 'test')"
    );

    // Then the Section 2 migration applies on top of that history.
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });

    const present = await publicTables(context.db.$client);

    for (const table of documentedEntries.map(([name]) => name)) {
      if (!present.includes(table)) {
        throw new Error(`${table}: the Section 2 migration did not create it`);
      }
    }

    const fks = await foreignKeyFacts(context.db.$client, "tenant_settings");

    expect(
      fks.some(
        (fk) =>
          fk.column === "updated_by_user_id" && fk.referencedTable === "user"
      )
    ).toBe(true);

    // The existing Section 1 row gained the new column with the managed default, and survived.
    const settings = await context.db.$client.query<{ realm_mode: string }>(
      "select realm_mode from tenant_settings"
    );

    expect(settings.rows).toEqual([{ realm_mode: "managed" }]);
  });
});
