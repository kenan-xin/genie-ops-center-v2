import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { can, type RequestPrincipal } from "../authorization/index.ts";
import {
  addDirectoryGroup,
  addLocalGroupMembers,
  archiveDirectoryGroup,
  createLocalGroup,
  deleteDirectoryGroup,
  deleteLocalGroup,
  listGroups,
  readGroup,
  removeAllLocalGroupMembers,
  removeLocalGroupMembers,
  setGroupLabel,
  updateLocalGroup,
} from "./index.ts";

/**
 * What a groups procedure reads: the one tenant context and the request's own principal. Every
 * procedure is behind `core:groups:manage` through the one `can()` seam (DEC-39, R-37).
 */
export type GroupsRouterContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

const MANAGE_PERMISSION = "core:groups:manage";

const t = initTRPC.context<GroupsRouterContext>().create();

const manage = t.middleware(async ({ ctx, next }) => {
  if (!(await can(ctx.caller, MANAGE_PERMISSION))) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next();
});

const procedure = t.procedure.use(manage);

const groupId = z.object({ groupId: z.uuid() });

const memberIds = z.array(z.string().min(1)).min(1);

/**
 * The Groups screen's one router (R-37). The screen reads and writes only through it, and every
 * writer records a catalogue audit action. Role assignments are not written here: this screen
 * reads who holds what and links to Access, which owns the one assignment service (DEC-39).
 */
export function createGroupsRouter() {
  return t.router({
    list: procedure
      .input(z.object({ includeArchived: z.boolean().default(false) }))
      .query(({ ctx, input }) =>
        listGroups(ctx.tenant, { includeArchived: input.includeArchived })
      ),

    get: procedure.input(groupId).query(async ({ ctx, input }) => {
      const found = await readGroup(ctx.tenant, input.groupId);

      if (found === undefined) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return found;
    }),

    addDirectoryGroup: procedure
      .input(
        z.object({
          externalId: z.string().min(1).max(1024),
          displayLabel: z.string().max(200).nullish(),
        })
      )
      .mutation(async ({ ctx, input }) => ({
        id: await addDirectoryGroup(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          externalId: input.externalId,
          displayLabel: input.displayLabel ?? null,
        }),
      })),

    deleteDirectoryGroup: procedure
      .input(groupId)
      .mutation(async ({ ctx, input }) => {
        await deleteDirectoryGroup(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
        });
      }),

    archiveDirectoryGroup: procedure
      .input(groupId)
      .mutation(async ({ ctx, input }) => {
        await archiveDirectoryGroup(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
        });
      }),

    editLabel: procedure
      .input(
        z.object({
          groupId: z.uuid(),
          displayLabel: z.string().max(200).nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await setGroupLabel(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
          displayLabel: input.displayLabel,
        });
      }),

    createLocalGroup: procedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => ({
        id: await createLocalGroup(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          name: input.name,
          description: input.description,
        }),
      })),

    updateLocalGroup: procedure
      .input(
        z.object({
          groupId: z.uuid(),
          name: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateLocalGroup(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
          name: input.name,
          description: input.description,
        });
      }),

    deleteLocalGroup: procedure
      .input(groupId)
      .mutation(async ({ ctx, input }) => {
        await deleteLocalGroup(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
        });
      }),

    addMembers: procedure
      .input(z.object({ groupId: z.uuid(), userIds: memberIds }))
      .mutation(async ({ ctx, input }) => {
        await addLocalGroupMembers(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
          userIds: input.userIds,
        });
      }),

    removeMembers: procedure
      .input(z.object({ groupId: z.uuid(), userIds: memberIds }))
      .mutation(async ({ ctx, input }) => {
        await removeLocalGroupMembers(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
          userIds: input.userIds,
        });
      }),

    removeAllMembers: procedure
      .input(groupId)
      .mutation(async ({ ctx, input }) => {
        await removeAllLocalGroupMembers(ctx.tenant, {
          actorUserId: ctx.caller.userId,
          groupId: input.groupId,
        });
      }),
  });
}

export type GroupsRouter = ReturnType<typeof createGroupsRouter>;
