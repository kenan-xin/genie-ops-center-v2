import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAuditRouter,
  principalFor,
  readAuditPage,
  type AuditEventFilters,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import { auditEvent } from "../src/schema.ts";
import { insertPersonWith, startDisposableDeployment } from "./index.ts";

/**
 * The audit reader against a real Postgres, with the real core history applied. No part of the
 * database is mocked (R-38): every principal reads real `role_assignment` rows through the real
 * loader, and every target link is resolved through a real record-type resolver.
 *
 * The record type is a local fixture, because core imports no module (R-39). Its resolver answers a
 * label and a path for every id but `gone-*`, which stands for a target removed since its event was
 * written (R-69).
 */
const recordModule: Pick<Module, "identity" | "permissions" | "recordTypes"> = {
  identity: { id: "fixture", displayName: "Fixture", version: "0.0.0" },
  permissions: [
    { key: "fixture:use", label: "Use the fixture" },
    { key: "fixture:read", label: "Read the fixture" },
  ],
  recordTypes: [
    {
      type: "fixture-record",
      resolve: async (_ctx, id: string) =>
        id.startsWith("gone-")
          ? undefined
          : { label: `Record ${id}`, path: `/fixture/${id}` },
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

function request(userId: string | undefined) {
  return principalFor({ tenant: deployment.context, modules, userId });
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

    await expect(
      readAuditPage({
        tenant: deployment.context,
        caller,
        modules,
        filters: filters(),
        cursor: null,
        limit: 50,
      })
    ).rejects.toMatchObject({ code: "forbidden" });

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

  it("answers a caller holding the key", async () => {
    const id = await insertEvent({
      action: "core:person_added",
      summary: "A readable row",
    });

    const page = await readAuditPage({
      tenant: deployment.context,
      caller: request(await insertAuditReader()),
      modules,
      filters: filters(),
      cursor: null,
      limit: 50,
    });

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

    const first = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ query: "same instant" }),
      cursor: null,
      limit: 2,
    });

    // Newest first, and the id breaks the tie downward, so the two greatest ids come first.
    expect(first.events.map((event) => event.id)).toEqual([ids[2], ids[1]]);
    expect(first.total).toBe(3);
    expect(first.nextCursor).toEqual({ occurredAt: instant, id: ids[1] });

    const second = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ query: "same instant" }),
      cursor: first.nextCursor,
      limit: 2,
    });

    expect(second.events.map((event) => event.id)).toEqual([ids[0]]);
    expect(second.nextCursor).toBeNull();

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

    const byAction = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ action: "core:group_label_changed" }),
      cursor: null,
      limit: 50,
    });

    expect(byAction.events.map((event) => event.action)).toEqual([
      "core:group_label_changed",
    ]);

    const byActor = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ actorId: userId }),
      cursor: null,
      limit: 50,
    });

    expect(byActor.events.every((event) => event.actor?.id === userId)).toBe(
      true
    );

    const byTarget = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ targetType: "directory-group" }),
      cursor: null,
      limit: 50,
    });

    expect(
      byTarget.events.every((event) => event.targetType === "directory-group")
    ).toBe(true);

    const bySystem = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ actorId: "system" }),
      cursor: null,
      limit: 50,
    });

    expect(bySystem.events.every((event) => event.actor === null)).toBe(true);

    const inRange = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({
        range: "custom",
        from: "2026-02-03",
        to: "2026-02-03",
      }),
      cursor: null,
      limit: 50,
    });

    expect(
      inRange.events.some(
        (event) => event.action === "core:group_label_changed"
      )
    ).toBe(true);
  });

  it("searches the summary and the target under free text", async () => {
    await insertEvent({
      action: "core:person_added",
      targetType: "person",
      targetId: "needauniquesearch",
      summary: "A person",
    });

    const caller = request(await insertAuditReader());

    const bySummary = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ query: "A person" }),
      cursor: null,
      limit: 50,
    });

    expect(bySummary.events.length).toBeGreaterThan(0);

    const byTarget = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ query: "needauniquesearch" }),
      cursor: null,
      limit: 50,
    });

    expect(byTarget.events.map((event) => event.targetId)).toContain(
      "needauniquesearch"
    );
  });

  it("selects operator rows by a null actor and an ops: action only", async () => {
    // An operator row: null actor and an `ops:` action.
    await insertEvent({ action: "ops:migrate", summary: "ops:migrate" });
    // A system row with a null actor but not an `ops:` action: the operator filter excludes it.
    await insertEvent({
      action: "core:permission_transformation",
      summary: "A transformation",
    });

    const caller = request(await insertAuditReader());

    const page = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters({ operatorOnly: true }),
      cursor: null,
      limit: 50,
    });

    expect(page.events.length).toBeGreaterThan(0);
    expect(page.events.every((event) => event.actor === null)).toBe(true);
    expect(page.events.every((event) => event.action.startsWith("ops:"))).toBe(
      true
    );
  });

  it("links a target only when the resolver returns a path the viewer may open", async () => {
    const recordId = "record-open";
    const closedId = "record-closed";
    const goneId = "gone-removed";

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: recordId,
      summary: "Openable target",
    });

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: closedId,
      summary: "Existing target without a path",
    });

    await insertEvent({
      action: "core:person_added",
      targetType: "fixture-record",
      targetId: goneId,
      summary: "Removed target",
    });

    // The reader holds core:audit:read and a record-scoped fixture:use grant, so one target
    // resolves to a path and the rest do not.
    const { userId } = await insertPersonWith(
      deployment.context,
      ["core:audit:read", "fixture:use"],
      { type: "fixture-record", id: recordId }
    );

    const opened = await readAuditPage({
      tenant: deployment.context,
      caller: request(userId),
      modules,
      filters: filters({ query: "target" }),
      cursor: null,
      limit: 50,
    });

    const rows = opened.events.filter(
      (event) => event.targetType === "fixture-record"
    );

    const openable = rows.find((event) => event.targetId === recordId);
    const closed = rows.find((event) => event.targetId === closedId);
    const gone = rows.find((event) => event.targetId === goneId);

    expect(openable?.targetExists).toBe(true);
    expect(openable?.targetPath).toBe(`/fixture/${recordId}`);

    expect(closed?.targetExists).toBe(true);
    expect(closed?.targetPath).toBeNull();

    expect(gone?.targetExists).toBe(false);
    expect(gone?.targetPath).toBeNull();
  });

  it("offers the fixed catalogue and the tenant's own actors and target types as filter options", async () => {
    const caller = request(await insertAuditReader());

    const page = await readAuditPage({
      tenant: deployment.context,
      caller,
      modules,
      filters: filters(),
      cursor: null,
      limit: 50,
    });

    expect(page.filterOptions.actions).toContain("auth:sign_in");
    expect(page.filterOptions.actions).toContain("core:person_added");
    expect(page.filterOptions.actions).toContain(
      "core:permission_transformation"
    );
  });
});
