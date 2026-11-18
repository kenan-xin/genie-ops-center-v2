import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import { validateEnvironment } from "@genie/core";
import { expect, it } from "vitest";

// The local template is written by hand; the catalogue is emitted from the core schema and kept
// equal to it by core's own test. These two checks keep the template in step with the catalogue.
const template = parseEnv(
  readFileSync(resolve(import.meta.dirname, "../.env.example"), "utf8")
);

const catalogue: { variables: { name: string }[] } = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../deploy/schemas/environment.catalogue.json"
    ),
    "utf8"
  )
);

it("names every variable the application profile requires", () => {
  // The template leaves its secrets blank for the developer to fill.
  const filled = Object.fromEntries(
    Object.entries(template).map(([name, value]) => [
      name,
      value === "" ? "x".repeat(32) : value,
    ])
  );

  expect(() => validateEnvironment(filled, "application")).not.toThrow();
});

it("names only variables the catalogue declares", () => {
  const catalogued = new Set(catalogue.variables.map(({ name }) => name));

  expect(Object.keys(template).filter((name) => !catalogued.has(name))).toEqual(
    []
  );
});
