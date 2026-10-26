import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { callProcedure, createRequestPrincipal } from "../src/index.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { moduleLedgerTable } from "../src/lib/module-contract/ledger.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import type { AuditMetadataValue } from "../src/services/audit/index.ts";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
} from "../src/services/categories/index.ts";
import { createCategoriesRouter } from "../src/services/categories/router.ts";
import { insertUser, startDisposableDeployment } from "./index.ts";

/**
 * The Categories page service of Spec 3 (R-87 to R-90a) against a real Postgres: each change writes
 * its one `core:` audit row in its own transaction, counts read `tenant_module.category_id` of the
 * compiled placeable modules only, and a delete touches no module table.
 */
function fixtureCopy(id: string, overrides: Partial<Module> = {}): Module {
  return {
    ...validModule,
    identity: { ...validModule.identity, id, displayName: `Module ${id}` },
    schema: { ...validModule.schema, migrationsTable: moduleLedgerTable(id) },
    ...overrides,
  };
}

/** Compiled, but declares only an admin entry, so it has no place in a category (Decision 6). */
const headless = fixtureCopy("headless", {
  navigation: {
    pinned: [],
    entries: validModule.navigation.entries.filter(
      (entry) => entry.surface === "admin"
    ),
  },
});

const compiled = [
  validModule,
  fixtureCopy("second"),
  fixtureCopy("dangling"),
  headless,
];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let actorUserId: string;

