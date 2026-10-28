import { afterEach, describe, expect, it } from "vitest";

import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  CORE_HISTORY,
  type MigrationHistory,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { startDisposableDeployment, startDisposablePostgres } from "./index.ts";

/**
 * The deployment tables the Section 1 core migration must create (R-1), against a real Postgres
 * that received the real core history. Nothing here is mocked: every fact is read back from the
 * database's own catalogues, the way a reviewer would inspect a deployment with psql.
 *
 * The expected shape below mirrors docs/architecture/data-shape.md ("Deployment tables",
 * "Tenant settings", "Branding", "Files", "Integrations", "Audit" and "Rules"), table by table
 * in the document's order, so the two can be diffed side by side. An aspect is named on a
 * column only where the document states it: `type` where a type is written (or where "Rules"
 * rule 4 fixes the identifier's type), `nullable` where nullability is stated, `default` where
 * a default is stated. A column with no stated aspect is still listed, because the column
 * inventory itself is the contract; what the document does not say, this test does not guess.
 */
type DocumentedColumn = {
  readonly type?: string;
  readonly nullable?: boolean;
  readonly default?: string;
};

type DocumentedTable = {
  readonly columns: Readonly<Record<string, DocumentedColumn>>;
  /** The primary key the document states, in the order it states it. */
  readonly primaryKey?: readonly string[];
};

const DEPLOYMENT_TABLES = {
  tenant_module: {
    columns: {
      module_id: { type: "text", nullable: false },
      enabled: {},
      enabled_at: {},
      category_id: { nullable: true },
      config: { type: "jsonb" },
    },
    primaryKey: ["module_id"],
  },
  tenant_api_key: {
    columns: {
      id: { type: "uuid", nullable: false },
      module_id: {},
      name: {},
      key_hash: {},
      created_by: { nullable: true },
      created_at: {},
      last_used_at: {},
      revoked_at: {},
    },
    primaryKey: ["id"],
  },
  setup_step: {
    columns: {
      step: {},
      state: {},
      detail: {},
      updated_at: {},
    },
    primaryKey: ["step"],
  },
  retirement: {
    columns: {
      retired_at: {},
      deletion_hold: { type: "boolean" },
    },
  },
  rate_limit_window: {
    columns: {
      endpoint: {},
      subject: {},
      window_start: {},
      count: {},
    },
    primaryKey: ["endpoint", "subject", "window_start"],
  },
  tenant_settings: {
    columns: {
      onboarding_mode: { default: "'invite'::text" },
      realm_mode: { default: "'managed'::text" },
      keycloak_url_at_setup: { nullable: true },
      local_accounts_enabled: { default: "false" },
      realm_supports_local_accounts: { default: "false" },
      sso_email_domains: { default: "'{}'::text[]" },
      session_idle_minutes: { default: "15" },
      updated_by_user_id: { nullable: true },
      updated_at: {},
    },
  },
  tenant_branding: {
    columns: {
      company_name: {},
      product_name: {},
      logo_light_file_id: {},
      logo_dark_file_id: {},
      logo_mark_file_id: {},
      favicon_file_id: {},
      primary_color: {},
      primary_foreground: {},
      default_theme: {},
      font_family: {},
      font_size: {},
      text_color: {},
      login_background_file_id: {},
      login_background_color: {},
      login_welcome_text: {},
      login_notice_text: { nullable: true },
      login_notice_requires_acknowledgement: {},
      email_sender_name: {},
      email_reply_to: {},
      email_footer_text: {},
      support_url: {},
      support_email: {},
      terms_url: {},
      privacy_url: {},
      default_locale: {},
      default_time_zone: {},
      date_format: {},
      number_format: {},
      updated_by_user_id: { nullable: true },
      updated_at: {},
    },
  },
  audit_event: {
    columns: {
      id: { type: "uuid", nullable: false },
      occurred_at: {},
      actor_user_id: { nullable: true },
      action: { type: "text" },
      target_type: {},
      target_id: {},
      summary: {},
      metadata: { type: "jsonb" },
    },
    primaryKey: ["id"],
  },
  file: {
    columns: {
      id: { type: "uuid", nullable: false },
      storage_key: {},
      file_name: {},
      mime_type: {},
      size_bytes: { type: "bigint" },
      checksum: {},
      scan_status: {},
      uploaded_by_user_id: { nullable: true },
      created_at: {},
    },
    primaryKey: ["id"],
  },
  file_blob: {
    columns: {
      id: { type: "uuid", nullable: false },
      bytes: { type: "bytea" },
      created_at: {},
    },
    primaryKey: ["id"],
  },
  tenant_integration: {
    columns: {
      id: { type: "uuid", nullable: false },
      module_id: {},
      kind: { type: "text" },
      name: {},
      config: { type: "jsonb" },
      secret_ref: { nullable: true },
      status: {},
      last_checked_at: {},
      last_error: {},
      created_by_user_id: { nullable: true },
      created_at: {},
      updated_at: {},
    },
    primaryKey: ["id"],
  },
} satisfies Record<string, DocumentedTable>;

