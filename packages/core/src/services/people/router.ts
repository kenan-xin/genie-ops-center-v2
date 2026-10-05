import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireAuthenticated } from "../../lib/entitlement/module-trpc.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { can, type RequestPrincipal } from "../authorization/index.ts";
import {
  addPerson,
  disablePerson,
  enablePerson,
  listActivePeople,
  listAssignableRoles,
  listPeople,
  readPerson,
  removePerson,
  resendInvitation,
  resendSetPassword,
} from "./index.ts";

/**
 * What a people procedure reads: the one tenant context and the request's own principal. Every
 * procedure is behind `core:people:manage` through the one `can()` seam (DEC-39, R-37).
 */
export type PeopleRouterContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

const MANAGE_PERMISSION = "core:people:manage";

const t = initTRPC.context<PeopleRouterContext>().create();

// The session check runs before `.input()` parses, so an anonymous, idle-expired or capped request
// answers the catalogue `unauthenticated` at 401 however malformed its input is; only then does the
// permission gate call `can()` and the resolver read (Spec 2 R-14, R-37).
const sessionGate = t.middleware(({ ctx, next }) => {
  requireAuthenticated(ctx.caller);

  return next();
});

const manage = t.middleware(async ({ ctx, next }) => {
  if (!(await can(ctx.caller, MANAGE_PERMISSION))) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next();
});

const procedure = t.procedure.use(sessionGate).use(manage);

/**
 * The narrow active-people read the Groups screen's local-member picker uses. It stays behind
 * `core:groups:manage`, because a holder of that key and not `core:people:manage` may still edit a
 * local group's members; the People router owns the read so it is defined once (S2-10).
 */
const groupsManage = t.middleware(async ({ ctx, next }) => {
  if (!(await can(ctx.caller, "core:groups:manage"))) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next();
});

const pickerProcedure = t.procedure.use(sessionGate).use(groupsManage);

const personId = z.object({ personId: z.string().min(1) });

/**
 * The People screen's one router (R-37). The screen reads and writes only through it. Every writer
 * re-checks R-38 on the server through the one administrator guard, and every role assignment goes
 * through the one role-assignment service (DEC-39, R-40).
 */
export function createPeopleRouter() {
  return t.router({
    list: procedure.query(({ ctx }) => listPeople(ctx.tenant)),

    // The local-group member picker's people: a narrow read behind `core:groups:manage` (R-39),
    // owned here so the groups router no longer duplicates it.
    active: pickerProcedure.query(({ ctx }) => listActivePeople(ctx.tenant)),

    get: procedure.input(personId).query(async ({ ctx, input }) => {
      const found = await readPerson(ctx.tenant, input.personId);

      if (found === undefined) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return found;
    }),

    // The roles Add person may assign now, from the same catalogue the Roles screen reads.
    assignableRoles: procedure.query(({ ctx }) =>
      listAssignableRoles(ctx.tenant)
    ),

    add: procedure
      .input(
        z.object({
          email: z.string().min(1).max(320),
          name: z.string().max(200).optional(),
          roleIds: z.array(z.uuid()).default([]),
          accountType: z.enum(["brokered", "local"]).optional(),
          sendInvitation: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => ({
        id: await addPerson(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          email: input.email,
          name: input.name,
          roleIds: input.roleIds,
          accountType: input.accountType,
          sendInvitation: input.sendInvitation,
        }),
      })),

    disable: procedure.input(personId).mutation(async ({ ctx, input }) => {
      await disablePerson(ctx.tenant, {
        actorUserId: ctx.caller.userId,
        personId: input.personId,
      });
    }),

    enable: procedure.input(personId).mutation(async ({ ctx, input }) => {
      await enablePerson(ctx.tenant, {
        actorUserId: ctx.caller.userId,
        personId: input.personId,
      });
    }),

    remove: procedure.input(personId).mutation(async ({ ctx, input }) => {
      await removePerson(ctx.tenant, {
        actorUserId: ctx.caller.userId,
        personId: input.personId,
      });
    }),

    resendSetPassword: procedure
      .input(personId)
      .mutation(async ({ ctx, input }) => {
        await resendSetPassword(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          personId: input.personId,
        });
      }),

    resendInvitation: procedure
      .input(personId)
      .mutation(async ({ ctx, input }) => {
        await resendInvitation(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          personId: input.personId,
        });
      }),
  });
}

export type PeopleRouter = ReturnType<typeof createPeopleRouter>;