async function query<Row extends QueryResultRow = Record<string, string>>(
  text: string,
  values: unknown[] = []
) {
  return (await deployment.context.db.$client.query<Row>(text, values)).rows;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment(compiled);

  // Registration belongs to the seed step; "excluded" is a module this image no longer carries.
  await query(
    "insert into tenant_module (module_id) select unnest($1::text[])",
    [["fixture", "second", "dangling", "headless", "excluded"]]
  );

  actorUserId = await insertUser(deployment.context, { name: "Admin" });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

let since: Date;

/** audit_event is append-only, so a case reads only the rows written after this mark. */
async function markAudit(): Promise<void> {
  const [row] = await query<{ now: Date }>("select clock_timestamp() as now");

  if (row === undefined) throw new Error("the clock read returned no row");

  since = row.now;
}

beforeEach(async () => {
  await query("update tenant_module set category_id = null");
  await query("delete from category");
  await markAudit();
});

type AuditRow = {
  readonly actor_user_id: string | null;
  readonly action: string;
  readonly target_type: string | null;
  readonly target_id: string | null;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
};

async function auditRows(): Promise<AuditRow[]> {
  return query<AuditRow>(
    `select actor_user_id, action, target_type, target_id, metadata
       from audit_event where occurred_at >= $1 order by occurred_at, id`,
    [since]
  );
}

async function categoryNames(): Promise<string[]> {
  return (await query("select name from category order by position, name")).map(
    (row) => String(row.name)
  );
}

/** Each category's order and last change, so a test can see that a call wrote nothing. */
const stamps = () =>
  query("select id, position, updated_at from category order by position");

/** Every public table's exact row count, so a test can see that a write touched nothing else. */
async function rowCounts(): Promise<Record<string, number | undefined>> {
  const tables = await query<{ name: string }>(
    "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
  );

  const counts = await Promise.all(
    tables.map(async ({ name }) => {
      const [row] = await query<{ n: number }>(
        `select count(*)::int as n from "${name}"`
      );

      return [name, row?.n] as const;
    })
  );

  return Object.fromEntries(counts);
}

const create = (name: string) =>
  createCategory(deployment.context, { actorUserId, name });

describe("the categories page service against a real database", () => {
  it("create, rename, reorder and delete each write exactly one audit row with its R-90a action", async () => {
    const financeId = await create("  Finance  ");
    const opsId = await create("Operations");

    expect(await categoryNames()).toEqual(["Finance", "Operations"]);

    await renameCategory(deployment.context, {
      actorUserId,
      categoryId: financeId,
      name: "Money",
    });
    // The same name again is not a change: no update, no audit row.
    await renameCategory(deployment.context, {
      actorUserId,
      categoryId: financeId,
      name: " Money ",
    });
    await reorderCategories(deployment.context, {
      actorUserId,
      orderedIds: [opsId, financeId],
    });

    expect(await categoryNames()).toEqual(["Operations", "Money"]);

    await deleteCategory(deployment.context, compiled, {
      actorUserId,
      categoryId: opsId,
    });

    expect(await categoryNames()).toEqual(["Money"]);
    expect(await auditRows()).toEqual([
      {
        actor_user_id: actorUserId,
        action: "core:category_created",
        target_type: "category",
        target_id: financeId,
        metadata: { name: "Finance" },
      },
      {
        actor_user_id: actorUserId,
        action: "core:category_created",
        target_type: "category",
        target_id: opsId,
        metadata: { name: "Operations" },
      },
      {
        actor_user_id: actorUserId,
        action: "core:category_renamed",
        target_type: "category",
        target_id: financeId,
        metadata: { from: "Finance", to: "Money" },
      },
      {
        actor_user_id: actorUserId,
        action: "core:category_reordered",
        target_type: "category",
        target_id: null,
        metadata: { orderedIds: [opsId, financeId] },
      },
      {
        actor_user_id: actorUserId,
        action: "core:category_deleted",
        target_type: "category",
        target_id: opsId,
        metadata: { name: "Operations", moduleCount: 0 },
      },
    ]);
  });

  it("counts come from tenant_module.category_id of compiled placeable modules, and the ungrouped count includes a dangling id", async () => {
    const financeId = await create("Finance");
    const emptyId = await create("Empty");

    // headless is not placeable and excluded is not compiled, so neither counts anywhere.
    await query(
      "update tenant_module set category_id = $1 where module_id in ('fixture', 'headless', 'excluded')",
      [financeId]
    );
    await query(
      "update tenant_module set category_id = null where module_id = 'second'"
    );
    // R-91: a row whose category is gone. The foreign key normally nulls it, so it is bypassed here.
    await query(
      "set session_replication_role = replica; update tenant_module set category_id = gen_random_uuid() where module_id = 'dangling'; set session_replication_role = origin"
    );

    expect(await listCategories(deployment.context, compiled)).toEqual({
      categories: [
        { id: financeId, name: "Finance", position: 0, moduleCount: 1 },
        { id: emptyId, name: "Empty", position: 1, moduleCount: 0 },
      ],
      ungroupedCount: 2,
    });
  });

  it("delete leaves members ungrouped and changes no row outside category and tenant_module", async () => {
    const financeId = await create("Finance");

    await query(
      "update tenant_module set category_id = $1 where module_id in ('fixture', 'second', 'headless')",
      [financeId]
    );

    const before = await rowCounts();

    await markAudit();
    await deleteCategory(deployment.context, compiled, {
      actorUserId,
      categoryId: financeId,
    });

    const after = await rowCounts();

    expect(after).toEqual({
      ...before,
      category: Number(before.category) - 1,
      audit_event: Number(before.audit_event) + 1,
    });
    expect(
      await query(
        "select module_id from tenant_module where category_id is not null"
      )
    ).toEqual([]);
    expect((await auditRows()).map((row) => row.metadata)).toEqual([
      { name: "Finance", moduleCount: 2 },
    ]);
  });

  it("the router trims a name before its length bound, so it and the service keep one rule", async () => {
    const client = callProcedure(createCategoriesRouter(compiled), {
      tenant: deployment.context,
      caller: createRequestPrincipal(
        { userId: actorUserId, groups: [], authenticated: true },
        () =>
          Promise.resolve({
            keys: new Set(["core:settings:manage"]),
            scopes: new Map(),
          })
      ),
      requestId: "req-categories-trim",
    });

    await client.create({ name: `  ${"x".repeat(80)}  ` });
    await expect(
      client.create({ name: ` ${"y".repeat(81)} ` })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await categoryNames()).toEqual(["x".repeat(80)]);
  });

  it("a duplicate or blank name refuses and writes no row", async () => {
    await create("Finance");
    const opsId = await create("Operations");

    await markAudit();

    await expect(create(" Finance ")).rejects.toMatchObject({
      code: "category-name-taken",
    });
    await expect(create("   ")).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(create("x".repeat(81))).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(
      renameCategory(deployment.context, {
        actorUserId,
        categoryId: opsId,
        name: "Finance",
      })
    ).rejects.toMatchObject({ code: "category-name-taken" });
    await expect(
      renameCategory(deployment.context, {
        actorUserId,
        categoryId: opsId,
        name: "",
      })
    ).rejects.toMatchObject({ code: "invalid-input" });

    // A lost race: another session's uncommitted row passes the pre-check, then the unique index
    // refuses the insert once that session commits. The refusal carries the same code.
    const other = await deployment.context.db.$client.connect();

    try {
      await other.query("begin");
      await other.query(
        "insert into category (name, position) values ('Racing', 9)"
      );

      const raced = create("Racing");

      // Commit only once the service's insert is waiting on the unique index.
      await expect
        .poll(async () => {
          const [row] = await query<{ waiting: number }>(
            "select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and query ilike 'insert into \"category\"%'"
          );

          return row?.waiting;
        })
        .toBe(1);
      await other.query("commit");

      await expect(raced).rejects.toMatchObject({
        code: "category-name-taken",
      });
    } finally {
      other.release();
    }

    expect(await categoryNames()).toEqual(["Finance", "Operations", "Racing"]);
    expect(await auditRows()).toEqual([]);
  });

  it("reorder refuses a list that misses or adds an id as changed, and a repeated id as invalid", async () => {
    const a = await create("A");
    const b = await create("B");
    const unknown = "00000000-0000-4000-8000-000000000000";

    await markAudit();

    await Promise.all(
      [[b], [b, a, unknown]].map((orderedIds) =>
        expect(
          reorderCategories(deployment.context, { actorUserId, orderedIds })
        ).rejects.toMatchObject({ code: "categories-changed" })
      )
    );
    await expect(
      reorderCategories(deployment.context, { actorUserId, orderedIds: [b, b] })
    ).rejects.toMatchObject({ code: "invalid-input" });

    await expect(
      renameCategory(deployment.context, {
        actorUserId,
        categoryId: unknown,
        name: "C",
      })
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      deleteCategory(deployment.context, compiled, {
        actorUserId,
        categoryId: unknown,
      })
    ).rejects.toMatchObject({ code: "not-found" });

    expect(await categoryNames()).toEqual(["A", "B"]);
    expect(await auditRows()).toEqual([]);
  });

  it("a reorder in the current order writes nothing and adds no audit row", async () => {
    const a = await create("A");
    const b = await create("B");

    const before = await stamps();

    await markAudit();
    await reorderCategories(deployment.context, {
      actorUserId,
      orderedIds: [a, b],
    });

    expect(await stamps()).toEqual(before);
    expect(await auditRows()).toEqual([]);
  });

  // admin L-2: a page that read the list before another administrator added a category.
  it("a reorder after a concurrent create answers categories-changed and changes nothing", async () => {
    const a = await create("A");
    const b = await create("B");

    await create("C");
    await markAudit();

    await expect(
      reorderCategories(deployment.context, { actorUserId, orderedIds: [b, a] })
    ).rejects.toMatchObject({
      code: "categories-changed",
      message: "The categories changed. The list was reloaded; try again.",
    });

    expect(await categoryNames()).toEqual(["A", "B", "C"]);
    expect(await auditRows()).toEqual([]);
  });
});
