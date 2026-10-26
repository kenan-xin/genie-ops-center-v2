import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import {
  gatedArea,
  implementCoreArea,
} from "../../lib/rpc/implement-core-area.ts";
import { can } from "../authorization/index.ts";
import { peopleContract } from "./contract.ts";
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
 * Picking roles in Add person is a grant edit, which the design puts behind `core:roles:manage`
 * (DEC-39, the Access screen). A holder of only `core:people:manage` may add a person but not give
 * them a role; the screen hides the picker for them and the server refuses roles in the input.
 */
const ASSIGN_PERMISSION = "core:roles:manage";

// The session check, then the permission gate, both before input is parsed: an anonymous,
// idle-expired or capped request answers `unauthenticated` at 401 and a caller without the key
// `forbidden` at 403, however malformed the input is; only then does the handler read
// (Spec 2 R-14, R-37).
// The router itself carries only the session check, because the picker read has its own gate.
const os = implementCoreArea(peopleContract);

const managed = gatedArea(peopleContract, "core:people:manage");

/**
 * The narrow active-people read the Groups screen's local-member picker uses. It stays behind
 * `core:groups:manage`, because a holder of that key and not `core:people:manage` may still edit a
 * local group's members; the People router owns the read so it is defined once (S2-10).
 */
const picker = gatedArea(peopleContract, "core:groups:manage");

/**
 * The People screen's one router (R-37), built from its contract. Every procedure but the picker
 * read is behind `core:people:manage` through the one `can()` seam (DEC-39). The screen reads and
 * writes only through it. Every writer re-checks R-38 on the server through the one administrator
 * guard, and every role assignment goes through the one role-assignment service (DEC-39, R-40).
 */
export function createPeopleRouter() {
  return os.router({
    list: managed.list.handler(({ context }) => listPeople(context.tenant)),

    active: picker.active.handler(({ context }) =>
      listActivePeople(context.tenant)
    ),

    get: managed.get.handler(async ({ context, input }) => {
      const found = await readPerson(context.tenant, input.personId);

      if (found === undefined) {
        throw new AppError(CORE_ERRORS["not-found"]);
      }

      return found;
    }),

    assignableRoles: managed.assignableRoles.handler(({ context }) =>
      listAssignableRoles(context.tenant)
    ),

    // `canAssignRoles` hides the Add person role picker for a holder of `core:people:manage`
    // alone, matching the server's refusal (DEC-39).
    capabilities: managed.capabilities.handler(async ({ context }) => ({
      canAssignRoles: await can(context.caller, ASSIGN_PERMISSION),
    })),

    add: managed.add.handler(async ({ context, input }) => {
      if (
        input.roleIds.length > 0 &&
        !(await can(context.caller, ASSIGN_PERMISSION))
      ) {
        throw new AppError(CORE_ERRORS.forbidden);
      }

      return addPerson(context.tenant, {
        actorUserId: context.caller.userId,
        email: input.email,
        name: input.name,
        roleIds: input.roleIds,
        accountType: input.accountType,
        sendInvitation: input.sendInvitation,
      });
    }),

    disable: managed.disable.handler(async ({ context, input }) => {
      await disablePerson(context.tenant, {
        actorUserId: context.caller.userId,
        personId: input.personId,
      });
    }),

    enable: managed.enable.handler(async ({ context, input }) => {
      await enablePerson(context.tenant, {
        actorUserId: context.caller.userId,
        personId: input.personId,
      });
    }),

    remove: managed.remove.handler(async ({ context, input }) => {
      await removePerson(context.tenant, {
        actorUserId: context.caller.userId,
        personId: input.personId,
      });
    }),

    resendSetPassword: managed.resendSetPassword.handler(
      async ({ context, input }) => {
        await resendSetPassword(context.tenant, {
          actorUserId: context.caller.userId,
          personId: input.personId,
        });
      }
    ),

    resendInvitation: managed.resendInvitation.handler(
      async ({ context, input }) => {
        await resendInvitation(context.tenant, {
          actorUserId: context.caller.userId,
          personId: input.personId,
        });
      }
    ),
  });
}

export type PeopleRouter = ReturnType<typeof createPeopleRouter>;
