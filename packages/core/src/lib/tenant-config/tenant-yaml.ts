import { z } from "zod";

import { genieStudioUrlProblem } from "./genie-studio.ts";

/** Kebab-case, and never `core`, which names core's own keys and ledger (R-33c). */
const MODULE_ID = /^(?!core$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Every field here is read by the generator or by `genie-ops setup`. A value nothing reads is not
 * configuration and is not written here (DEC-35). Branding lives in branding.seed.json, the
 * hosting mode lives in the customer runbook, and the slug is the folder name.
 *
 * `onboarding_mode` and `local_accounts` are optional: the `seed` step omits an absent value and
 * the `tenant_settings` column default applies (`invite`, `false`), so the default lives in one
 * place and not here (R-78, DEC-35). `realm` is optional the same way: an absent value lets the
 * column default `managed` apply (R-54a). A `realm` of `customer` (client-only mode, ADR 0010)
 * cannot share a file with `local_accounts: true`, because customer mode has no realm to hold
 * local accounts (R-54a). `genie_studio_url` is optional and, when set, carries the genie-studio
 * deployment's origin that the managed realm fills into its client (R-49a, R-53); an unset value
 * leaves that client with no redirect URIs, as it was before the field existed.
 */
export const tenantYamlSchema = z
  .strictObject({
    modules: z.array(
      z.string().regex(MODULE_ID, "a module id is kebab-case and not core")
    ),
    realm: z.enum(["managed", "customer"]).optional(),
    onboarding_mode: z.enum(["invite", "jit"]).optional(),
    local_accounts: z.boolean().optional(),
    genie_studio_url: z
      .url({ protocol: /^https?$/ })
      .superRefine((value, ctx) => {
        const problem = genieStudioUrlProblem(value);

        if (problem !== undefined) {
          ctx.addIssue({ code: "custom", message: problem });
        }
      })
      .optional(),
    first_administrators: z.array(z.email()).min(1),
    break_glass_email: z.email(),
  })
  .superRefine((value, ctx) => {
    if (value.realm === "customer" && value.local_accounts === true) {
      ctx.addIssue({
        code: "custom",
        path: ["realm"],
        message: "realm: customer cannot be used with local_accounts: true",
      });
    }
  });

export type TenantYaml = z.infer<typeof tenantYamlSchema>;
