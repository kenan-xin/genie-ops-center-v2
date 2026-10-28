import { z } from "zod";

/**
 * The strict schemas of the three core sections. They import only zod, so the screen validates
 * with them in the browser and the service parses with them on the server: one rule, one text.
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

/** Reporting (R-9): a whole date, or null for today in the tenant's default time zone. */
export const reportingSettingsSchema = z.object({
  reportingDate: z.iso
    .date({ error: "Enter a whole date, or clear the field to use today." })
    .nullable(),
});
