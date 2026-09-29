import { z } from "zod";

/** An OAuth sign-in from a user agent absent from this person's earlier sign-in audit rows. */
export const coreSessionNew = {
  name: "core:session:new",
  version: 1,
  payload: z.object({
    userId: z.string(),
    email: z.email(),
    name: z.string(),
    deviceName: z.string(),
  }),
} as const;

/**
 * R-47: a role assignment reached this person. Fired on an assignment change, it sends the role
 * email and writes an in-app notification. `roleName` is the display name; the payload never
 * carries the permission keys, because the email says what changed, not what it grants.
 */
export const coreRoleGranted = {
  name: "core:role:granted",
  version: 1,
  payload: z.object({
    userId: z.string(),
    email: z.email(),
    name: z.string(),
    roleName: z.string(),
  }),
} as const;

/** R-47: a role assignment left this person. The counterpart of {@link coreRoleGranted}. */
export const coreRoleRevoked = {
  name: "core:role:revoked",
  version: 1,
  payload: z.object({
    userId: z.string(),
    email: z.email(),
    name: z.string(),
    roleName: z.string(),
  }),
} as const;
