import { describe, expect, it } from "vitest";

import type {
  AccessPath,
  AccessRecipient,
  NotInEffect,
} from "../../services/roles/effective-access.ts";
import {
  FIXTURE_RECIPIENTS,
  FIXTURE_ROWS,
  fixtureRow,
} from "./__fixtures__/access.ts";
import { EMPTY_DRAFT } from "./grants-draft-store.ts";
import {
  grantsView,
  linkDraft,
  linkedRecipient,
  removalOf,
  saveInput,
} from "./grants-view.ts";

const jamie: AccessRecipient = { type: "user", id: "p-jamie" };

const ops: AccessRecipient = { type: "group", id: "g-ops" };

const holders = {
  jamie: { type: "user", id: "p-jamie", name: "Jamie Chen" },
  finance: { type: "group", id: "g-finance", name: "Finance team" },
  analysts: { type: "group", id: "g-analysts", name: "Analysts" },
  ops: { type: "group", id: "g-ops", name: "Operations" },
} as const;

describe("linkedRecipient", () => {
  it.each([
    ["g-ops", { type: "group", id: "g-ops" }],
    ["p-jamie", { type: "user", id: "p-jamie" }],
    ["g-former", null],
  ] as const)(
    "linkedRecipient(%s) picks only a listed recipient",
    (id, expected) => {
      expect(linkedRecipient(id, FIXTURE_RECIPIENTS)).toEqual(expected);
    }
  );
});

let next = 0;

/** One path: the role's permissions default to the use key of its module. */
function path(input: {
  readonly holder: AccessPath["holder"];
  readonly roleId: string;
  readonly moduleId?: string | null;
  readonly permissions?: readonly string[];
  readonly record?: boolean;
  readonly notInEffect?: readonly NotInEffect[];
}): AccessPath {
  next += 1;

  const moduleId =
    input.moduleId === undefined
      ? (FIXTURE_ROWS.find((row) =>
          row.roles.some((role) => role.id === input.roleId)
        )?.id ?? null)
      : input.moduleId;

  return {
    assignmentId: `a-${next}`,
    holder: input.holder,
    role: {
      id: input.roleId,
      name: input.roleId,
      kind: "system",
      moduleId,
      permissions: input.permissions ?? [`${moduleId}:use`],
    },
    scope: input.record === true ? { type: "invoice", id: "inv-1" } : null,
    addedBy: null,
    addedAt: "2026-11-01T09:00:00.000000Z",
    notInEffect: input.notInEffect ?? [],
  };
}

const ids = (rows: readonly { readonly row: { readonly id: string } }[]) =>
  rows.map((view) => view.row.id);

const view = (paths: readonly AccessPath[], recipient = jamie) =>
  grantsView({ catalogue: FIXTURE_ROWS, paths, recipient });

describe("grantsView", () => {
  it("V1: grants a row by a direct whole-tenant role only", () => {
    const result = view([
      path({ holder: holders.jamie, roleId: "r-slides-editor" }),
      path({
        holder: holders.jamie,
        roleId: "r-invoices-viewer",
        record: true,
      }),
      path({ holder: holders.finance, roleId: "r-placeholder-user" }),
    ]);

    expect(ids(result.granted)).toEqual(["slides"]);
    expect(ids(result.catalog)).toEqual([
      "analytics",
      "invoices",
      "placeholder",
      "core:ask",
    ]);
  });

  it("V2: shows the first role in choice order and lists every other direct role", () => {
    const finance = path({
      holder: holders.jamie,
      roleId: "r-invoices-finance",
    });

    const viewer = path({ holder: holders.jamie, roleId: "r-invoices-viewer" });

    const record = path({
      holder: holders.jamie,
      roleId: "r-slides-editor",
      record: true,
    });

    const admin = path({
      holder: holders.jamie,
      roleId: "r-tenant-admin",
      moduleId: null,
      permissions: ["core:ask:use", "core:roles:manage"],
    });

    const group = path({ holder: holders.finance, roleId: "r-slides-editor" });

    const result = view([finance, viewer, record, admin, group]);

    expect(result.granted.map((row) => row.shown.assignmentId)).toEqual([
      viewer.assignmentId,
    ]);
    expect(result.notShown.map((shown) => shown.assignmentId)).toEqual([
      finance.assignmentId,
      record.assignmentId,
      admin.assignmentId,
    ]);
  });

  it("V3: names the live whole-tenant groups that also give a person a Catalog row", () => {
    const result = view([
      path({ holder: holders.finance, roleId: "r-invoices-finance" }),
      path({
        holder: holders.analysts,
        roleId: "r-invoices-viewer",
        notInEffect: ["group-archived"],
      }),
      path({ holder: holders.ops, roleId: "r-invoices-viewer", record: true }),
      path({
        holder: holders.ops,
        roleId: "r-custom-core",
        moduleId: null,
        permissions: ["slides:use"],
      }),
    ]);

    const also = Object.fromEntries(
      result.catalog.map((row) => [row.row.id, row.alsoThrough])
    );

    expect(also["invoices"]).toEqual(["Finance team"]);
    expect(also["slides"]).toEqual(["Operations"]);
    expect(also["placeholder"]).toEqual([]);

    const group = view(
      [
        path({
          holder: holders.ops,
          roleId: "r-invoices-viewer",
          record: true,
        }),
      ],
      ops
    );

    expect(group.catalog.every((row) => row.alsoThrough.length === 0)).toBe(
      true
    );
  });
});

