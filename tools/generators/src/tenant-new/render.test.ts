import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildBrandingSeed, buildTenantYaml, renderTenant } from "./render.ts";
import type {
  ConfigurationFile,
  StrictSchema,
  TenantRenderInput,
} from "./render.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- assertions in this case read as one contract. */

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
 * `packages/core/src/lib/tenant-config/`, and the renderer imports them for
 * `CORE_VALIDATORS`. It still takes a schema as a parameter, so these doubles
 * keep the test independent of the real schema's contents.
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

type EnvironmentVariable = {
  readonly name: string;
  readonly required: boolean;
  readonly default?: string | number | boolean;
  readonly secret: boolean;
};

function environmentCatalogue(): readonly EnvironmentVariable[] {
  const path = resolve(
    import.meta.dirname,
    "../../../../deploy/schemas/environment.catalogue.json"
  );
  // SAFETY: core emits the catalogue as `{ variables: [...] }` and its emission test compares the committed bytes with the environment schema.
  const catalogue = JSON.parse(readFileSync(path, "utf8")) as {
    readonly variables: readonly EnvironmentVariable[];
  };

  return catalogue.variables;
}

function envExampleEntries(text: string): ReadonlyMap<string, string> {
  return new Map(
    [...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(
      ([, name, value]) => [name ?? "", value ?? ""]
    )
  );
}

/** Every name the compose file refuses to start without (`${NAME:?message}`). */
function composeRequiredNames(compose: string): readonly string[] {
  return [
    ...new Set(
      [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?[^}]*\}/g)].map(
        ([, name]) => name ?? ""
      )
    ),
  ].toSorted();
}

