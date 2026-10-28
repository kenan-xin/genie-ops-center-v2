import { configValueSchema } from "@genie/ui/config-form-schema";
import { z } from "zod";

import { oc } from "../../lib/rpc/index.ts";
import type { SettingsView } from "./index.ts";

/** A module id is the text a declaration carries, not a uuid. */
const moduleId = z.string().min(1).max(200);

const saved = z.custom<{ readonly changed: boolean }>();

/**
 * The Tenant Settings API (R-72 to R-80), under core's `/settings/` area. Save inputs check shape
 * only; the service parses with the strict schemas above or the module's own schema, so a refusal
 * carries `settings-invalid` with its issues. Answers are typed from the service with `z.custom`.
 * A save sends only the fields the person changed; a module field sent as null is cleared (admin M-1).
 */
export const settingsContract = {
  read: oc
    .route({ method: "GET", path: "/settings" })
    .output(z.custom<SettingsView>()),

  saveSignIn: oc
    .route({ method: "PATCH", path: "/settings/sign-in" })
    .input(
      z.object({
        onboardingMode: z.string().optional(),
        localAccountsEnabled: z.boolean().optional(),
      })
    )
    .output(saved),

  saveSessions: oc
    .route({ method: "PATCH", path: "/settings/sessions" })
    .input(z.object({ sessionIdleMinutes: z.number() }))
    .output(saved),

  saveReporting: oc
    .route({ method: "PATCH", path: "/settings/reporting" })
    .input(z.object({ reportingDate: z.string().nullable() }))
    .output(saved),

  // The allowed models and the two defaults (R-18). The service parses them with the strict schema.
  saveModels: oc
    .route({ method: "PATCH", path: "/settings/ai/models" })
    .input(
      z.object({
        allowedModels: z.array(z.string()),
        chatModel: z.string(),
        documentModel: z.string(),
      })
    )
    .output(saved),

  saveModule: oc
    .route({ method: "PATCH", path: "/settings/modules/{moduleId}" })
    .input(
      z.object({
        moduleId,
        values: z.record(z.string(), configValueSchema.nullable()),
      })
    )
    .output(saved),

  // The write-only model provider key (R-17). `apiKey` is a name the logger redacts.
  saveModelKey: oc
    .route({ method: "PUT", path: "/settings/ai/key" })
    .input(z.object({ apiKey: z.string() }))
    .output(saved),

  removeModelKey: oc
    .route({ method: "DELETE", path: "/settings/ai/key" })
    .output(saved),
};

export type SettingsContract = typeof settingsContract;
