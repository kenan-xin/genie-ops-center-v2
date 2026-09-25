import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import {
  brandingSeedSchema,
  tenantYamlSchema,
} from "../src/lib/tenant-config/index.ts";

/**
 * Writes the JSON Schema of each strict tenant-config schema into `deploy/schemas/`, committed,
 * so an editor validates `tenant.yaml` and `branding.seed.json` as an operator types them (R-23,
 * DEC-35). Run through `nx run core:schemas`; the committed files are checked against this
 * emission by `schema-emission.test.ts`, so a stale file fails continuous integration.
 *
 * The raw `JSON.stringify` output is not the committed text: the files are oxfmt-formatted, so a
 * run that only stringified would leave the tree dirty and fail a `git diff --exit-code`. The
 * target formats its own output with the repository formatter, so running it is idempotent
 * (AC-6). The formatter reads `oxfmt.config.ts` from the repository root, the same config a
 * manual `pnpm run format` uses.
 */

const outputDirectory = resolve(import.meta.dirname, "../../../deploy/schemas");

const schemas = {
  "tenant.schema.json": tenantYamlSchema,
  "branding.seed.schema.json": brandingSeedSchema,
} as const;

await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  Object.entries(schemas).map(async ([name, schema]) => {
    const emitted = z.toJSONSchema(schema, { unrepresentable: "any" });

    await writeFile(
      resolve(outputDirectory, name),
      `${JSON.stringify(emitted, undefined, 2)}\n`,
      "utf8"
    );
  })
);

execFileSync("oxfmt", ["--disable-nested-config", outputDirectory], {
  stdio: "inherit",
});