function service(compose: string, name: string): string {
  const start = compose.indexOf(`  ${name}:\n`);

  if (start === -1) return "";

  const bodyStart = start + `  ${name}:\n`.length;
  const nextService = compose
    .slice(bodyStart)
    .search(/\n  [a-z][a-z0-9_-]*:\n|\n(?:networks|volumes):/);

  return compose.slice(
    bodyStart,
    nextService === -1 ? undefined : bodyStart + nextService
  );
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

  it("sets worker heartbeat path and health-check timeouts from the worker environment", () => {
    const compose = read("compose.yaml");
    const worker =
      /  worker:\n([\s\S]*?)(?=\n  [a-z][a-z0-9_-]*:|\nvolumes:)/.exec(
        compose
      )?.[1];
    const healthcheck =
      /    healthcheck:\n([\s\S]*?)(?=\n    [a-z][a-z0-9_-]*:|$)/.exec(
        worker ?? ""
      )?.[1];
    const startPeriodSeconds = Number(
      /start_period:\s*(\d+)s/.exec(healthcheck ?? "")?.[1]
    );
    const checkCommand = healthcheck
      ?.split("\n")
      .find((line) => line.includes("test:"));
    const staleAfterSeconds = Number(
      /-lt\s+(\d+)/.exec(checkCommand ?? "")?.[1]
    );

    expect(worker).toBeDefined();
    expect(healthcheck).toBeDefined();
    expect(worker ?? "").toContain("WORKER_HEARTBEAT_PATH:");
    expect(healthcheck ?? "").toContain("$$WORKER_HEARTBEAT_PATH");
    expect(healthcheck ?? "").not.toContain("/tmp/");
    expect(checkCommand).toContain("-lt 180");
    expect(startPeriodSeconds).toBeGreaterThan(180);
    expect(staleAfterSeconds).toBeGreaterThanOrEqual(180);
  });

  it("omits the host-supplied Postgres service", () => {
    const compose = read("compose.yaml");

    expect(compose).not.toMatch(/^  (?:database|postgres):$/m);
  });

  it("does not publish a host port", () => {
    const compose = read("compose.yaml");

    expect(compose).not.toMatch(/^\s+ports:\s*$/m);
  });

  it("reads IMAGE_TAG only for the application and worker image references", () => {
    const compose = read("compose.yaml");
    const imageLines = compose
      .split("\n")
      .filter((line) => /^\s+image:/.test(line));

    expect(imageLines.filter((line) => line.includes("IMAGE_TAG"))).toEqual([
      "    image: ${IMAGE_TAG:?set IMAGE_TAG in .env}",
      "    image: ${IMAGE_TAG:?set IMAGE_TAG in .env}",
    ]);
    expect(compose).not.toContain("GENIE_IMAGE");
    expect(compose).not.toMatch(/^\s+IMAGE_TAG:/m);
  });

  it("joins the external proxy network with aliases derived from the customer slug", () => {
    const compose = read("compose.yaml");

    expect(compose).toContain("  proxy:\n    external: true\n    name: proxy");

    for (const [serviceName, alias] of [
      ["app", "demo-co-app"],
      ["keycloak", "demo-co-keycloak"],
    ]) {
      const currentService = service(compose, serviceName ?? "");

      expect(currentService, serviceName).toContain("proxy:");
      expect(currentService, serviceName).toContain(`- ${alias}`);
    }

    expect(service(compose, "worker")).toContain("proxy:");
  });

  it("runs the worker from the customer image", () => {
    const compose = read("compose.yaml");
    const worker = service(compose, "worker");

    expect(service(compose, "app")).not.toBe("");
    expect(worker).toContain('command: ["worker"]');
    expect(worker).toContain("image: ${IMAGE_TAG");
  });

  it("runs Keycloak in the customer stack", () => {
    const compose = read("compose.yaml");
    const keycloak = service(compose, "keycloak");
    const example = read(".env.example");

    expect(keycloak).not.toBe("");
    expect(keycloak).toContain('command: ["start"');
    expect(keycloak).not.toContain("start-dev");
    expect(keycloak).toContain("KC_DB: ${KC_DB:?set KC_DB in .env}");
    expect(keycloak).toContain(
      "KC_DB_URL_HOST: ${KC_DB_URL_HOST:?set KC_DB_URL_HOST in .env}"
    );
    expect(keycloak).toContain(
      "KC_DB_URL_DATABASE: ${KC_DB_URL_DATABASE:?set KC_DB_URL_DATABASE in .env}"
    );
    expect(keycloak).toContain(
      "KC_DB_USERNAME: ${KC_DB_USERNAME:?set KC_DB_USERNAME in .env}"
    );
    expect(keycloak).toContain(
      "KC_DB_PASSWORD: ${KC_DB_PASSWORD:?set KC_DB_PASSWORD in .env}"
    );
    expect(keycloak).toContain("KC_PROXY_HEADERS: ${KC_PROXY_HEADERS");
    // Keycloak has its own public hostname, KEYCLOAK_URL (runbooks/reverse-proxy.md).
    expect(keycloak).toContain("KC_HOSTNAME: ${KEYCLOAK_URL");

    const entries = envExampleEntries(example);

    for (const name of [
      "KC_DB",
      "KC_DB_URL_HOST",
      "KC_DB_URL_DATABASE",
      "KC_DB_USERNAME",
      "KC_DB_PASSWORD",
      "KC_PROXY_HEADERS",
    ]) {
      expect(entries.has(name), `${name} is missing from .env.example`).toBe(
        true
      );
    }
    expect(entries.get("KC_DB_URL_DATABASE")).toBe("keycloak");
    expect(entries.get("KC_PROXY_HEADERS")).toBe("xforwarded");
    expect(example).not.toContain("KC_BOOTSTRAP_ADMIN_PASSWORD=");
  });

  it("gives the application an HTTP health check", () => {
    const compose = read("compose.yaml");
    const app = service(compose, "app");

    const appHealthcheck =
      /    healthcheck:\n([\s\S]*?)(?=\n    [a-z][a-z0-9_-]*:|$)/.exec(
        app
      )?.[1] ?? "";

    expect(appHealthcheck).toMatch(/\/api\/health/);
    expect(appHealthcheck).toMatch(/(?:curl|wget|node)/i);
  });

  it("checks worker health through the heartbeat file", () => {
    const compose = read("compose.yaml");
    const worker = service(compose, "worker");
    const workerHealthcheck =
      /    healthcheck:\n([\s\S]*?)(?=\n    [a-z][a-z0-9_-]*:|$)/.exec(
        worker
      )?.[1] ?? "";

    expect(workerHealthcheck).toContain("$$WORKER_HEARTBEAT_PATH");
    expect(workerHealthcheck).toContain("-lt 180");
  });

  it("renders every environment catalogue variable with its default and no secret value", () => {
    const catalogue = environmentCatalogue();
    const entries = envExampleEntries(read(".env.example"));

    expect(catalogue.map(({ name }) => name)).toEqual(
      catalogue.map(({ name }) => name).toSorted()
    );
    expect(catalogue.map(({ name }) => name)).not.toContain("MODULE_INCLUDE");
    const expectedNames = new Set(
      catalogue
        .filter(({ name }) => !name.startsWith("KEYCLOAK_BOOTSTRAP_"))
        .map(({ name }) => name)
    );
    for (const name of composeRequiredNames(read("compose.yaml"))) {
      expectedNames.add(name);
    }

    expect([...entries.keys()].toSorted()).toEqual(
      [...expectedNames].toSorted()
    );

    for (const variable of catalogue.filter(
      ({ name }) => !name.startsWith("KEYCLOAK_BOOTSTRAP_")
    )) {
      const expected =
        variable.secret || variable.default === undefined
          ? ""
          : String(variable.default);

      expect(entries.get(variable.name), variable.name).toBe(expected);
    }

    expect(entries.get("IMAGE_TAG")).toBe("");
  });

  // An operator copies .env.example to .env and fills every listed value, then runs
  // `docker compose up`; a name compose requires but the example omits stops the stack.
  it("lists every variable the compose file requires in .env.example", () => {
    const catalogueNames = new Set(
      environmentCatalogue().map(({ name }) => name)
    );
    const entries = envExampleEntries(read(".env.example"));
    const required = composeRequiredNames(read("compose.yaml"));

    // R-66: the Keycloak server administrator is created once by a command, never from .env.
    expect(required).not.toContain("KC_BOOTSTRAP_ADMIN_USERNAME");
    expect(required).not.toContain("KC_BOOTSTRAP_ADMIN_PASSWORD");
    expect(required).toContain("KC_DB_PASSWORD");
    expect(required).toContain("KEYCLOAK_URL");

    // The only non-secret stack defaults; every other name outside the catalogue may be a
    // credential or a host value and stays blank.
    const stackDefaults = new Map([
      ["KC_DB", "postgres"],
      ["KC_DB_URL_DATABASE", "keycloak"],
      ["KC_PROXY_HEADERS", "xforwarded"],
    ]);

    for (const name of required) {
      expect(entries.has(name), name).toBe(true);

      if (!catalogueNames.has(name)) {
        expect(entries.get(name), name).toBe(stackDefaults.get(name) ?? "");
      }
    }
  });

  it("keeps the customer stack template out of deploy/stack", () => {
    const stackDirectory = resolve(
      import.meta.dirname,
      "../../../../deploy/stack"
    );

    expect(existsSync(stackDirectory)).toBe(true);
    expect(readdirSync(stackDirectory).toSorted()).toEqual([
      "compose.dev-e2e.yaml",
      "compose.e2e.yaml",
    ]);
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

  it("keeps free text out of every unquoted position", () => {
    // A company or product name is free text a customer supplies. It reaches the
    // two validated files as a quoted JSON scalar, and nothing else, so a name
    // carrying a line break cannot add a line to a YAML file.
    const awkward = renderTenant(
      {
        ...INPUT,
        companyName: 'Demo\nservices:\n  rogue: "yes"',
        productName: "Demo: Ops",
      },
      VALIDATORS
    );

    for (const [path, content] of awkward) {
      if (path.endsWith(".yaml") || path.endsWith(".env.example")) {
        expect(content, path).not.toContain("Demo");
      }
    }

    expect(
      JSON.parse(
        awkward.get("customers/demo-co/deploy/branding.seed.json") ?? "{}"
      )
    ).toMatchObject({ company_name: 'Demo\nservices:\n  rogue: "yes"' });
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