describe("removalOf", () => {
  it("V4: takes every direct role of the row and keeps each live path with the use key", () => {
    const viewer = path({ holder: holders.jamie, roleId: "r-invoices-viewer" });

    const record = path({
      holder: holders.jamie,
      roleId: "r-invoices-auditor",
      record: true,
    });

    const group = path({
      holder: holders.finance,
      roleId: "r-invoices-finance",
    });

    const archived = path({
      holder: holders.analysts,
      roleId: "r-invoices-viewer",
      notInEffect: ["group-archived"],
    });

    const coreCustom = path({
      holder: holders.jamie,
      roleId: "r-custom-core",
      moduleId: null,
      permissions: ["invoices:use"],
    });

    const other = path({ holder: holders.jamie, roleId: "r-slides-editor" });

    const removal = removalOf(
      fixtureRow("invoices"),
      [viewer, record, group, archived, coreCustom, other],
      jamie
    );

    expect(removal.rolesThatGo.map((go) => go.assignmentId)).toEqual([
      viewer.assignmentId,
      record.assignmentId,
    ]);
    expect(removal.pathsThatStay.map((stay) => stay.assignmentId)).toEqual([
      group.assignmentId,
      coreCustom.assignmentId,
    ]);
  });
});

describe("saveInput", () => {
  it("V6: sends the shown assignment of a changed row and the staged role of an Add", () => {
    const viewer = path({ holder: holders.jamie, roleId: "r-invoices-viewer" });

    const result = saveInput(view([viewer]), {
      add: { slides: "r-slides-editor" },
      change: {
        invoices: "r-invoices-finance",
        placeholder: "r-placeholder-user",
      },
      remove: ["core:ask"],
    });

    expect(result).toEqual({
      add: [{ row: "slides", roleId: "r-slides-editor" }],
      change: [
        {
          row: "invoices",
          assignmentId: viewer.assignmentId,
          roleId: "r-invoices-finance",
        },
      ],
      remove: [{ row: "core:ask" }],
    });
  });
});

describe("linkDraft", () => {
  const granted = view([
    path({ holder: holders.jamie, roleId: "r-invoices-viewer" }),
  ]);

  it("V7: stages an Add on a Catalog row and a change on a Granted row", () => {
    expect(linkDraft(granted, { role: "r-slides-editor" })).toEqual({
      ...EMPTY_DRAFT,
      add: { slides: "r-slides-editor" },
    });
    expect(linkDraft(granted, { role: "r-invoices-finance" })).toEqual({
      ...EMPTY_DRAFT,
      change: { invoices: "r-invoices-finance" },
    });
    expect(linkDraft(granted, { module: "placeholder" })).toEqual({
      ...EMPTY_DRAFT,
      add: { placeholder: "r-placeholder-user" },
    });
  });

  it("V7: stages nothing for a role of no row, a switched-off row or the shown role", () => {
    expect(linkDraft(granted, { role: "r-tenant-admin" })).toEqual(EMPTY_DRAFT);
    expect(linkDraft(granted, { role: "r-analytics-viewer" })).toEqual(
      EMPTY_DRAFT
    );
    expect(linkDraft(granted, { module: "analytics" })).toEqual(EMPTY_DRAFT);
    expect(linkDraft(granted, { role: "r-invoices-viewer" })).toEqual(
      EMPTY_DRAFT
    );
    expect(linkDraft(granted, { module: "invoices" })).toEqual(EMPTY_DRAFT);
  });
});
