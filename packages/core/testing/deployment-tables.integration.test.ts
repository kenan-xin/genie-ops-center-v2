import { afterEach, describe, expect, it } from "vitest";

import { startDisposableDeployment } from "./index.ts";

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
      local_accounts_enabled: { default: "false" },
      realm_supports_local_accounts: { default: "false" },
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
      size_bytes: {},
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

/**
 * The columns of R-2, in the order the requirement lists them: every column this migration
 * creates that names a person is nullable and carries no foreign key, because the `user` table
 * is Section 2 and its migration adds the foreign keys.
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

/** The columns of one table that some foreign key constraint covers. */
async function foreignKeyColumns(
  client: {
    query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  table: string
): Promise<string[]> {
  const result = await client.query<{ attname: string }>(
    `select distinct a.attname
       from pg_constraint c
       join pg_attribute a
         on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.conrelid = to_regclass($1)`,
    [`public.${table}`]
  );

  return result.rows.map((row) => row.attname);
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

/** The columns two indexes must cover, joined for a comparison against `indexFacts`. */
const covered = (index: { columns: string[] }): string =>
  index.columns.join(",");

describe("the Section 1 deployment tables", () => {
  it("creates the eleven deployment tables with exactly the documented columns", async () => {
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

    // data-shape.md, "Audit": an index on (target_type, target_id) and one on occurred_at.
    const auditIndexes = indexesByTable.get("audit_event") ?? [];

    if (
      !auditIndexes.some((index) => covered(index) === "target_type,target_id")
    ) {
      problems.push("audit_event: no index on (target_type, target_id)");
    }

    if (!auditIndexes.some((index) => covered(index) === "occurred_at")) {
      problems.push("audit_event: no index on (occurred_at)");
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

    expect(problems).toEqual([]);
  });

  it("does not create the Section 3 tables category and user_preference", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const present = await publicTables(deployment.context.db.$client);

    expect(present).not.toContain("category");
    expect(present).not.toContain("user_preference");
  });

  it("leaves every person-naming column and tenant_module.category_id nullable with no foreign key", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const client = deployment.context.db.$client;
    const present = await publicTables(client);
    const problems: string[] = [];

    const watched: ReadonlyArray<readonly [string, string]> = [
      ...PERSON_COLUMNS,
      ["tenant_module", "category_id"],
    ];

    const factsByTable = new Map(
      await Promise.all(
        [...new Set(watched.map(([table]) => table))].map(
          async (
            table
          ): Promise<
            [
              string,
              {
                columns: Awaited<ReturnType<typeof columnFacts>>;
                foreignKeys: Awaited<ReturnType<typeof foreignKeyColumns>>;
              },
            ]
          > => [
            table,
            {
              columns: await columnFacts(client, table),
              foreignKeys: await foreignKeyColumns(client, table),
            },
          ]
        )
      )
    );

    for (const [table, column] of watched) {
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

      if (tableFacts?.foreignKeys.includes(column)) {
        problems.push(
          `${table}.${column}: carries a foreign key, and none may exist yet`
        );
      }
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
});
