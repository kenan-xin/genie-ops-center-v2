import { describe, expect, it } from "vitest";

import { buildBrandingSeed, buildTenantYaml, renderTenant } from "./render.ts";
import type {
  ConfigurationFile,
  StrictSchema,
  TenantRenderInput,
} from "./render.ts";

const INPUT: TenantRenderInput = {
  slug: "demo-co",
  modules: ["placeholder"],
  onboardingMode: "invite",
  localAccounts: false,
  firstAdministrators: ["admin@example.com"],
  breakGlassEmail: "break-glass@example.com",
  companyName: "Demo Group",
  productName: "Demo Ops",
  defaultLocale: "en",
  defaultTimeZone: "Europe/Berlin",
};

/**
 * A stand-in for a core schema. The real strict schemas live in
 * `packages/core/src/lib/tenant-config/`, and this package cannot import them
 * until its manifest declares `@genie/core`, so the renderer takes them as a
 * parameter and these doubles prove the seam.
 */
function strictSchema(allowed: readonly string[]): StrictSchema {
  return {
    safeParse(value: ConfigurationFile) {
      const refused = Object.keys(value).filter(
        (key) => !allowed.includes(key)
      );

      return refused.length === 0
        ? { success: true }
        : { success: false, error: { message: `unknown key ${refused[0]}` } };
    },
  };
}

const TENANT_KEYS = [
  "modules",
  "onboarding_mode",
  "local_accounts",
  "first_administrators",
  "break_glass_email",
];

const BRANDING_KEYS = [
  "company_name",
  "product_name",
  "default_locale",
  "default_time_zone",
];

const VALIDATORS = {
  tenantYaml: strictSchema(TENANT_KEYS),
  brandingSeed: strictSchema(BRANDING_KEYS),
};

const files = renderTenant(INPUT, VALIDATORS);

function read(name: string): string {
  const content = files.get(`customers/demo-co/deploy/${name}`);

  if (content === undefined) {
    throw new Error(`the generator rendered no ${name}`);
  }

  return content;
}

describe("the rendered deployment folder", () => {
  it("holds the seven files and nothing else", () => {
    expect([...files.keys()].toSorted()).toEqual([
      "customers/demo-co/deploy/.env.example",
      "customers/demo-co/deploy/branding.seed.json",
      "customers/demo-co/deploy/compose.yaml",
      "customers/demo-co/deploy/modules.txt",
      "customers/demo-co/deploy/realm.overrides.json",
      "customers/demo-co/deploy/tenant.yaml",
      "customers/demo-co/deploy/values.yaml",
    ]);
  });

  it("writes no secret and no hosting mode", () => {
    for (const [path, content] of files) {
      expect(content, path).not.toMatch(/hosting_mode/);
      // A reference to a variable the deployment supplies is not a secret, so
      // every `${...}` reference is removed before the text is searched. What
      // remains must never put a literal value after a secret-shaped key.
      const literal = content.replaceAll(/\$\{[^}]*\}/g, "");

      expect(literal, path).not.toMatch(
        /(?:password|secret|token)[^\S\n]*[:=][^\S\n]*\S/i
      );
    }
  });

  it("derives the include list from the tenant file, one id per line", () => {
    expect(read("modules.txt")).toBe("placeholder\n");
    expect(buildTenantYaml(INPUT).modules).toEqual(["placeholder"]);
  });

  it("writes an empty include list for a customer that selects none", () => {
    const none = renderTenant({ ...INPUT, modules: [] }, VALIDATORS);

    expect(none.get("customers/demo-co/deploy/modules.txt")).toBe("");
  });

  it("points the editor at the published schema", () => {
    expect(read("tenant.yaml")).toContain("# yaml-language-server: $schema=");
    // SAFETY: the bytes are the generator's own JSON template, and the one field
    // read here is matched against the path it must carry.
    const seed = JSON.parse(read("branding.seed.json")) as { $schema?: string };

    expect(seed.$schema).toMatch(/branding\.seed\.schema\.json$/);
  });
});

describe("the two configuration files", () => {
  it("keeps every tenant value out of the branding file", () => {
    expect(Object.keys(buildBrandingSeed(INPUT)).toSorted()).toEqual(
      BRANDING_KEYS.toSorted()
    );
  });

  it("keeps every branding value out of the tenant file", () => {
    expect(Object.keys(buildTenantYaml(INPUT)).toSorted()).toEqual(
      TENANT_KEYS.toSorted()
    );
  });

  it("seeds only the four values the branding contract requires", () => {
    // SAFETY: the bytes are the generator's own JSON template. The editor key is
    // dropped here exactly as the core loader drops it before parsing (DEC-35).
    const { $schema: _editorKey, ...seed } = JSON.parse(
      read("branding.seed.json")
    ) as { $schema: string };

    expect(seed).toEqual({
      company_name: "Demo Group",
      product_name: "Demo Ops",
      default_locale: "en",
      default_time_zone: "Europe/Berlin",
    });
  });

  it("authors no derived or nulled branding column", () => {
    const text = read("branding.seed.json");

    expect(text).not.toContain("primary_foreground");
    expect(text).not.toContain("null");
  });
});

describe("the strict validation seam", () => {
  it("validates the object it is about to write, not the text", () => {
    const seen: ConfigurationFile[] = [];

    const recorder: StrictSchema = {
      safeParse(value: ConfigurationFile) {
        seen.push(value);

        return { success: true };
      },
    };

    renderTenant(INPUT, { tenantYaml: recorder, brandingSeed: recorder });

    expect(seen).toEqual([buildTenantYaml(INPUT), buildBrandingSeed(INPUT)]);
  });

  it("fails the whole render when the tenant file is refused", () => {
    expect(() =>
      renderTenant(INPUT, {
        ...VALIDATORS,
        tenantYaml: strictSchema([]),
      })
    ).toThrow(/tenant\.yaml/);
  });

  it("fails the whole render when a branding key is misplaced", () => {
    expect(() =>
      renderTenant(INPUT, {
        ...VALIDATORS,
        brandingSeed: strictSchema(["company_name"]),
      })
    ).toThrow(/branding\.seed\.json/);
  });

  it("refuses a slug that is not kebab-case", () => {
    expect(() =>
      renderTenant({ ...INPUT, slug: "Demo Co" }, VALIDATORS)
    ).toThrow(/slug/);
  });

  it("renders the same bytes for the same input", () => {
    expect([...renderTenant(INPUT, VALIDATORS)]).toEqual([...files]);
  });
});
