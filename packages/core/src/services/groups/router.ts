import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import { can } from "../authorization/index.ts";
import {
  assignRole,
  removeAssignment,
} from "../authorization/role-assignment.ts";
import { groupsContract } from "./contract.ts";
import {
  addDirectoryGroup,
  addLocalGroupMembers,
  archiveDirectoryGroup,
  createLocalGroup,
  deleteDirectoryGroup,
  deleteLocalGroup,
  listAssignableRoles,
  listGroups,
  readGroup,
  removeAllLocalGroupMembers,
  removeLocalGroupMembers,
  setGroupLabel,
  updateLocalGroup,
} from "./index.ts";

const ASSIGN_PERMISSION = "core:roles:manage";

// The session check, then the permission gate, both before input is parsed: an anonymous,
// idle-expired or capped request answers `unauthenticated` at 401 and a caller without the key
// `forbidden` at 403, however malformed the input is; only then does the handler read
// (Spec 2 R-14, R-37).
const managed = gatedArea(groupsContract, "core:groups:manage");

/**
 * A role-assignment write is a grant edit, which the design puts behind `core:roles:manage`
 * (DEC-39, the Access screen). The Groups screen may edit its own group's grants only for a caller
 * that also holds that key; a holder of only `core:groups:manage` cannot change any assignment.
 */
const assigning = managed.use(async ({ context, next }) => {
  if (!(await can(context.caller, ASSIGN_PERMISSION))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  return next();
});

/**
 * The Groups screen's one router (R-37), built from its contract. Every procedure is behind
 * `core:groups:manage` through the one `can()` seam (DEC-39). The screen reads and writes only
 * through it, and every writer records a catalogue audit action.
 */
export function createGroupsRouter() {
  return managed.router({
    list: managed.list.handler(({ context, input }) =>
      listGroups(context.tenant, { includeArchived: input.includeArchived })
    ),

    get: managed.get.handler(async ({ context, input }) => {
      const found = await readGroup(context.tenant, input.groupId);

      if (found === undefined) {
        throw new AppError(CORE_ERRORS["not-found"]);
      }

      return found;
    }),

    assignableRoles: managed.assignableRoles.handler(({ context }) =>
      listAssignableRoles(context.tenant)
    ),

    // Assignment goes through the one role-assignment service, so the R-38 guard and the
    // core:role:granted event have one writer (DEC-39, R-47). It needs core:roles:manage, and the
    // removal checks the assignment belongs to this group in the same transaction.
    assignRole: assigning.assignRole.handler(async ({ context, input }) => ({
      id: (
        await assignRole({
          tenant: context.tenant,
          actorUserId: context.caller.userId,
          roleId: input.roleId,
          principal: { type: "group", id: input.groupId },
          scope: null,
        })
      ).id,
    })),

    unassign: assigning.unassign.handler(async ({ context, input }) => {
      await removeAssignment({
        tenant: context.tenant,
        actorUserId: context.caller.userId,
        assignmentId: input.assignmentId,
        expect: { type: "group", id: input.groupId },
      });
    }),

    addDirectoryGroup: managed.addDirectoryGroup.handler(
      async ({ context, input }) => ({
        id: await addDirectoryGroup(context.tenant, {
          actorUserId: context.caller.userId,
          externalId: input.externalId,
          displayLabel: input.displayLabel ?? null,
        }),
      })
    ),

    deleteDirectoryGroup: managed.deleteDirectoryGroup.handler(
      async ({ context, input }) => {
        await deleteDirectoryGroup(context.tenant, {
          actorUserId: context.caller.userId,
          groupId: input.groupId,
        });
      }
    ),

    archiveDirectoryGroup: managed.archiveDirectoryGroup.handler(
      async ({ context, input }) => {
        await archiveDirectoryGroup(context.tenant, {
          actorUserId: context.caller.userId,
          groupId: input.groupId,
        });
      }
    ),

    editLabel: managed.editLabel.handler(async ({ context, input }) => {
      await setGroupLabel(context.tenant, {
        actorUserId: context.caller.userId,
        groupId: input.groupId,
        displayLabel: input.displayLabel,
      });
    }),

    createLocalGroup: managed.createLocalGroup.handler(
      async ({ context, input }) => ({
        id: await createLocalGroup(context.tenant, {
          actorUserId: context.caller.userId,
          name: input.name,
          description: input.description,
        }),
      })
    ),

    updateLocalGroup: managed.updateLocalGroup.handler(
      async ({ context, input }) => {
        await updateLocalGroup(context.tenant, {
          actorUserId: context.caller.userId,
          groupId: input.groupId,
          name: input.name,
          description: input.description,
        });
      }
    ),

    deleteLocalGroup: managed.deleteLocalGroup.handler(
      async ({ context, input }) => {
        await deleteLocalGroup(context.tenant, {
          actorUserId: context.caller.userId,
          groupId: input.groupId,
        });
      }
    ),

    addMembers: managed.addMembers.handler(async ({ context, input }) => {
      await addLocalGroupMembers(context.tenant, {
        actorUserId: context.caller.userId,
        groupId: input.groupId,
        userIds: input.userIds,
      });
    }),

    removeMembers: managed.removeMembers.handler(async ({ context, input }) => {
      await removeLocalGroupMembers(context.tenant, {
        actorUserId: context.caller.userId,
        groupId: input.groupId,
        userIds: input.userIds,
      });
    }),

    removeAllMembers: managed.removeAllMembers.handler(
      async ({ context, input }) => {
        await removeAllLocalGroupMembers(context.tenant, {
          actorUserId: context.caller.userId,
          groupId: input.groupId,
        });
      }
    ),
  });
}

export type GroupsRouter = ReturnType<typeof createGroupsRouter>;
