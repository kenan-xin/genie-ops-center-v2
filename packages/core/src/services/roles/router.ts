import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import {
  assignRole,
  removeAssignment,
} from "../authorization/role-assignment.ts";
import {
  assertAdvancedAdds,
  readAdministratorGuards,
  readAdvancedCatalogue,
  saveAdvanced,
} from "./advanced.ts";
import { rolesContract } from "./contract.ts";
import {
  ACCESS_PAGE_SIZE,
  assertManagesAllRoles,
  readAccessBySubject,
  readRecipientAccess,
} from "./effective-access.ts";
import {
  readGrantCatalogue,
  readGrantRecipients,
  saveGrants,
} from "./grants.ts";
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
import { readRecordLabels, searchScopeRecords } from "./records.ts";

// The session check, then the permission gate, both before input is parsed: an anonymous,
// idle-expired or capped request answers `unauthenticated` at 401 and a caller without the key
// `forbidden` at 403, however malformed the input is; only then does the handler read
// (Spec 2 R-14, R-37).
const managed = gatedArea(rolesContract, "core:roles:manage");

/**
 * The Roles screen's one router (R-37), built from its contract. Every procedure is behind
 * `core:roles:manage` through the one `can()` seam (DEC-39). It edits role definitions and,
 * through the one role-assignment service, writes grants; the Access screen and Add person reuse
 * the same service, so `role_assignment` has exactly one writer (DEC-39). Every write records a
 * catalogue audit action.
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
      // The key tenant-wide, as Grants and Advanced need it (D7); a scoped add only as Advanced
      // takes it (d8l5.51); a whole-tenant add keeps the writer's own refusals (R-37a).
      await assertManagesAllRoles(context.caller);

      const scope =
        input.scope?.scopeType != null && input.scope.scopeId != null
          ? { type: input.scope.scopeType, id: input.scope.scopeId }
          : null;

      if (scope !== null) {
        await assertAdvancedAdds({
          tenant: context.tenant,
          caller: context.caller,
          modules,
          add: [{ roleId: input.roleId, scope }],
        });
      }

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

    grantRecipients: managed.grantRecipients.handler(({ context }) =>
      readGrantRecipients({ tenant: context.tenant, caller: context.caller })
    ),
  });
}

export type RolesRouter = ReturnType<typeof createRolesRouter>;
