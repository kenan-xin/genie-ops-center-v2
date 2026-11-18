import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import {
  assignRole,
  removeAssignment,
} from "../authorization/role-assignment.ts";
import { addAssignments, assertAssignable } from "./add-assignments.ts";
import {
  readAdministratorGuards,
  readAdvancedCatalogue,
  saveAdvanced,
} from "./advanced.ts";
import { rolesContract } from "./contract.ts";
import {
  ACCESS_PAGE_SIZE,
  assertManagesAllRoles,
  OVERVIEW_PAGE_SIZE,
  readAccessBySubject,
  readAssignments,
  readRecipientAccess,
} from "./effective-access.ts";
import { readGrantCatalogue, saveGrants } from "./grants.ts";
import {
  copyRole,
  createRole,
  declaredCatalogue,
  deleteRole,
  listRoles,
  readRole,
  type RolesModule,
  updateRole,
} from "./index.ts";
import { readRecipients, RECIPIENT_PAGE_SIZE } from "./recipients.ts";
import { readRecordLabels, searchScopeRecords } from "./records.ts";

// The session check, then the permission gate, both before input is parsed: an anonymous,
// idle-expired or capped request answers `unauthenticated` at 401 and a caller without the key
// `forbidden` at 403, however malformed the input is; only then does the handler read
// (Spec 2 R-14, R-37). The key must be held tenant-wide, as Grants and Advanced need it (D7,
// d8l5.51): a holder only at a scope could otherwise edit a role it holds into a manager role.
const managed = gatedArea(rolesContract, "core:roles:manage").use(
  async ({ context, next }) => {
    await assertManagesAllRoles(context.caller);

    return next();
  }
);

/**
 * The Roles screen's one router (R-37), built from its contract. Every procedure is behind
 * `core:roles:manage` held tenant-wide, through the `can()` and `scopesFor()` seam (DEC-39). It
 * edits role definitions and, through the one role-assignment service, writes grants; the Access
 * screen and Add person reuse the same service, so `role_assignment` has exactly one writer
 * (DEC-39). Every write records a catalogue audit action.
 */