// SAFETY: DEPLOYMENT_TABLES satisfies the named table contract, so every entry has this pair.
const documentedEntries = Object.entries(DEPLOYMENT_TABLES) as Array<
  [string, DocumentedTable]
>;

/** The Section 3 migration's tables (R-86a), documented in data-shape.md "Navigation" and "Branding". */
const SECTION_3_TABLES: Array<[string, DocumentedTable]> = [
  [
    "category",
    {
      columns: {
        id: { type: "uuid", nullable: false },
        name: { type: "text", nullable: false },
        position: { type: "integer", nullable: false },
        created_at: { type: "timestamp with time zone", nullable: false },
        updated_at: { type: "timestamp with time zone", nullable: false },
      },
    },
  ],
  [
    "user_preference",
    {
      columns: {
        user_id: { type: "text", nullable: false },
        locale: { type: "text", nullable: true },
        time_zone: { type: "text", nullable: true },
        updated_at: { type: "timestamp with time zone", nullable: false },
      },
    },
  ],
];

/**
 * The columns of R-2, in the order the requirement lists them: every Section 1 column that names
 * a person is nullable, because a row written before a person existed survives. The Section 2
 * migration that creates `user` adds each column's foreign key; that key is proved by the
 * identity-tables test, and this test keeps only the nullability invariant.
 */
const PERSON_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["tenant_settings", "updated_by_user_id"],
  ["tenant_branding", "updated_by_user_id"],
  ["audit_event", "actor_user_id"],
  ["file", "uploaded_by_user_id"],
  ["tenant_api_key", "created_by"],
  ["tenant_integration", "created_by_user_id"],
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

/**
 * One table's indexes with the columns each covers, in covered order. A unique constraint and
 * a unique index both report here as `unique`, so the assertion reads the effect and not the
 * mechanism the migration happened to write.
 */
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
 * One column's storage strategy as `pg_attribute` holds it: `p` plain, `m` main, `x` extended,
 * `e` external. R-3 needs `e` on `file_blob.bytes`, so Postgres never compresses bytes that
 * are already compressed and a partial read never decompresses the whole value.
 */
async function attributeStorage(
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  table: string,
  column: string
): Promise<string | undefined> {
  const result = await client.query<{ attstorage: string }>(
    `select attstorage::text as attstorage
       from pg_attribute
      where attrelid = to_regclass($1) and attname = $2 and not attisdropped`,
    [`public.${table}`, column]
  );

  return result.rows[0]?.attstorage;
}

/**
 * One table's index definitions as `pg_indexes` renders them. An expression index covers no
 * named column, so `indexFacts` reports it with no columns; the definition is what names the
 * constant `((true))` that makes a single-row table a singleton.
 */
async function indexDefinitions(
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  table: string
): Promise<string[]> {
  const result = await client.query<{ indexdef: string }>(
    `select indexdef
       from pg_indexes
      where schemaname = 'public' and tablename = $1`,
    [table]
  );

  return result.rows.map((row) => row.indexdef);
}

/** The columns two indexes must cover, joined for a comparison against `indexFacts`. */
const covered = (index: { columns: string[] }): string =>
  index.columns.join(",");

