import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAuditRouter,
  principalFor,
  readAuditPage,
  type AuditEventCursor,
  type AuditEventFilters,
  type RequestPrincipal,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { auditEvent } from "../src/schema.ts";
import { insertPersonWith, startDisposableDeployment } from "./index.ts";

/**
 * The audit reader against a real Postgres, with the real core history applied. No part of the
 * database is mocked (R-38): every principal reads real `role_assignment` rows through the real
 * loader, and every target link is resolved through a real record-type resolver.
 *
 * The record types are local fixtures, because core imports no module (R-39). Their resolver
 * answers a label and a path for every id but `gone-*` (a target removed since), returns no path
 * for `nopath-*` (an existing target with nothing to open), and counts its calls so the suite can
 * prove the record resolver runs at most once per target.
 */
const FOLDER_ID = "folder-1";

let resolverCalls = 0;

const recordModule: Pick<Module, "identity" | "permissions" | "recordTypes"> = {
  identity: { id: "fixture", displayName: "Fixture", version: "0.0.0" },
  permissions: [
    { key: "fixture:use", label: "Use the fixture" },
    { key: "fixture:read", label: "Read the fixture" },
    { key: "fixture:admin", label: "Administer the fixture" },
  ],
  recordTypes: [
    {
      type: "fixture-record",
      parentTypes: ["fixture-folder"],
      resolve: async (_ctx, id: string) => {
        resolverCalls += 1;

        if (id.startsWith("gone-")) return undefined;

        const parents = [{ type: "fixture-folder", id: FOLDER_ID }];

        if (id.startsWith("nopath-")) {
          return { label: `Record ${id}`, parents };
        }

        return { label: `Record ${id}`, path: `/fixture/${id}`, parents };
      },
    },
    {
      type: "fixture-admin-record",
      resolve: async (_ctx, id: string) => ({
        label: `Admin ${id}`,
        path: `/admin/fixture/${id}`,
        permission: "fixture:admin",
      }),
    },
  ],
};

const modules = [recordModule];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

const FILTERS: AuditEventFilters = {
  query: "",
  actorId: "all",
  action: "all",
  targetType: "all",
  range: "custom",
  from: null,
  to: null,
  operatorOnly: false,
};

function filters(patch: Partial<AuditEventFilters> = {}): AuditEventFilters {
  return { ...FILTERS, ...patch };
}

function request(userId: string | undefined): RequestPrincipal {
  return principalFor({
    tenant: deployment.context,
    modules,
    userId,
    authenticated: userId !== undefined,
  });
}

function read(options: {
  readonly caller: RequestPrincipal;
  readonly filters?: AuditEventFilters;
  readonly cursor?: AuditEventCursor | null;
  readonly limit?: number;
  readonly includeFacets?: boolean;
}) {
  return readAuditPage({
    tenant: deployment.context,
    caller: options.caller,
    modules,
    filters: options.filters ?? filters(),
    cursor: options.cursor ?? null,
    limit: options.limit ?? 50,
    includeFacets: options.includeFacets ?? true,
  });
}

/** One row written for a test, with the actor and instant the case needs. */
async function insertEvent(
  values: Partial<typeof auditEvent.$inferInsert> & {
    readonly action: string;
    readonly summary: string;
  }
): Promise<string> {
  const [row] = await deployment.context.db
    .insert(auditEvent)
    .values(values)
    .returning({ id: auditEvent.id });

  if (row === undefined) throw new Error("the audit insert returned no row");

  return row.id;
}

async function insertAuditReader(): Promise<string> {
  const { userId } = await insertPersonWith(deployment.context, [
    "core:audit:read",
  ]);

  return userId;
}

