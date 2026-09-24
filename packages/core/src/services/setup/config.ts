import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";

import {
  type BrandingSeed,
  brandingSeedSchema,
  type TenantYaml,
  tenantYamlSchema,
} from "../../lib/tenant-config/index.ts";

/** The two configuration files one `genie-ops setup` run reads (R-21). */
export type SetupConfigFiles = {
  readonly tenantConfig: string;
  readonly brandingSeed: string;
};

/** Every problem zod found, keyed by path, in one line. */
function problems(error: ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length === 0
        ? issue.message
        : `${issue.path.join(".")}: ${issue.message}`
    )
    .join("; ");
}

/**
 * The one refusal for a configuration file. It names the file and, through the zod message, the
 * offending key, which is what the operator needs when a value is in the wrong file (R-22).
 */
function refusal(file: string, detail: string): Error {
  return new Error(`${file} is not valid: ${detail}`);
}

/** The message of a caught read or parse failure, which is never an error value here. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "the file could not be read";
}

/** Reads and strictly validates one `tenant.yaml`; an unknown key names itself and the file. */
export async function loadTenantYaml(file: string): Promise<TenantYaml> {
  const text = await readFile(file, "utf8");

  let document: unknown;

  try {
    document = parseYaml(text);
  } catch (cause) {
    throw refusal(file, messageOf(cause));
  }

  const result = tenantYamlSchema.safeParse(document);

  if (!result.success) throw refusal(file, problems(result.error));

  return result.data;
}

/**
 * Reads and strictly validates one `branding.seed.json`. The editor-only `$schema` key is
 * stripped before parsing, so an author's file validates while the schema itself still refuses a
 * key that does not belong (DEC-35).
 */
export async function loadBrandingSeed(file: string): Promise<BrandingSeed> {
  const text = await readFile(file, "utf8");

  let parsed: { $schema?: string };

  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw refusal(file, messageOf(cause));
  }

  const document = { ...parsed };

  delete document.$schema;

  const result = brandingSeedSchema.safeParse(document);

  if (!result.success) throw refusal(file, problems(result.error));

  return result.data;
}
