import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  environmentCatalogue,
  validateEnvironment,
  type EnvironmentSource,
} from "./index.ts";

const CATALOGUE_PATH = resolve(
  import.meta.dirname,
  "../../../../../deploy/schemas/environment.catalogue.json"
);

describe("the committed environment catalogue", () => {
  it("matches the catalogue emitted from the core environment schema", () => {
    const committed = JSON.parse(readFileSync(CATALOGUE_PATH, "utf8"));

    expect(environmentCatalogue).toEqual(
      [...environmentCatalogue].toSorted((left, right) =>
        left.name.localeCompare(right.name)
      )
    );
    expect(committed).toEqual({ variables: environmentCatalogue });

    const environmentKeys = new Set<string>();

    const defaults: EnvironmentSource = {
      DATABASE_URL: "postgres://genie:genie@localhost/genie",
      PUBLIC_URL: "https://example.invalid",
    };

    const source: EnvironmentSource = new Proxy(defaults, {
      get(target, property) {
        const name = String(property);

        if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
          environmentKeys.add(name);
        }

        return target[name];
      },
    });

    validateEnvironment(source);

    for (const name of environmentKeys) {
      expect(
        environmentCatalogue.some((variable) => variable.name === name),
        `${name} read by validateEnvironment is not catalogued`
      ).toBe(true);
    }
  });
});
