import { describe, expect, it } from "vitest";

import type { AccessPath } from "../../services/roles/effective-access.ts";
import {
  FIXTURE_RECIPIENTS,
  FIXTURE_ROWS,
  fixturePath,
} from "./__fixtures__/access.ts";
import { linkedSubject, overviewRows } from "./overview-view.ts";

const jamie = { type: "user", id: "p-jamie", name: "Jamie Chen" } as const;

const finance = {
  type: "group",
  id: "g-finance",
  name: "Finance team",
} as const;

const ops = { type: "group", id: "g-ops", name: "Operations" } as const;

const former = {
  type: "group",
  id: "g-former",
  name: "Former finance",
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

const person = { type: "user", id: "p-jamie" } as const;

const also = (shown: AccessPath) =>
  overviewRows({
    subject: person,
    paths: [shown],
    personPaths: all,
    catalogue: FIXTURE_ROWS,
    recipients: FIXTURE_RECIPIENTS,
    recordLabels: new Map(),
  })[0]?.alsoThrough;

describe("overviewRows", () => {
  it("names a person's other live whole-tenant paths to the module, from every path, not the page", () => {
    expect(also(direct)).toEqual(["Finance team"]);
    expect(also(viaFinance)).toEqual(["a direct assignment"]);
    expect(also(scoped)).toEqual(["a direct assignment", "Finance team"]);
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
      recipients: FIXTURE_RECIPIENTS,
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
      ["Invoices", "Group, 12 members", [], []],
      ["Invoices", "Direct assignment", [], []],
      ["Invoices", "Group", [], ["The group is archived"]],
    ]);
  });

  it("names each role's module in a person lookup, and the row's module in its reason", () => {
    const rows = overviewRows({
      subject: person,
      paths: [direct, askDirect, admin, analyticsOff],
      personPaths: all,
      catalogue: FIXTURE_ROWS,
      recipients: FIXTURE_RECIPIENTS,
      recordLabels: new Map(),
    });

    expect(rows.map((row) => [row.module, row.path, row.notInEffect])).toEqual([
      ["Invoices", "Direct assignment", []],
      ["Ask", "Direct assignment", []],
      ["Core administration", "via Finance team", []],
      ["Analytics", "via Finance team", ["The Analytics module is off"]],
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
      recipients: FIXTURE_RECIPIENTS,
      recordLabels: new Map(),
    });

    expect(rows.map((row) => row.path)).toEqual([
      "Group, 12 members",
      "Direct assignment",
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
      recipients: FIXTURE_RECIPIENTS,
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
});

describe("linkedSubject", () => {
  const roles = [{ id: "r-auditor" }];

  it.each([
    ["a listed role", { role: "r-auditor" }, { type: "role", id: "r-auditor" }],
    [
      "a listed module",
      { module: "invoices" },
      { type: "module", id: "invoices" },
    ],
    [
      "a listed role and module, role first",
      { module: "invoices", role: "r-auditor" },
      { type: "role", id: "r-auditor" },
    ],
    ["an unlisted role", { role: "r-gone" }, null],
    ["an unlisted module", { module: "gone" }, null],
    ["no parameter", {}, null],
  ] as const)("answers %s", (_name, link, expected) => {
    expect(linkedSubject(link, FIXTURE_ROWS, roles)).toEqual(expected);
  });
});
