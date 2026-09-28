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
