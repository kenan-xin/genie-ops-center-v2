import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  callProcedure,
  createRolesRouter,
  principalFor,
} from "../src/index.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import {
  assignRole,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * d8l5.62, P12-6 against a real Postgres: the one paged read of the groups and people that Access
 * offers, behind `core:roles:manage` held tenant-wide (R-37e), never naming the break-glass account
 * or an erased person (R-39). The file shares one deployment, so each test searches a token of its
 * own. Nothing is mocked.
 */
const modules: readonly Pick<
  Module,
  "identity" | "permissions" | "recordTypes" | "defaultRoles"
>[] = [];

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

/** The caller: a custom core role with `core:roles:manage`, tenant-wide. */
let adaId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);

  adaId = await insertUser(deployment.context, { name: "Ada" });
  await assignRole(deployment.context, {
    roleId: await insertRole(deployment.context, {
      permissions: ["core:roles:manage"],
    }),
    principal: { type: "user", id: adaId },
  });
}, 180000);

afterAll(async () => {
  await deployment?.stop();
});

function roles(userId: string) {
  return callProcedure(createRolesRouter(modules), {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules,
      userId,
      authenticated: true,
    }),
  });
}

/** A search term no other test writes. */
const token = () => `tok${randomUUID().slice(0, 8)}`;

const user = (name: string) =>
  insertUser(deployment.context, { name, email: `${randomUUID()}@x.invalid` });

describe("the recipients read", () => {
  it("lists groups and then people by name, without the break-glass account, an erased person or an archived group unless asked", async () => {
    const t = token();

    const bob = await user(`bob ${t}`);
    const amy = await user(`Amy ${t}`);

    const breakGlass = await insertUser(deployment.context, {
      name: `bg ${t}`,
      isBreakGlass: true,
    });

    const erased = await insertUser(deployment.context, {
      name: `erased ${t}`,
      erasedAt: new Date(),
    });

    const beta = await insertGroup(deployment.context, [], {
      name: `beta ${t}`,
    });

    const alpha = await insertGroup(deployment.context, [], {
      name: `Alpha ${t}`,
    });

    const archived = await insertGroup(deployment.context, [], {
      name: `Archived ${t}`,
      archivedAt: new Date(),
    });

    const live = await roles(adaId).recipients({ query: t });

    expect(live.rows.map((row) => row.id)).toEqual([alpha, beta, amy, bob]);
    expect(live.total).toBe(4);
    expect(live.rows.map((row) => row.id)).not.toContain(breakGlass);
    expect(live.rows.map((row) => row.id)).not.toContain(erased);

    const all = await roles(adaId).recipients({ query: t, archived: true });

    expect(
      all.rows.map((row) => [
        row.id,
        row.type === "group" ? row.archived : null,
      ])
    ).toEqual([
      [alpha, false],
      [archived, true],
      [beta, false],
      [amy, null],
      [bob, null],
    ]);
  });

  it("searches labels, names and emails, narrows by kind and ids, counts every match and pages without a repeat", async () => {
    const t = token();

    const labelled = await insertGroup(deployment.context, [], {
      name: `directory-${randomUUID()}`,
      displayLabel: `Finance ${t}`,
    });

    const named = await user(`Cara ${t}`);

    const mailed = await insertUser(deployment.context, {
      name: "Dan",
      email: `${t}@x.invalid`,
    });

    const found = await roles(adaId).recipients({ query: t });

    expect(found.rows.map((row) => row.id)).toEqual([labelled, named, mailed]);
    expect(found.total).toBe(3);
    expect(found.rows[0]).toMatchObject({ name: `Finance ${t}` });

    const groups = await roles(adaId).recipients({ query: t, kind: "group" });

    expect(groups.rows.map((row) => row.id)).toEqual([labelled]);
    expect(groups.total).toBe(1);

    const people = await roles(adaId).recipients({ query: t, kind: "user" });

    expect(people.rows.map((row) => row.id)).toEqual([named, mailed]);

    const picked = await roles(adaId).recipients({
      ids: [mailed, labelled, "not-a-uuid"],
    });

    expect(picked.rows.map((row) => row.id)).toEqual([labelled, mailed]);
    expect(picked.total).toBe(2);

    const first = await roles(adaId).recipients({ query: t, limit: 2 });

    const second = await roles(adaId).recipients({
      query: t,
      offset: 2,
      limit: 2,
    });

    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
    expect([...first.rows, ...second.rows].map((row) => row.id)).toEqual([
      labelled,
      named,
      mailed,
    ]);
  });

  it("counts only a recipient's own assignments, and a group's members without the break-glass account", async () => {
    const t = token();

    const member = await user(`Eve ${t}`);

    const breakGlass = await insertUser(deployment.context, {
      isBreakGlass: true,
    });

    const team = await insertGroup(deployment.context, [member, breakGlass], {
      name: `Team ${t}`,
    });

    const give = async (principal: {
      readonly type: "user" | "group";
      readonly id: string;
    }) =>
      assignRole(deployment.context, {
        roleId: await insertRole(deployment.context, { permissions: [] }),
        principal,
      });

    await give({ type: "user", id: member });
    await give({ type: "group", id: team });
    await give({ type: "group", id: team });

    const { rows } = await roles(adaId).recipients({ query: t });

    expect(rows).toEqual([
      {
        type: "group",
        id: team,
        name: `Team ${t}`,
        source: "local",
        memberCount: 1,
        archived: false,
        assignedRoles: 2,
      },
      {
        type: "user",
        id: member,
        name: `Eve ${t}`,
        email: expect.any(String),
        assignedRoles: 1,
      },
    ]);
  });

  it("refuses core:roles:manage at one scope and core:people:manage alone", async () => {
    const scoped = await insertUser(deployment.context);
    const peopleManager = await insertUser(deployment.context);

    await assignRole(deployment.context, {
      roleId: await insertRole(deployment.context, {
        permissions: ["core:roles:manage"],
      }),
      principal: { type: "user", id: scoped },
      scope: { type: "group", id: await insertGroup(deployment.context, []) },
    });
    await assignRole(deployment.context, {
      roleId: await insertRole(deployment.context, {
        permissions: ["core:people:manage"],
      }),
      principal: { type: "user", id: peopleManager },
    });

    await expect(roles(scoped).recipients({})).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(roles(peopleManager).recipients({})).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
