import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { can } from "../authorization/index.ts";
import {
  assignRole,
  removeAssignment,
} from "../authorization/role-assignment.ts";
import { rolesContract } from "./contract.ts";
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

const MANAGE_PERMISSION = "core:roles:manage";

// The session check, then the permission gate, both before input is parsed: an anonymous,
// idle-expired or capped request answers `unauthenticated` at 401 and a caller without the key
// `forbidden` at 403, however malformed the input is; only then does the handler read
// (Spec 2 R-14, R-37).
const os = implementCoreArea(rolesContract);

const managed = os.use(async ({ context, next }) => {
  if (!(await can(context.caller, MANAGE_PERMISSION))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  return next();
});

/**
 * The Roles screen's one router (R-37), built from its contract. Every procedure is behind
 * `core:roles:manage` through the one `can()` seam (DEC-39). It edits role definitions and,
 * through the one role-assignment service, writes grants; the Access screen and Add person reuse
 * the same service, so `role_assignment` has exactly one writer (DEC-39). Every write records a
 * catalogue audit action.
 */
export function createRolesRouter(modules: readonly RolesModule[]) {
  return os.router({
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

    assign: managed.assign.handler(async ({ context, input }) => ({
      id: (
        await assignRole({
          tenant: context.tenant,
          actorUserId: context.caller.userId,
          roleId: input.roleId,
          principal: {
            type: input.principalType,
            id: input.principalId,
          },
          scope:
            input.scope?.scopeType != null && input.scope.scopeId != null
              ? { type: input.scope.scopeType, id: input.scope.scopeId }
              : null,
        })
      ).id,
    })),

    unassign: managed.unassign.handler(async ({ context, input }) => {
      await removeAssignment({
        tenant: context.tenant,
        actorUserId: context.caller.userId,
        assignmentId: input.assignmentId,
      });
    }),
  });
}

export type RolesRouter = ReturnType<typeof createRolesRouter>;
