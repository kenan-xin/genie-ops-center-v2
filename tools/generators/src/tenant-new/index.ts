/**
 * The `@genie/tenant:new <slug>` rendering contract (R-31).
 *
 * The Nx generator entry point that writes these bytes and passes the core schemas
 * in is not here yet; it arrives with workspace registration.
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
