import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { AccessPage, AccessPath } from "./effective-access.ts";
import type { GrantRecipients, GrantRow } from "./grants.ts";
import type { RoleDetail, RolePermissionGroup, RoleRow } from "./index.ts";

const roleId = z.object({ roleId: z.uuid() });

const permissions = z.array(z.string().min(1).max(200));

/** The answer of a write that creates a row: its id. */
const created = z.custom<{ readonly id: string }>();

const scope = z
  .object({
    scopeType: z.string().min(1).max(200).nullish(),
    scopeId: z.string().min(1).max(200).nullish(),
  })
  .refine(
    (value) =>
      ((value.scopeType ?? null) === null) ===
      ((value.scopeId ?? null) === null),
    { message: "A scope is both columns or neither" }
  );

/**
 * The Roles screen's API (R-37, ADR 0011), under core's `/roles/` area. It imports only zod and
 * the browser-safe `@genie/core/rpc` entry, so the browser client types its calls from it. Answers
 * are typed from the service with `z.custom`, which checks nothing at run time: the service builds
 * them, so a schema would only repeat the type.
 */
export const rolesContract = {
  list: oc
    .route({ method: "GET", path: "/roles" })
    .output(z.custom<readonly RoleRow[]>()),

  // The declared permission catalogue the role form picks from, grouped by module with each
  // module's entitlement state (R-33). A new role is built from this, never from a stored role.
  catalogue: oc
    .route({ method: "GET", path: "/roles/catalogue" })
    .output(z.custom<readonly RolePermissionGroup[]>()),

  get: oc
    .route({ method: "GET", path: "/roles/{roleId}" })
    .input(roleId)
    .output(z.custom<RoleDetail>()),

  create: oc
    .route({ method: "POST", path: "/roles" })
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        permissions,
        // The module the custom role belongs to; absent or null means core (A6).
        moduleId: z.string().min(1).max(200).nullish(),
      })
    )
    .output(created),

  // An action: it writes a new role from a stored one and records its own audit event.
  copy: oc
    .route({ method: "POST", path: "/roles/{roleId}/copy" })
    .input(z.object({ roleId: z.uuid(), name: z.string().min(1).max(200) }))
    .output(created),

  update: oc.route({ method: "PATCH", path: "/roles/{roleId}" }).input(
    z.object({
      roleId: z.uuid(),
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      permissions,
    })
  ),

  remove: oc.route({ method: "DELETE", path: "/roles/{roleId}" }).input(roleId),

  assign: oc
    .route({ method: "POST", path: "/roles/{roleId}/assignments" })
    .input(
      z.object({
        roleId: z.uuid(),
        principalType: z.enum(["user", "group"]),
        principalId: z.string().min(1).max(200),
        scope: scope.optional(),
      })
    )
    .output(created),

  unassign: oc
    .route({ method: "DELETE", path: "/roles/assignments/{assignmentId}" })
    .input(z.object({ assignmentId: z.uuid() })),

  // A8, R-37d: every path through which one person or group holds a role, unpaged, for Grants.
  recipientAccess: oc
    .route({
      method: "GET",
      path: "/roles/access/{principalType}/{principalId}",
    })
    .input(
      z.object({
        principalType: z.enum(["user", "group"]),
        principalId: z.string().min(1).max(200),
      })
    )
    .output(z.custom<readonly AccessPath[]>()),

  // A8, R-37b: the same paths for Overview, by person, group or module, newest first. The cursor
  // is the last row of a page; a malformed one is a zod input error, never a database cast.
  accessBySubject: oc
    .route({ method: "GET", path: "/roles/access" })
    .input(
      z.object({
        subject: z.object({
          type: z.enum(["user", "group", "module"]),
          id: z.string().min(1).max(200),
        }),
        query: z.string().max(200).optional(),
        cursor: z
          .object({ addedAt: z.iso.datetime(), assignmentId: z.uuid() })
          .nullish(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .output(z.custom<AccessPage>()),

  // R-37a: the Grants rows, each module with a default access role and then Ask, with each
  // row's role choice and entitlement.
  grantCatalogue: oc
    .route({ method: "GET", path: "/roles/grants/catalogue" })
    .output(z.custom<readonly GrantRow[]>()),

  // R-37e, R-39: the groups and people the Grants picker offers, without the break-glass account.
  grantRecipients: oc
    .route({ method: "GET", path: "/roles/grants/recipients" })
    .output(z.custom<GrantRecipients>()),
};

export type RolesContract = typeof rolesContract;