export function createRolesRouter(modules: readonly RolesModule[]) {
  return managed.router({
    list: managed.list.handler(({ context }) =>
      listRoles(context.tenant, modules)
    ),

    catalogue: managed.catalogue.handler(({ context }) =>
      declaredCatalogue(context.tenant, modules)
    ),

    get: managed.get.handler(async ({ context, input }) => {
      const found = await readRole(context.tenant, input.roleId, modules);

      if (found === undefined) {
        throw new AppError(CORE_ERRORS["not-found"]);
      }

      return found;
    }),

    create: managed.create.handler(async ({ context, input }) => ({
      id: await createRole(context.tenant, modules, {
        actorUserId: context.caller.userId,
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        moduleId: input.moduleId ?? null,
      }),
    })),

    copy: managed.copy.handler(async ({ context, input }) => ({
      id: await copyRole(context.tenant, modules, {
        actorUserId: context.caller.userId,
        roleId: input.roleId,
        name: input.name,
      }),
    })),

    update: managed.update.handler(async ({ context, input }) => {
      await updateRole(context.tenant, modules, {
        actorUserId: context.caller.userId,
        roleId: input.roleId,
        name: input.name,
        description: input.description,
        permissions: input.permissions,
      });
    }),

    remove: managed.remove.handler(async ({ context, input }) => {
      await deleteRole(context.tenant, {
        actorUserId: context.caller.userId,
        roleId: input.roleId,
      });
    }),

    assign: managed.assign.handler(async ({ context, input }) => {
      // A scoped add only as Advanced takes it (d8l5.51); a whole-tenant add keeps the writer's
      // own refusals (R-37a).
      const scope =
        input.scope?.scopeType != null && input.scope.scopeId != null
          ? { type: input.scope.scopeType, id: input.scope.scopeId }
          : null;

      // Refuses an erased person, the break-glass account and an unknown id (R-39, d8l5.57), and a
      // scope that Advanced access refuses, as assignMany does.
      await assertAssignable({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        roleId: input.roleId,
        scope,
        recipients: [{ type: input.principalType, id: input.principalId }],
      });

      return {
        id: (
          await assignRole({
            tenant: context.tenant,
            actorUserId: context.caller.userId,
            roleId: input.roleId,
            principal: {
              type: input.principalType,
              id: input.principalId,
            },
            scope,
          })
        ).id,
      };
    }),

    unassign: managed.unassign.handler(async ({ context, input }) => {
      await removeAssignment({
        tenant: context.tenant,
        actorUserId: context.caller.userId,
        assignmentId: input.assignmentId,
      });
    }),

    assignMany: managed.assignMany.handler(({ context, input }) =>
      addAssignments({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        roleId: input.roleId,
        scope: input.scope,
        recipients: input.recipients,
      })
    ),

    recipientAccess: managed.recipientAccess.handler(({ context, input }) =>
      readRecipientAccess({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        recipient: { type: input.principalType, id: input.principalId },
      })
    ),

    accessBySubject: managed.accessBySubject.handler(({ context, input }) =>
      readAccessBySubject({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        subject: input.subject,
        query: input.query ?? "",
        cursor: input.cursor ?? null,
        limit: input.limit ?? ACCESS_PAGE_SIZE,
      })
    ),

    assignments: managed.assignments.handler(({ context, input }) =>
      readAssignments({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        filters: {
          recipient: input.recipient,
          moduleId: input.moduleId,
          roleId: input.roleId,
        },
        query: input.query ?? "",
        cursor: input.cursor ?? null,
        limit: input.limit ?? OVERVIEW_PAGE_SIZE,
      })
    ),

    grantCatalogue: managed.grantCatalogue.handler(({ context }) =>
      readGrantCatalogue({
        tenant: context.tenant,
        caller: context.caller,
        modules,
      })
    ),

    saveGrants: managed.saveGrants.handler(async ({ context, input }) => {
      await saveGrants({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        recipient: { type: input.principalType, id: input.principalId },
        changes: {
          add: input.add,
          change: input.change,
          remove: input.remove,
        },
      });
    }),

    saveAdvanced: managed.saveAdvanced.handler(async ({ context, input }) => {
      await saveAdvanced({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        recipient: { type: input.principalType, id: input.principalId },
        changes: { add: input.add, remove: input.remove },
      });
    }),

    administratorGuards: managed.administratorGuards.handler(
      ({ context, input }) =>
        readAdministratorGuards({
          tenant: context.tenant,
          caller: context.caller,
          recipient: { type: input.principalType, id: input.principalId },
        })
    ),

    advancedCatalogue: managed.advancedCatalogue.handler(({ context }) =>
      readAdvancedCatalogue({
        tenant: context.tenant,
        caller: context.caller,
        modules,
      })
    ),

    scopeRecords: managed.scopeRecords.handler(({ context, input }) =>
      searchScopeRecords({
        tenant: context.tenant,
        caller: context.caller,
        modules,
        recordType: input.recordType,
        query: input.query,
      })
    ),

    recordLabels: managed.recordLabels.handler(({ context, input }) =>
      readRecordLabels({
        caller: context.caller,
        modules,
        records: input.records,
      })
    ),

    recipients: managed.recipients.handler(({ context, input }) =>
      readRecipients({
        tenant: context.tenant,
        caller: context.caller,
        query: input.query ?? "",
        kind: input.kind ?? "all",
        ids: input.ids ?? null,
        archived: input.archived ?? false,
        offset: input.offset ?? 0,
        limit: input.limit ?? RECIPIENT_PAGE_SIZE,
      })
    ),
  });
}

export type RolesRouter = ReturnType<typeof createRolesRouter>;
