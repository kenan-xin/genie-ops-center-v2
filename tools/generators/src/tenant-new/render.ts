import {
  brandingSeedSchema,
  tenantYamlSchema,
} from "@genie/core/tenant-config";

import {
  envExample,
  realmOverrides,
  stackCompose,
  helmValues,
} from "./templates.ts";

/**
 * A customer's slug names its folder, so it must be safe in a path and stable in a
 * URL. Same spelling as a module id: lower case, digits and single hyphens.
 */
const SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export type TenantRenderInput = {
  readonly slug: string;
  readonly modules: readonly string[];
  /** Checked by the core schema, which owns the documented set, not a copy of it here. */
  readonly onboardingMode: string;
  readonly localAccounts: boolean;
  readonly firstAdministrators: readonly string[];
  readonly breakGlassEmail: string;
  readonly companyName: string;
  readonly productName: string;
  readonly defaultLocale: string;
  readonly defaultTimeZone: string;
};

/** Exactly what `tenant.yaml` holds. */
export type TenantYamlFile = {
  readonly modules: readonly string[];
  readonly onboarding_mode: string;
  readonly local_accounts: boolean;
  readonly first_administrators: readonly string[];
  readonly break_glass_email: string;
};

/** Exactly what a generated `branding.seed.json` holds, before its editor key. */
export type BrandingSeedFile = {
  readonly company_name: string;
  readonly product_name: string;
  readonly default_locale: string;
  readonly default_time_zone: string;
};

/** Either of the two files a strict core schema validates. */
export type ConfigurationFile = TenantYamlFile | BrandingSeedFile;

/**
 * What the renderer needs from a strict schema: an answer, and a message when the
 * answer is no.
 *
 * The authoritative schemas are `tenantYamlSchema` and `brandingSeedSchema` in
 * `packages/core/src/lib/tenant-config/` (R-31, DEC-35), and `CORE_VALIDATORS`
 * below binds exactly those as the default. The parameter stays because a test of
 * this renderer must be able to drive the seam without the schemas under test,
 * and because copying a schema here would create a second source of truth for
 * what a customer may write. A zod schema satisfies this type as it stands, with
 * no adapter at the call site.
 */
export type StrictSchema = {
  safeParse(value: ConfigurationFile): {
    readonly success: boolean;
    readonly error?: unknown;
  };
};

export type TenantValidators = {
  readonly tenantYaml: StrictSchema;
  readonly brandingSeed: StrictSchema;
};

/** Exactly the keys `tenant.yaml` owns. Branding belongs to the other file (DEC-35). */
export function buildTenantYaml(input: TenantRenderInput): TenantYamlFile {
  return {
    modules: [...input.modules],
    onboarding_mode: input.onboardingMode,
    local_accounts: input.localAccounts,
    first_administrators: [...input.firstAdministrators],
    break_glass_email: input.breakGlassEmail,
  };
}

/**
 * The four values the branding contract requires, and nothing else
 * (`docs/architecture/branding-seed.md`). Every other column is optional there,
 * and an omitted column is the one mechanism the contract gives an author, so the
 * generator writes no default, no explicit null and no derived column.
 */
export function buildBrandingSeed(input: TenantRenderInput): BrandingSeedFile {
  return {
    company_name: input.companyName,
    product_name: input.productName,
    default_locale: input.defaultLocale,
    default_time_zone: input.defaultTimeZone,
  };
}

/**
 * The strict schemas core owns, which are the default. R-7a exposes exactly this
 * entrypoint to tooling: importing it parses no environment value and starts no
 * service. A caller may still pass its own, which is how a test drives the seam
 * without the schemas under test.
 */
export const CORE_VALIDATORS: TenantValidators = {
  tenantYaml: tenantYamlSchema,
  brandingSeed: brandingSeedSchema,
};

function check(
  file: string,
  schema: StrictSchema,
  value: ConfigurationFile
): void {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(
      `${file} is not valid: ${JSON.stringify(result.error ?? "refused")}`
    );
  }
}

/**
 * One YAML list, written as a block, or the empty flow list. A quoted scalar keeps
 * a value such as `en` or an address from being read as anything but a string.
 */
function list(values: readonly string[]): string {
  return values.length === 0
    ? " []"
    : `\n${values.map((value) => `  - ${JSON.stringify(value)}`).join("\n")}`;
}

/**
 * The five fields of `tenant.yaml`, written out one by one rather than walked as a
 * dictionary, so the file's shape stays readable and every value keeps its type.
 */
function tenantYamlBody(tenant: TenantYamlFile): string {
  return [
    `modules:${list(tenant.modules)}`,
    `onboarding_mode: ${JSON.stringify(tenant.onboarding_mode)}`,
    `local_accounts: ${String(tenant.local_accounts)}`,
    `first_administrators:${list(tenant.first_administrators)}`,
    `break_glass_email: ${JSON.stringify(tenant.break_glass_email)}`,
  ].join("\n");
}

/** The seed file as it is written: the editor key first, then the seeded values. */
type BrandingSeedDocument = BrandingSeedFile & { readonly $schema: string };

function json(value: BrandingSeedDocument): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

/**
 * Renders a customer's seven deployment files as text, keyed by repository-relative
 * path (R-31). It writes nothing: a caller decides where the bytes go, so the same
 * function serves the generator, a test and a dry run.
 *
 * Both configuration files are validated as objects before any text is produced, so
 * a refused value fails the whole render rather than leaving a half-written folder.
 * The text is rendered from the same objects that were validated, so the two cannot
 * drift apart.
 */
export function renderTenant(
  input: TenantRenderInput,
  validators: TenantValidators = CORE_VALIDATORS
): ReadonlyMap<string, string> {
  if (!SLUG.test(input.slug)) {
    throw new Error(
      `"${input.slug}" is not a customer slug: a slug is lower case, digits and single hyphens, and starts with a letter`
    );
  }

  const tenant = buildTenantYaml(input);
  const branding = buildBrandingSeed(input);

  check("tenant.yaml", validators.tenantYaml, tenant);
  check("branding.seed.json", validators.brandingSeed, branding);

  const root = `customers/${input.slug}/deploy`;

  return new Map([
    [
      `${root}/tenant.yaml`,
      `# yaml-language-server: $schema=../../../deploy/schemas/tenant.schema.json\n` +
        `# Every field here is read by the generator or by \`genie-ops setup\`. Branding\n` +
        `# lives in branding.seed.json, and the hosting mode lives in the runbook (DEC-35).\n` +
        `${tenantYamlBody(tenant)}\n`,
    ],
    [`${root}/modules.txt`, tenant.modules.map((id) => `${id}\n`).join("")],
    [`${root}/realm.overrides.json`, realmOverrides(input)],
    [
      `${root}/branding.seed.json`,
      json({
        $schema: "../../../deploy/schemas/branding.seed.schema.json",
        ...branding,
      }),
    ],
    [`${root}/compose.yaml`, stackCompose(input)],
    [`${root}/.env.example`, envExample(input)],
    [`${root}/values.yaml`, helmValues(input)],
  ]);
}