describe("the audit reader against a real database", () => {
  it("refuses a caller without core:audit:read and reads nothing", async () => {
    await insertEvent({ action: "core:person_added", summary: "A person" });

    // A real person holding another key of the fixture, which does not open the reader.
    const { userId } = await insertPersonWith(deployment.context, [
      "fixture:use",
    ]);

    const caller = request(userId);

    await expect(read({ caller })).rejects.toMatchObject({ code: "forbidden" });

    // The router, the transport the app mounts, refuses the same way: tRPC wraps the catalogue
    // `forbidden` error, which the app's formatter maps to a 403 with a FORBIDDEN body code.
    const router = createAuditRouter(modules).createCaller({
      tenant: deployment.context,
      caller,
    });

    await expect(router.list({})).rejects.toMatchObject({
      cause: { code: "forbidden" },
    });
  });

  it("refuses an anonymous caller", async () => {
    // The reader itself still refuses through `can()` (unchanged), while the router refuses the
    // anonymous caller as unauthenticated before its resolver runs (Spec 2 R-14).
    await expect(read({ caller: request(undefined) })).rejects.toMatchObject({
      code: "forbidden",
    });

    const router = createAuditRouter(modules).createCaller({
      tenant: deployment.context,
      caller: request(undefined),
    });

    await expect(router.list({})).rejects.toMatchObject({
      cause: { code: "unauthenticated" },
    });
  });

  it("answers a caller holding the key", async () => {
    const id = await insertEvent({
      action: "core:person_added",
      summary: "A readable row",
    });

    const page = await read({ caller: request(await insertAuditReader()) });

    expect(page.events.some((event) => event.id === id)).toBe(true);
  });

  it("pages newest first across equal timestamps with no gap and no repeat", async () => {
    const instant = "2026-01-02T03:04:05.000Z";

    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];

    for (const id of ids) {
      // oxlint-disable-next-line no-await-in-loop -- the ids must land in this order.
      await insertEvent({
        id,
        occurredAt: new Date(instant),
        action: "core:person_added",
        summary: `same instant ${id}`,
      });
    }

    const caller = request(await insertAuditReader());

    const first = await read({
      caller,
      filters: filters({ query: "same instant" }),
      limit: 2,
    });

    // Newest first, and the id breaks the tie downward, so the two greatest ids come first.
    expect(first.events.map((event) => event.id)).toEqual([ids[2], ids[1]]);
    expect(first.total).toBe(3);
    expect(first.nextCursor).toEqual({ occurredAt: instant, id: ids[1] });

    const second = await read({
      caller,
      filters: filters({ query: "same instant" }),
      cursor: first.nextCursor,
      limit: 2,
      includeFacets: false,
    });

    expect(second.events.map((event) => event.id)).toEqual([ids[0]]);
    expect(second.nextCursor).toBeNull();
    // Off the first page, the total and option lists are not computed.
    expect(second.total).toBeNull();
    expect(second.filterOptions).toBeNull();

    const seen = [...first.events, ...second.events].map((event) => event.id);

    expect(new Set(seen).size).toBe(3);
  });

  it("filters on the action, the actor, the target type, and the date range", async () => {
    const { userId } = await insertPersonWith(deployment.context, [
      "core:audit:read",
    ]);

    await insertEvent({
      actorUserId: userId,
      action: "core:group_label_changed",
      targetType: "group",
      targetId: "g1",
      summary: "Renamed a group",
      occurredAt: new Date("2026-02-03T00:00:00.000Z"),
    });

    await insertEvent({
      action: "core:directory_group_added",
      targetType: "directory-group",
      targetId: "d1",
      summary: "Added a directory group",
      occurredAt: new Date("2026-02-03T00:00:00.000Z"),
    });

    const caller = request(userId);

    const byAction = await read({
      caller,
      filters: filters({ action: "core:group_label_changed" }),
    });

    expect(byAction.events.map((event) => event.action)).toEqual([
      "core:group_label_changed",
    ]);

    const byActor = await read({
      caller,
      filters: filters({ actorId: userId }),
    });

    expect(byActor.events.every((event) => event.actor?.id === userId)).toBe(
      true
    );

    const byTarget = await read({
      caller,
      filters: filters({ targetType: "directory-group" }),
    });

    expect(
      byTarget.events.every((event) => event.targetType === "directory-group")
    ).toBe(true);

    const bySystem = await read({
      caller,
      filters: filters({ actorId: "system" }),
    });

    expect(bySystem.events.every((event) => event.actor === null)).toBe(true);

    const inRange = await read({
      caller,
      filters: filters({
        range: "custom",
        from: "2026-02-03",
        to: "2026-02-03",
      }),
    });

    expect(
      inRange.events.some(
        (event) => event.action === "core:group_label_changed"
      )
    ).toBe(true);
  });

  it("searches stored columns only: summary, target type and target id", async () => {
    await insertEvent({
      action: "core:person_added",
      targetType: "person",
      targetId: "needle-summary",
      summary: "the stored summary carries the word zebra",
    });

    await insertEvent({
      action: "core:person_added",
      targetType: "widget-target-type",
      targetId: "needle-target",
      summary: "a plain summary",
    });

    const caller = request(await insertAuditReader());

    const bySummary = await read({
      caller,
      filters: filters({ query: "zebra" }),
    });

    expect(bySummary.events.map((event) => event.targetId)).toContain(
      "needle-summary"
    );

    const byTargetId = await read({
      caller,
      filters: filters({ query: "needle-target" }),
    });

    expect(byTargetId.events.map((event) => event.targetId)).toContain(
      "needle-target"
    );

    const byTargetType = await read({
      caller,
      filters: filters({ query: "widget-target-type" }),
    });

    expect(
      byTargetType.events.some(
        (event) => event.targetType === "widget-target-type"
      )
    ).toBe(true);
  });

  it("treats LIKE metacharacters as literal text", async () => {
    await insertEvent({
      action: "core:person_added",
      summary: "literal percent 100% here",
    });

    await insertEvent({
      action: "core:person_added",
      summary: "literal underscore a_b here",
    });

    await insertEvent({
      action: "core:person_added",
      summary: "literal backslash a\\b here",
    });

    const caller = request(await insertAuditReader());

    const percent = await read({
      caller,
      filters: filters({ query: "100%" }),
    });

    expect(percent.events.map((event) => event.summary)).toEqual([
      "literal percent 100% here",
    ]);

    const underscore = await read({
      caller,
      filters: filters({ query: "a_b" }),
    });

    expect(underscore.events.map((event) => event.summary)).toEqual([
      "literal underscore a_b here",
    ]);

    const backslash = await read({
      caller,
      filters: filters({ query: "a\\b" }),
    });

    expect(backslash.events.map((event) => event.summary)).toEqual([
      "literal backslash a\\b here",
    ]);

    // A bare `%` matches only the row holding one, not the whole table.
    const bare = await read({ caller, filters: filters({ query: "%" }) });

    expect(bare.events.map((event) => event.summary)).toEqual([
      "literal percent 100% here",
    ]);
  });

  it("selects operator rows by a null actor and an ops: action only", async () => {
    // An operator row: null actor and an `ops:` action.
    await insertEvent({ action: "ops:migrate", summary: "ops:migrate" });
    // A system row with a null actor but not an `ops:` action: the operator filter excludes it.
    await insertEvent({
      action: "core:permission_transformation",
      summary: "A transformation",
    });

    const page = await read({
      caller: request(await insertAuditReader()),
      filters: filters({ operatorOnly: true }),
    });

    expect(page.events.length).toBeGreaterThan(0);
    expect(page.events.every((event) => event.actor === null)).toBe(true);
    expect(page.events.every((event) => event.action.startsWith("ops:"))).toBe(
      true
    );
  });

  it("shows a live target only when the viewer may open the record, else it looks removed", async () => {
    const openId = "record-open";
    const closedId = "nopath-record-closed";
    const deniedId = "record-denied";
    const goneId = "gone-removed";

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: openId,
      summary: "Openable target",
    });

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: closedId,
      summary: "Existing target with no path",
    });

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: deniedId,
      summary: "Denied existing target",
    });

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: goneId,
      summary: "Removed target",
    });

    // The reader holds core:audit:read and a record-scoped fixture:use grant on the one record.
    const allowed = await insertPersonWith(
      deployment.context,
      ["core:audit:read", "fixture:use"],
      { type: "fixture-record", id: openId }
    );

    const opened = await read({
      caller: request(allowed.userId),
      filters: filters({ query: "target" }),
    });

    const rows = opened.events.filter(
      (event) => event.targetType === "fixture-record"
    );

    const openable = rows.find((event) => event.targetId === openId);
    const denied = rows.find((event) => event.targetId === deniedId);
    const gone = rows.find((event) => event.targetId === goneId);

    expect(openable?.targetLabel).toBe(`Record ${openId}`);
    expect(openable?.targetExists).toBe(true);
    expect(openable?.targetPath).toBe(`/fixture/${openId}`);

    // The denied record and the removed one are indistinguishable: no label, no flag, no path.
    expect(denied?.targetLabel).toBe("");
    expect(denied?.targetExists).toBe(false);
    expect(denied?.targetPath).toBeNull();

    expect(gone?.targetLabel).toBe("");
    expect(gone?.targetExists).toBe(false);
    expect(gone?.targetPath).toBeNull();

    // A viewer who may open the label-only record sees its label and the No link state.
    const closed = await insertPersonWith(
      deployment.context,
      ["core:audit:read", "fixture:use"],
      { type: "fixture-record", id: closedId }
    );

    const withClosed = await read({
      caller: request(closed.userId),
      filters: filters({ query: "Existing target with no path" }),
    });

    expect(withClosed.events[0]?.targetLabel).toBe(`Record ${closedId}`);
    expect(withClosed.events[0]?.targetExists).toBe(true);
    expect(withClosed.events[0]?.targetPath).toBeNull();
  });

  it("opens an admin path only for the permission the resolver named", async () => {
    const adminRecordId = "admin-1";

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-admin-record",
      targetId: adminRecordId,
      summary: "Admin path target",
    });

    const admin = await insertPersonWith(
      deployment.context,
      ["core:audit:read", "fixture:admin"],
      { type: "fixture-admin-record", id: adminRecordId }
    );

    const withAdmin = await read({
      caller: request(admin.userId),
      filters: filters({ query: "Admin path target" }),
    });

    expect(withAdmin.events[0]?.targetPath).toBe(
      `/admin/fixture/${adminRecordId}`
    );

    // A member with `fixture:use` but not `fixture:admin` sees the same record as removed.
    const member = await insertPersonWith(
      deployment.context,
      ["core:audit:read", "fixture:use"],
      { type: "fixture-record", id: adminRecordId }
    );

    const withoutAdmin = await read({
      caller: request(member.userId),
      filters: filters({ query: "Admin path target" }),
    });

    expect(withoutAdmin.events[0]?.targetLabel).toBe("");
    expect(withoutAdmin.events[0]?.targetExists).toBe(false);
    expect(withoutAdmin.events[0]?.targetPath).toBeNull();
  });

  it("resolves a target once per request, even when the grant is a declared parent", async () => {
    const friendlyId = "record-parent-scoped";

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: friendlyId,
      summary: "parent scoped target unique",
    });

    // The grant is on the parent folder, so `can()` must resolve the record's parents.
    const parent = await insertPersonWith(
      deployment.context,
      ["core:audit:read", "fixture:use"],
      { type: "fixture-folder", id: FOLDER_ID }
    );

    resolverCalls = 0;

    const page = await read({
      caller: request(parent.userId),
      filters: filters({ query: "parent scoped target unique" }),
    });

    expect(page.events[0]?.targetPath).toBe(`/fixture/${friendlyId}`);
    // The reader's label lookup and `can()`'s parent lookup share one resolution.
    expect(resolverCalls).toBe(1);
  });

  it("offers the fixed catalogue and the tenant's own actors and target types as filter options", async () => {
    const page = await read({ caller: request(await insertAuditReader()) });

    expect(page.filterOptions?.actions).toContain("auth:sign_in");
    expect(page.filterOptions?.actions).toContain("core:person_added");
    expect(page.filterOptions?.actions).toContain(
      "core:permission_transformation"
    );
  });
});
