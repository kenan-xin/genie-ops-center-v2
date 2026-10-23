import { z } from "zod";

/**
 * The strict schemas of the two core sections. They import only zod, so the screen validates with
 * them in the browser and the service parses with them on the server: one rule, one text.
 */
const IDLE_MESSAGE = "Enter a whole number from 5 to 480.";

/** Sign-in & accounts (R-74). */
export const signInSettingsSchema = z.object({
  onboardingMode: z.enum(["invite", "jit"]),
  localAccountsEnabled: z.boolean(),
});

/** Sessions (R-73): 5 to 480 whole minutes. */
export const sessionSettingsSchema = z.object({
  sessionIdleMinutes: z
    .number({ error: IDLE_MESSAGE })
    .int({ error: IDLE_MESSAGE })
    .min(5, { error: IDLE_MESSAGE })
    .max(480, { error: IDLE_MESSAGE }),
});
