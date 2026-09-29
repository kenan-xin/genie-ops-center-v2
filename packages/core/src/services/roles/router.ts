import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { can, type RequestPrincipal } from "../authorization/index.ts";
import {
  assignRole,
  removeAssignment,
} from "../authorization/role-assignment.ts";
import {
  copyRole,
  createRole,
  deleteRole,
  listRoles,
  readRole,
  updateRole,
  type RolesModule,
} from "./index.ts";

/**
 * What a roles procedure reads: the one tenant context and the request's own principal. Every
 * procedure is behind `core:roles:manage` through the one `can()` seam (DEC-39, R-37).
 */
export type RolesRouterContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

const MANAGE_PERMISSION = "core:roles:manage";

const t = initTRPC.context<RolesRouterContext>().create();

const manage = t.middleware(async ({ ctx, next }) => {
  if (!(await can(ctx.caller, MANAGE_PERMISSION))) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next();
});

const procedure = t.procedure.use(manage);

const permissions = z.array(z.string().min(1).max(200));

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
 * The Roles screen's one router (R-37). It edits role definitions and, through the one
 * role-assignment service, writes grants; the Access screen and Add person reuse the same
 * service, so `role_assignment` has exactly one writer (DEC-39). Every write records a catalogue
 * audit action.
 */
export function createRolesRouter(modules: readonly RolesModule[]) {
  return t.router({
    list: procedure.query(({ ctx }) => listRoles(ctx.tenant, modules)),

    get: procedure
      .input(z.object({ roleId: z.uuid() }))
      .query(async ({ ctx, input }) => {
        const found = await readRole(ctx.tenant, input.roleId, modules);

        if (found === undefined) throw new TRPCError({ code: "NOT_FOUND" });

        return found;
      }),

    create: procedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
          permissions,
        })
      )
      .mutation(async ({ ctx, input }) => ({
        id: await createRole(ctx.tenant, modules, {
          actorUserId: ctx.caller.userId,
          name: input.name,
          description: input.description,
          permissions: input.permissions,
        }),
      })),

    copy: procedure
      .input(z.object({ roleId: z.uuid(), name: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => ({
        id: await copyRole(ctx.tenant, modules, {
          actorUserId: ctx.caller.userId,
          roleId: input.roleId,
          name: input.name,
        }),
      })),

    update: procedure
      .input(
        z.object({
          roleId: z.uuid(),
          name: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
          permissions,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateRole(ctx.tenant, modules, {
          actorUserId: ctx.caller.userId,
          roleId: input.roleId,
          name: input.name,
          description: input.description,
          permissions: input.permissions,
        });
      }),

    remove: procedure
      .input(z.object({ roleId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        await deleteRole(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          roleId: input.roleId,
        });
      }),

    assign: procedure
      .input(
        z.object({
          roleId: z.uuid(),
          principalType: z.enum(["user", "group"]),
          principalId: z.string().min(1).max(200),
          scope: scope.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => ({
        id: (
          await assignRole({
            tenant: ctx.tenant,
            actorUserId: ctx.caller.userId,
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

    unassign: procedure
      .input(z.object({ assignmentId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        await removeAssignment({
          tenant: ctx.tenant,
          actorUserId: ctx.caller.userId,
          assignmentId: input.assignmentId,
        });
      }),
  });
}

export type RolesRouter = ReturnType<typeof createRolesRouter>;