type Client = {
  query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Every way the database's columns differ from the documented tables, as readable lines. */
async function columnProblems(
  client: Client,
  entries: Array<[string, DocumentedTable]>
): Promise<string[]> {
  const present = await publicTables(client);
  const problems: string[] = [];

  const actualByTable = new Map(
    await Promise.all(
      entries.map(
        async ([table]): Promise<
          [string, Awaited<ReturnType<typeof columnFacts>>]
        > => [table, await columnFacts(client, table)]
      )
    )
  );

  for (const [table, documented] of entries) {
    if (!present.includes(table)) {
      problems.push(`${table}: the table does not exist`);

      continue;
    }

    const actual = actualByTable.get(table);

    if (actual === undefined) {
      problems.push(`${table}: the column catalogue query returned no result`);

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

  return problems;
}

describe("the Section 1 deployment tables", () => {
  it("creates the eleven deployment tables with exactly the documented columns", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const problems = await columnProblems(
      deployment.context.db.$client,
      documentedEntries
    );

    expect(problems).toEqual([]);
  });

  it("gives every table its documented primary key and index shape", async () => {
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

    // data-shape.md, "Audit": an index on (target_type, target_id) and the reader's keyset
    // order on (occurred_at, id) descending (R-67).
    const auditIndexes = indexesByTable.get("audit_event") ?? [];

    if (
      !auditIndexes.some((index) => covered(index) === "target_type,target_id")
    ) {
      problems.push("audit_event: no index on (target_type, target_id)");
    }

    if (!auditIndexes.some((index) => covered(index) === "occurred_at,id")) {
      problems.push("audit_event: no index on (occurred_at, id)");
    }

    // data-shape.md, "Files": storage_key is unique, because every adapter derives it from
    // the file id alone.
    const fileIndexes = indexesByTable.get("file") ?? [];

    if (
      !fileIndexes.some(
        (index) => index.unique && covered(index) === "storage_key"
      )
    ) {
      problems.push("file: no unique index on (storage_key)");
    }

    // Keys data-shape.md does not list but the design needs: the inbound endpoint looks a key
    // up by its hash, and each single-row table must refuse a second row.
    const apiKeyIndexes = indexesByTable.get("tenant_api_key") ?? [];

    if (
      !apiKeyIndexes.some(
        (index) => index.unique && covered(index) === "key_hash"
      )
    ) {
      problems.push("tenant_api_key: no unique index on (key_hash)");
    }

    const singletonDefinitions = new Map(
      await Promise.all(
        ["tenant_settings", "tenant_branding", "retirement"].map(
          async (table): Promise<[string, string[]]> => [
            table,
            await indexDefinitions(client, table),
          ]
        )
      )
    );

    for (const table of ["tenant_settings", "tenant_branding", "retirement"]) {
      const definitions = singletonDefinitions.get(table) ?? [];

      if (
        !definitions.some(
          (definition) =>
            /unique/i.test(definition) && definition.includes("((true))")
        )
      ) {
        problems.push(`${table}: no unique singleton index on ((true))`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("keeps every person-naming column and tenant_module.category_id nullable", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const present = await publicTables(client);
    const problems: string[] = [];

    const factsByTable = new Map(
      await Promise.all(
        [
          ...new Set(
            [...PERSON_COLUMNS, ["tenant_module", "category_id"] as const].map(
              ([table]) => table
            )
          ),
        ].map(
          async (
            table
          ): Promise<
            [string, { columns: Awaited<ReturnType<typeof columnFacts>> }]
          > => [table, { columns: await columnFacts(client, table) }]
        )
      )
    );

    for (const [table, column] of PERSON_COLUMNS) {
      if (!present.includes(table)) {
        problems.push(`${table}: the table does not exist`);

        continue;
      }

      const tableFacts = factsByTable.get(table);
      const fact = tableFacts?.columns.get(column);

      if (fact === undefined) {
        problems.push(`${table}.${column}: the column is missing`);

        continue;
      }

      if (!fact.nullable) {
        problems.push(`${table}.${column}: must be nullable`);
      }
    }

    // The six person columns gain their key in Section 2 and are not checked here.
    const categoryFacts = factsByTable.get("tenant_module");

    if (!categoryFacts?.columns.get("category_id")?.nullable) {
      problems.push("tenant_module.category_id: must be nullable");
    }

    expect(problems).toEqual([]);
  });

  it("keeps the file_blob bytes column in external storage", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const present = await publicTables(deployment.context.db.$client);

    expect(present).toContain("file_blob");
    expect(
      await attributeStorage(
        deployment.context.db.$client,
        "file_blob",
        "bytes"
      )
    ).toBe("e");
  });

  it("refuses a second row in each single-row table", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;

    // The three tables are independent, so the attempts run together. The singleton unique
    // index must reject the second row with a unique violation (23505); an accepted row, or any
    // other error, is a problem.
    const inserts: ReadonlyArray<readonly [string, string]> = [
      ["tenant_settings", "insert into tenant_settings default values"],
      [
        "tenant_branding",
        "insert into tenant_branding (company_name, product_name, default_locale, default_time_zone) values ('Company', 'Product', 'en', 'UTC')",
      ],
      ["retirement", "insert into retirement (retired_at) values (now())"],
    ];

    const problems = await Promise.all(
      inserts.map(async ([table, insert]) => {
        await client.query(insert);

        const second = await client.query(insert).then(
          () => undefined,
          (error: { code?: string }) => error
        );

        if (second === undefined) {
          return `${table}: a second row was accepted`;
        }

        return second.code === "23505"
          ? undefined
          : `${table}: the second insert failed with ${String(second.code)}, not a unique violation`;
      })
    );

    expect(problems.filter((problem) => problem !== undefined)).toEqual([]);
  });
});

const ORPHAN_CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function emptyHistory(name: string): MigrationHistory {
  return { name, migrations: [], table: moduleLedgerTable(name) };
}

/** The foreign keys of one table: the covered column, the target table, and the delete action. */
async function foreignKeys(client: Client, table: string) {
  const result = await client.query<{
    column: string;
    target: string;
    onDelete: string;
  }>(
    `select a.attname as "column", c.confrelid::regclass::text as target, c.confdeltype as "onDelete"
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.conrelid = to_regclass($1)`,
    [`public.${table}`]
  );

  return result.rows;
}

describe("the Section 3 navigation tables", () => {
  it("creates category and user_preference with exactly the documented columns", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;

    expect(await columnProblems(client, SECTION_3_TABLES)).toEqual([]);

    const insert =
      "insert into category (name, position) values ('Operations', 1)";

    await client.query(insert);

    await expect(client.query(insert)).rejects.toMatchObject({ code: "23505" });
  });

  it("gives tenant_module.category_id a nullable foreign key to category.id declared on delete set null", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;

    expect(await foreignKeys(client, "tenant_module")).toEqual([
      { column: "category_id", target: "category", onDelete: "n" },
    ]);

    expect(await foreignKeys(client, "user_preference")).toEqual([
      { column: "user_id", target: '"user"', onDelete: "a" },
    ]);
  });

  it("sets the category of every module that named a deleted category to null and touches no other row", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;

    const { rows: categories } = await client.query<{ id: string }>(
      "insert into category (name, position) values ('A', 1), ('B', 2) returning id"
    );

    const [a, b] = [categories[0]?.id, categories[1]?.id];

    await client.query(
      `insert into tenant_module (module_id, enabled, category_id, config) values
         ('m1', true, $1, '{"k":1}'), ('m2', false, $2, '{"k":2}'), ('m3', true, null, '{}')`,
      [a, b]
    );

    const before = await client.query("select * from category where id = $1", [
      b,
    ]);

    await client.query("delete from category where id = $1", [a]);

    const modules = await client.query(
      "select module_id, enabled, category_id, config from tenant_module order by module_id"
    );

    expect(modules.rows).toEqual([
      { module_id: "m1", enabled: true, category_id: null, config: { k: 1 } },
      { module_id: "m2", enabled: false, category_id: b, config: { k: 2 } },
      { module_id: "m3", enabled: true, category_id: null, config: {} },
    ]);
    expect((await client.query("select * from category")).rows).toEqual(
      before.rows
    );
  });

  it("upgrades a database with Section 1 and Section 2 rows and an orphan category id, nulling only that id", async () => {
    const postgres = await startDisposablePostgres();
    const compiledModuleIds = ["alpha", "beta"];

    const context = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger(),
      compiledModuleIds
    );

    cleanups.push(async () => {
      await context.db.$client.end();
      await postgres.stop();
    });

    const client = context.db.$client;
    const moduleHistories = compiledModuleIds.map(emptyHistory);

    await runMigrations({
      env: context.env,
      pool: client,
      histories: [
        { ...CORE_HISTORY, migrations: CORE_HISTORY.migrations.slice(0, 4) },
        ...moduleHistories,
      ],
      compiledModuleIds,
    });

    await client.query(`
      insert into tenant_settings (onboarding_mode) values ('invite');
      insert into tenant_branding (company_name, product_name, default_locale, default_time_zone)
        values ('Co', 'Product', 'en', 'UTC');
      insert into "user" (id, name, email) values ('u1', 'Person', 'u1@example.invalid');
      insert into "group" (name, source) values ('g1', 'local');
      insert into role (name, permissions) values ('r1', array['a:b']);
      insert into role_assignment (role_id, principal_type, principal_id)
        select id, 'user', 'u1' from role where name = 'r1';
    `);
    await client.query(
      `insert into tenant_module (module_id, enabled, category_id) values
         ('alpha', true, $1), ('beta', false, null)`,
      [ORPHAN_CATEGORY_ID]
    );

    const keyed = {
      tenant_settings: "updated_at",
      tenant_branding: "company_name",
      user: "id",
      group: "id",
      role: "id",
      role_assignment: "id",
      tenant_module: "module_id",
    };

    const read = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(keyed).map(async ([table, key]) => [
            table,
            (await client.query(`select * from "${table}" order by "${key}"`))
              .rows,
          ])
        )
      );

    const before = await read();

    await runMigrations({
      env: context.env,
      pool: client,
      histories: [CORE_HISTORY, ...moduleHistories],
      compiledModuleIds,
    });

    const expected = structuredClone(before);

    // SAFETY: the read above holds the alpha row first, ordered by module_id.
    expected.tenant_module[0].category_id = null;
    // The later sso_email_domains migration gives the existing settings row its empty default.
    expected.tenant_settings[0].sso_email_domains = [];

    expect(await read()).toEqual(expected);
    expect(await foreignKeys(client, "tenant_module")).toEqual([
      { column: "category_id", target: "category", onDelete: "n" },
    ]);
  });
});
