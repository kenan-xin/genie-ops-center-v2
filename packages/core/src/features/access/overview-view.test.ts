import { describe, expect, it } from "vitest";

import type { AccessPath } from "../../services/roles/effective-access.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import {
  FIXTURE_RECIPIENTS,
  FIXTURE_ROWS,
  fixturePath,
} from "./__fixtures__/access.ts";
import {
  overviewRows,
  parseWho,
  reachLine,
  readFilters,
} from "./overview-view.ts";

const jamie = { type: "user", id: "p-jamie", name: "Jamie Chen" } as const;

const finance = {
  type: "group",
  id: "g-finance",
  name: "Finance team",
  source: "local",
} as const;

const ops = {
  type: "group",
  id: "g-ops",
  name: "Operations",
  source: "local",
} as const;

const former = {
  type: "group",
  id: "g-former",
  name: "Former finance",
  source: "local",
} as const;

const path = (
  id: string,
  holder: AccessPath["holder"],
  role: { readonly id: string; readonly name: string },
  moduleId: string
) => fixturePath({ id, holder, role, moduleId });

/** A core role: no `module_id`, and its own permissions. */
const core = (
  id: string,
  holder: AccessPath["holder"],
  role: { readonly id: string; readonly name: string },
  permissions: readonly string[]
): AccessPath => {
  const base = path(id, holder, role, "core");

  return { ...base, role: { ...base.role, moduleId: null, permissions } };
};

const invoicesUser = {
  id: "r-invoices-user",
  name: "Invoices and Payments user",
};

const invoicesFinance = { id: "r-invoices-finance", name: "Finance" };

const askUser = { id: "r-ask-user", name: "Ask user" };

const direct = path("a-direct", jamie, invoicesUser, "invoices");

const viaFinance = path("a-finance", finance, invoicesFinance, "invoices");

const scoped: AccessPath = {
  ...path("a-scoped", ops, invoicesFinance, "invoices"),
  scope: { type: "invoice", id: "INV-2026-0142" },
};

const viaFormer: AccessPath = {
  ...path(
    "a-former",
    former,
    { id: "r-invoices-viewer", name: "Viewer" },
    "invoices"
  ),
  notInEffect: ["group-archived"],
};

const slides = path(
  "a-slides",
  ops,
  { id: "r-slides-editor", name: "Slides editor" },
  "slides"
);

const askDirect = core("a-ask-direct", jamie, askUser, ["core:ask:use"]);

const askOps = core("a-ask-ops", ops, askUser, ["core:ask:use"]);

const admin = core(
  "a-admin",
  finance,
  { id: "r-tenant-admin", name: "Tenant administrator" },
  ["core:ask:use", "core:roles:manage"]
);

const analyticsOff: AccessPath = {
  ...path(
    "a-analytics",
    finance,
    { id: "r-analytics-viewer", name: "Analytics viewer" },
    "analytics"
  ),
  notInEffect: ["module-off"],
};

const all = [
  direct,
  viaFinance,
  scoped,
  viaFormer,
  slides,
  askDirect,
  askOps,
  admin,
];

const at = (id: string, holder: AccessPath["holder"]) =>
  path(id, holder, invoicesUser, "invoices");

const person = { type: "user", id: "p-jamie" } as const;

const MEMBER_COUNTS = Object.fromEntries(
  FIXTURE_RECIPIENTS.flatMap((row) =>
    row.type === "group" ? [[row.id, row.memberCount] as const] : []
  )
);

const also = (shown: AccessPath) =>
  overviewRows({
    subject: person,
    paths: [shown],
    personPaths: all,
    catalogue: FIXTURE_ROWS,
    memberCounts: MEMBER_COUNTS,
    recordLabels: new Map(),
  })[0]?.alsoThrough;

