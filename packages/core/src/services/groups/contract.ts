import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { AssignableRole, GroupDetail, GroupRow } from "./index.ts";

const groupId = z.object({ groupId: z.uuid() });

const memberIds = z.array(z.string().min(1)).min(1);

/** The answer of a write that creates a row: its id. */
const created = z.custom<{ readonly id: string }>();

/**
 * The Groups screen's API (R-37, ADR 0011), under core's `/groups/` area. It imports only zod and
 * the browser-safe `@genie/core/rpc` entry, so the browser client types its calls from it. A
 * directory group and a local group are written through their own paths, because the service
 * refuses a write meant for the other kind. Answers are typed from the service with `z.custom`,
 * which checks nothing at run time: the service builds them, so a schema would only repeat the
 * type.
 */
export const groupsContract = {
  list: oc
    .route({ method: "GET", path: "/groups/list" })
    .input(z.object({ includeArchived: z.boolean().default(false) }))
    .output(z.custom<readonly GroupRow[]>()),

  get: oc
    .route({ method: "GET", path: "/groups/{groupId}" })
    .input(groupId)
    .output(z.custom<GroupDetail>()),

  // The roles a group can be given, for the inspector's assign step (R-24b).
  assignableRoles: oc
    .route({ method: "GET", path: "/groups/assignable-roles" })
    .output(z.custom<readonly AssignableRole[]>()),

  assignRole: oc
    .route({ method: "POST", path: "/groups/{groupId}/assignments" })
    .input(z.object({ groupId: z.uuid(), roleId: z.uuid() }))
    .output(created),

  unassign: oc
    .route({
      method: "DELETE",
      path: "/groups/{groupId}/assignments/{assignmentId}",
    })
    .input(z.object({ groupId: z.uuid(), assignmentId: z.uuid() })),

  addDirectoryGroup: oc
    .route({ method: "POST", path: "/groups/directory" })
    .input(
      z.object({
        externalId: z.string().min(1).max(1024),
        displayLabel: z.string().max(200).nullish(),
      })
    )
    .output(created),

  deleteDirectoryGroup: oc
    .route({ method: "DELETE", path: "/groups/directory/{groupId}" })
    .input(groupId),

  archiveDirectoryGroup: oc
    .route({ method: "POST", path: "/groups/directory/{groupId}/archive" })
    .input(groupId),

  // The display label is the one field of a directory group a person edits.
  editLabel: oc
    .route({ method: "PATCH", path: "/groups/directory/{groupId}" })
    .input(
      z.object({
        groupId: z.uuid(),
        displayLabel: z.string().max(200).nullable(),
      })
    ),

  createLocalGroup: oc
    .route({ method: "POST", path: "/groups/local" })
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
      })
    )
    .output(created),

  updateLocalGroup: oc
    .route({ method: "PATCH", path: "/groups/local/{groupId}" })
    .input(
      z.object({
        groupId: z.uuid(),
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
      })
    ),

  deleteLocalGroup: oc
    .route({ method: "DELETE", path: "/groups/local/{groupId}" })
    .input(groupId),

  addMembers: oc
    .route({ method: "POST", path: "/groups/local/{groupId}/members" })
    .input(z.object({ groupId: z.uuid(), userIds: memberIds })),

  removeMembers: oc
    .route({ method: "DELETE", path: "/groups/local/{groupId}/members" })
    .input(z.object({ groupId: z.uuid(), userIds: memberIds })),

  removeAllMembers: oc
    .route({ method: "DELETE", path: "/groups/local/{groupId}/members/all" })
    .input(groupId),
};

export type GroupsContract = typeof groupsContract;
