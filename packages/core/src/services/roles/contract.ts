import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { AdvancedCatalogue, RemovalGuard } from "./advanced.ts";
import type { AccessPage, AccessPath } from "./effective-access.ts";
import type { GrantRecipients, GrantRow } from "./grants.ts";
import type { RoleDetail, RolePermissionGroup, RoleRow } from "./index.ts";
import type { RecordLabel, ScopeRecord } from "./records.ts";

const roleId = z.object({ roleId: z.uuid() });

const permissions = z.array(z.string().min(1).max(200));

/** A Grants row: a module id, or the Ask row. */
const grantRow = z.string().min(1).max(200);

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

/** One record a scope points at: both halves, never one. `scope` names the half-null pair. */
const recordRef = z.object({
  type: z.string().min(1).max(200),
  id: z.string().min(1).max(200),
});

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
          type: z.enum(["user", "group", "module", "role"]),
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

  // R-37a, P1: Add, the role swap and Remove for one recipient, in one transaction.
  saveGrants: oc
    .route({
      method: "POST",
      path: "/roles/grants/{principalType}/{principalId}",
    })
    .input(
      z.object({
        principalType: z.enum(["user", "group"]),
        principalId: z.string().min(1).max(200),
        add: z.array(z.object({ row: grantRow, roleId: z.uuid() })).max(100),
        change: z
          .array(
            z.object({
              row: grantRow,
              assignmentId: z.uuid(),
              roleId: z.uuid(),
            })
          )
          .max(100),
        remove: z.array(z.object({ row: grantRow })).max(100),
      })
    ),

  // R-37c, R-38: Advanced access adds and removes for one recipient, in one transaction.
  saveAdvanced: oc
    .route({
      method: "POST",
      path: "/roles/advanced/{principalType}/{principalId}",
    })
    .input(
      z.object({
        principalType: z.enum(["user", "group"]),
        principalId: z.string().min(1).max(200),
        add: z
          .array(z.object({ roleId: z.uuid(), scope: recordRef.nullable() }))
          .max(100),
        remove: z.array(z.object({ assignmentId: z.uuid() })).max(100),
      })
    ),

  // R-38, AD7: the recipient's assignments whose Remove is disabled in place, with the reason.
  administratorGuards: oc
    .route({
      method: "GET",
      path: "/roles/advanced/guards/{principalType}/{principalId}",
    })
    .input(
      z.object({
        principalType: z.enum(["user", "group"]),
        principalId: z.string().min(1).max(200),
      })
    )
    .output(z.custom<readonly RemovalGuard[]>()),

  // R-37c, AD8: the roles Advanced access can add, in the picker's three groups.
  advancedCatalogue: oc
    .route({ method: "GET", path: "/roles/advanced/catalogue" })
    .output(z.custom<AdvancedCatalogue>()),

  // R-37c, AD2, AD3: the records of one record type that match a search, under the record check.
  scopeRecords: oc
    .route({ method: "GET", path: "/roles/records/search" })
    .input(
      z.object({
        recordType: z.string().min(1).max(200),
        query: z.string().max(200),
      })
    )
    .output(z.custom<readonly ScopeRecord[]>()),

  // AD10: the labels of the scopes the caller may open; any other scope is left out.
  recordLabels: oc
    .route({ method: "POST", path: "/roles/records/labels" })
    .input(z.object({ records: z.array(recordRef).max(100) }))
    .output(z.custom<readonly RecordLabel[]>()),

  // R-37e, R-39: the groups and people the Grants picker offers, without the break-glass account.
  grantRecipients: oc
    .route({ method: "GET", path: "/roles/grants/recipients" })
    .output(z.custom<GrantRecipients>()),
};

export type RolesContract = typeof rolesContract;
