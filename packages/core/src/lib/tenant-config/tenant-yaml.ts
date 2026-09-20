import { z } from "zod";

const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Every field here is read by the generator or by `genie-ops setup`. A value nothing reads is not
 * configuration and is not written here (DEC-35). Branding lives in branding.seed.json, the
 * hosting mode lives in the customer runbook, and the slug is the folder name.
 */
export const tenantYamlSchema = z.strictObject({
  modules: z.array(z.string().regex(MODULE_ID, "a module id is kebab-case")),
  onboarding_mode: z.enum(["invite", "jit"]),
  local_accounts: z.boolean(),
  first_administrators: z.array(z.email()).min(1),
  break_glass_email: z.email(),
});

export type TenantYaml = z.infer<typeof tenantYamlSchema>;