describe("overviewRows", () => {
  it("names a person's other live whole-tenant paths to the module, from every path, not the page", () => {
    expect(also(direct)).toEqual(["Finance team"]);
    expect(also(viaFinance)).toEqual(["Direct"]);
    expect(also(scoped)).toEqual(["Direct", "Finance team"]);
    expect(also(slides)).toEqual([]);
    expect(also(askDirect)).toEqual(["Operations"]);
    expect(also(admin)).toEqual([]);
  });

  it("names a module lookup's holders by kind and member count, and never another path", () => {
    const rows = overviewRows({
      subject: { type: "module", id: "invoices" },
      paths: [viaFinance, direct, viaFormer],
      personPaths: undefined,
      catalogue: FIXTURE_ROWS,
      memberCounts: MEMBER_COUNTS,
      recordLabels: new Map(),
    });

    expect(
      rows.map((row) => [
        row.module,
        row.path,
        row.alsoThrough,
        row.notInEffect,
      ])
    ).toEqual([
      ["Invoices", "Group · 12 members", [], []],
      ["Invoices", "Direct", [], []],
      ["Invoices", "Group", [], ["Group archived"]],
    ]);
  });

  it("names a directory group by its kind, and a local group with its member count (T6-e)", () => {
    const local = path("a-local", ops, invoicesUser, "invoices");

    const itGroup = {
      type: "group",
      id: "g-it",
      name: "IT",
      source: "idp",
    } as const;

    const directory = path("a-it", itGroup, invoicesUser, "invoices");

    const rows = overviewRows({
      subject: { type: "module", id: "invoices" },
      paths: [local, directory],
      personPaths: undefined,
      catalogue: FIXTURE_ROWS,
      memberCounts: { "g-ops": 1 },
      recordLabels: new Map(),
    });

    expect(rows.map((row) => row.path)).toEqual([
      "Group · 1 member",
      "Directory group",
    ]);
  });

  it("names each role's module in a person lookup, and its paused reason (G9)", () => {
    const rows = overviewRows({
      subject: person,
      paths: [direct, askDirect, admin, analyticsOff],
      personPaths: all,
      catalogue: FIXTURE_ROWS,
      memberCounts: MEMBER_COUNTS,
      recordLabels: new Map(),
    });

    expect(rows.map((row) => [row.module, row.path, row.notInEffect])).toEqual([
      ["Invoices", "Direct", []],
      ["Ask", "Direct", []],
      ["Core", "Finance team", []],
      ["Analytics", "Finance team", ["Module off"]],
    ]);
  });

  it("names a role lookup's holders by kind and member count", () => {
    const rows = overviewRows({
      subject: { type: "role", id: "r-tenant-admin" },
      paths: [
        admin,
        { ...admin, assignmentId: "a-admin-jamie", holder: jamie },
      ],
      personPaths: undefined,
      catalogue: FIXTURE_ROWS,
      memberCounts: MEMBER_COUNTS,
      recordLabels: new Map(),
    });

    expect(rows.map((row) => row.path)).toEqual([
      "Group · 12 members",
      "Direct",
    ]);
  });

  it("W3: shows the record label when the labels read gives one, else the id", () => {
    const unlabeled: AccessPath = {
      ...path("a-scoped-2", ops, invoicesFinance, "invoices"),
      scope: { type: "invoice", id: "inv-0157" },
    };

    const rows = overviewRows({
      subject: { type: "group", id: "g-ops" },
      paths: [scoped, unlabeled, direct],
      personPaths: undefined,
      catalogue: FIXTURE_ROWS,
      memberCounts: MEMBER_COUNTS,
      recordLabels: new Map([
        ["invoice\u0000INV-2026-0142", "Harbor invoice 142"],
      ]),
    });

    expect(rows.map((row) => row.record)).toEqual([
      "Harbor invoice 142",
      "inv-0157",
      null,
    ]);
  });

  it("names a group's kind and size from the page's counts, also an archived group, and a suspended person (T7-a)", () => {
    const itOps = {
      type: "group",
      id: "g-it",
      name: "IT Operations",
      source: "idp",
    } as const;

    const rows = overviewRows({
      subject: null,
      paths: [
        {
          ...path("a-it", itOps, invoicesUser, "invoices"),
          notInEffect: ["group-archived"],
        },
        { ...direct, notInEffect: ["person-disabled"] },
      ],
      personPaths: undefined,
      catalogue: FIXTURE_ROWS,
      memberCounts: { "g-it": 17 },
      recordLabels: new Map(),
    });

    expect(rows.map((row) => [row.kind, row.notInEffect])).toEqual([
      ["Directory group · 17 members", ["Group archived"]],
      ["Person", ["Person suspended"]],
    ]);
  });
});

describe("reachLine", () => {
  const riley = { type: "user", id: "p-riley", name: "Riley Chen" } as const;

  const sales = {
    type: "group",
    id: "g-sales",
    name: "Sales",
    source: "idp",
  } as const;

  it("counts direct and group rows of the person filter (T7-b)", () => {
    expect(
      reachLine("Riley Chen", [
        at("1", riley),
        at("2", finance),
        at("3", riley),
        at("4", finance),
        at("5", finance),
        at("6", finance),
      ])
    ).toBe("Riley Chen has 6 roles: 2 direct, 4 via Finance team.");
    expect(
      reachLine("Riley Chen", [
        at("1", finance),
        at("2", sales),
        at("3", finance),
        at("4", ops),
      ])
    ).toBe(
      "Riley Chen has 4 roles: 2 via Finance team, 1 via Sales and 1 via Operations."
    );
    expect(reachLine("Riley Chen", [at("1", riley)])).toBe(
      "Riley Chen has 1 role: 1 direct."
    );
    expect(reachLine("Riley Chen", [])).toBe("Riley Chen has no roles.");
  });
});

describe("parseWho", () => {
  it.each([
    ["user:p-1", { type: "user", id: "p-1" }],
    ["group:g-1", { type: "group", id: "g-1" }],
    ["x", null],
    ["user:", null],
    ["role:1", null],
    [undefined, null],
  ] as const)("reads %s (T7-c)", (value, expected) => {
    expect(parseWho(value)).toEqual(expected);
  });
});

describe("readFilters", () => {
  const roles = [{ id: "r-auditor" }];

  const jamieRow: RecipientRow = {
    type: "user",
    id: "p-jamie",
    name: "Jamie Chen",
    email: "jamie.chen@example.com",
    assignedRoles: 1,
  };

  it("waits while a set who loads, and leaves out a who, module or role that no list holds (T7-i)", () => {
    const params = {
      q: "north",
      who: "user:p-jamie",
      module: "invoices",
      role: "r-auditor",
    };

    expect(
      readFilters({ params, who: undefined, catalogue: FIXTURE_ROWS, roles })
        .ready
    ).toBe(false);
    expect(
      readFilters({ params, who: jamieRow, catalogue: FIXTURE_ROWS, roles })
    ).toEqual({
      ready: true,
      query: "north",
      filters: {
        recipient: { type: "user", id: "p-jamie" },
        moduleId: "invoices",
        roleId: "r-auditor",
      },
    });
    expect(
      readFilters({
        params: { who: "user:gone", module: "gone", role: "r-gone" },
        who: null,
        catalogue: FIXTURE_ROWS,
        roles,
      })
    ).toEqual({ ready: true, query: "", filters: {} });
    expect(
      readFilters({
        params: { who: "nonsense" },
        who: undefined,
        catalogue: FIXTURE_ROWS,
        roles,
      })
    ).toEqual({ ready: true, query: "", filters: {} });
  });
});
