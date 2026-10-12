import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type {
  AddPersonResult,
  AssignablePerson,
  AssignableRole,
  PersonDetail,
  PersonRow,
} from "./index.ts";

const personId = z.object({ personId: z.string().min(1) });

/**
 * The People screen's API (R-37, ADR 0011), under core's `/people/` area. It imports only zod and
 * the browser-safe `@genie/core/rpc` entry, so the browser client types its calls from it. Answers
 * are typed from the service with `z.custom`, which checks nothing at run time: the service builds
 * them, so a schema would only repeat the type.
 */
export const peopleContract = {
  list: oc
    .route({ method: "GET", path: "/people" })
    .output(z.custom<readonly PersonRow[]>()),

  // The local-group member picker's people: a narrow read behind `core:groups:manage` (R-39).
  active: oc
    .route({ method: "GET", path: "/people/active" })
    .output(z.custom<readonly AssignablePerson[]>()),

  get: oc
    .route({ method: "GET", path: "/people/{personId}" })
    .input(personId)
    .output(z.custom<PersonDetail>()),

  // The roles Add person may assign now, from the same catalogue the Roles screen reads.
  assignableRoles: oc
    .route({ method: "GET", path: "/people/assignable-roles" })
    .output(z.custom<readonly AssignableRole[]>()),

  // What the screen may show this caller.
  capabilities: oc
    .route({ method: "GET", path: "/people/capabilities" })
    .output(z.object({ canAssignRoles: z.boolean() })),

  add: oc
    .route({ method: "POST", path: "/people" })
    .input(
      z.object({
        email: z.email().max(320),
        name: z.string().max(200).optional(),
        roleIds: z.array(z.uuid()).default([]),
        accountType: z.enum(["brokered", "local"]).optional(),
        sendInvitation: z.boolean().optional(),
      })
    )
    .output(z.custom<AddPersonResult>()),

  disable: oc
    .route({ method: "POST", path: "/people/{personId}/disable" })
    .input(personId),

  enable: oc
    .route({ method: "POST", path: "/people/{personId}/enable" })
    .input(personId),

  remove: oc
    .route({ method: "DELETE", path: "/people/{personId}" })
    .input(personId),

  resendSetPassword: oc
    .route({ method: "POST", path: "/people/{personId}/resend-set-password" })
    .input(personId),

  resendInvitation: oc
    .route({ method: "POST", path: "/people/{personId}/resend-invitation" })
    .input(personId),
};

export type PeopleContract = typeof peopleContract;
