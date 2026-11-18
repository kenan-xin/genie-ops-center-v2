import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { principalFor } from "../src/services/authorization/grant-reader.ts";
import { readRoleSummaries } from "../src/services/authorization/role-summaries.ts";
import type { DisposableDeployment } from "./index.ts";
import {
  assignRole,
  insertGroup,
  insertRole,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The account page's roles summary read (Spec 2 R-18) against a real Postgres: every role the
 * person holds, with its scope and whether it arrived directly or through a group, read at the
 * same seam as the R-27 loader and editing nothing.
 */
describe("readRoleSummaries", () => {
  let deployment: DisposableDeployment;

  beforeAll(async () => {
    deployment = await startDisposableDeployment();
  }, 240_000);

  afterAll(async () => {
    await deployment?.stop();
  });

  it("lists direct and group grants with scope, module and permission count, and hides archived groups (R-18, R-32)", async () => {
    const context = deployment.context;

    const userId = await insertUser(context);

    const direct = await insertRole(context, {
      name: "Solutions editor",
      permissions: ["solutions:use", "solutions:admin"],
    });

    await assignRole(context, {
      roleId: direct,
      principal: { type: "user", id: userId },
    });

    const through = await insertRole(context, {
      name: "Tenant administrator",
      permissions: ["core:audit:read", "core:person:add", "core:person:remove"],
    });

    const group = await insertGroup(context, [userId], {
      name: "Directory admins",
      source: "idp",
    });

    await assignRole(context, {
      roleId: through,
      principal: { type: "group", id: group },
      scope: { type: "solution", id: "solution-17" },
    });

    const archivedRole = await insertRole(context, {
      name: "Retired role",
      permissions: ["solutions:use"],
    });

    const archivedGroup = await insertGroup(context, [userId], {
      name: "Archived group",
    });

    await context.db.execute(
      // SAFETY: the archived group's uuid was just inserted by the fixture above.
      `update "group" set archived_at = now() where id = '${archivedGroup}'`
    );

    await assignRole(context, {
      roleId: archivedRole,
      principal: { type: "group", id: archivedGroup },
    });

    const rows = await readRoleSummaries(
      principalFor({
        tenant: context,
        modules: [],
        userId,
        authenticated: true,
      }),
      context
    );

    expect(rows).toEqual([
      {
        roleName: "Solutions editor",
        moduleName: null,
        permissionCount: 2,
        scopeType: null,
        scopeId: null,
        via: null,
        notInEffect: [],
      },
      {
        roleName: "Tenant administrator",
        moduleName: null,
        permissionCount: 3,
        scopeType: "solution",
        scopeId: "solution-17",
        via: "Directory admins",
        notInEffect: [],
      },
    ]);
  });

  it("names a role of a module that is off as paused, and a core role as in effect (C11-25)", async () => {
    const context = deployment.context;

    const userId = await insertUser(context);

    const core = await insertRole(context, {
      name: "Audit reader",
      permissions: ["core:audit:read"],
    });

    // No `tenant_module` row and not compiled, so the module reads as off.
    const dormant = await insertRole(context, {
      name: "Dormant user",
      permissions: ["dormant:use"],
      moduleId: "dormant",
    });

    await Promise.all(
      [core, dormant].map((roleId) =>
        assignRole(context, {
          roleId,
          principal: { type: "user", id: userId },
        })
      )
    );

    const rows = await readRoleSummaries(
      principalFor({
        tenant: context,
        modules: [],
        userId,
        authenticated: true,
      }),
      context
    );

    // The read has no order, so sort by name.
    expect(
      rows
        .map((row) => [row.roleName, row.notInEffect])
        .toSorted(([a], [b]) => String(a).localeCompare(String(b)))
    ).toEqual([
      ["Audit reader", []],
      ["Dormant user", ["module-off"]],
    ]);
  });

  it("answers an empty list for a person without assignments", async () => {
    const alone = await insertUser(deployment.context);

    expect(
      await readRoleSummaries(
        principalFor({
          tenant: deployment.context,
          modules: [],
          userId: alone,
          authenticated: true,
        }),
        deployment.context
      )
    ).toEqual([]);
  });

  it("does not expose assignment metadata for an inactive person", async () => {
    const context = deployment.context;
    const userId = await insertUser(context);

    const roleId = await insertRole(context, {
      name: "Inactive reader",
      permissions: ["core:audit:read"],
    });

    await assignRole(context, {
      roleId,
      principal: { type: "user", id: userId },
    });

    await context.db.execute(
      `update "user" set banned = true where id = '${userId}'`
    );

    expect(
      await readRoleSummaries(
        principalFor({
          tenant: context,
          modules: [],
          userId,
          authenticated: true,
        }),
        context
      )
    ).toEqual([]);
  });
});
