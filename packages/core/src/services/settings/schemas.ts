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

/**
 * The characters a model provider key may hold: printable ASCII without spaces, so it fits an
 * `authorization` header. The model request guard checks the stored key with the same pattern.
 */
export const MODEL_KEY_PATTERN = /^[\x21-\x7e]+$/;

/** The model provider key (R-17). An empty field never reaches here: the screen keeps the stored key. */
export const modelKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, {
      error: "Enter the key, or leave the field empty to keep the stored key.",
      abort: true,
    })
    .regex(MODEL_KEY_PATTERN, {
      error:
        "The key holds a character that a key cannot hold. Paste the key again.",
    }),
});

/** The model id rule (R-18): author/model, with an optional `:variant` suffix. */
const MODEL_ID = /^[\w.~-]+\/[\w.~-]+(?::[\w.~-]+)?$/;

/**
 * The model settings (R-18). The allowed list and both defaults are checked together, so one
 * schema serves the browser and the server: one rule, one text.
 */
export const modelSettingsSchema = z
  .object({
    allowedModels: z.array(z.string()),
    chatModel: z.string(),
    documentModel: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.allowedModels.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedModels"],
        message: "Add at least one model.",
      });

      return;
    }

    if (!values.allowedModels.every((id) => MODEL_ID.test(id))) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedModels"],
        message: "Enter one model id per line, as author/model.",
      });

      return;
    }

    for (const path of ["chatModel", "documentModel"] as const)
      if (!values.allowedModels.includes(values[path]))
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Choose a model from the allowed models.",
        });
  });
