/**
 * The `@genie/tenant:new <slug>` rendering contract (R-31).
 *
 * `generator.ts` beside this file is the Nx entry point that writes these bytes,
 * registered in `generators.json` as `nx g @genie/generators:tenant`.
 */

export {
  type BrandingSeedFile,
  type ConfigurationFile,
  type TenantYamlFile,
  buildBrandingSeed,
  buildTenantYaml,
  renderTenant,
  type StrictSchema,
  type TenantRenderInput,
  type TenantValidators,
} from "./render.ts";
