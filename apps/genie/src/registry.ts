import { type Module, validateRegistry } from "@genie/core";

import { selectedModuleIds, selectedModules } from "./modules.ts";

/**
 * Core owns every contract check, including the rule that at most one module
 * across the registry carries the landing flag (R-23a, DEC-49).
 *
 * It reports problems rather than throwing, so the application must read what it
 * returned. Do not write a second checker here: an earlier draft added its own
 * landing-route check and so duplicated validated behavior while silently
 * discarding everything else the validator found.
 */
export function assertRegistryIsValid(candidates: readonly Module[]): void {
  const problems = validateRegistry(candidates);

  if (problems.length > 0) {
    throw new Error(
      `The compiled module registry is not valid:\n- ${problems.join("\n- ")}`
    );
  }
}

/**
 * Checks each compiled declaration against the id the selection resolved.
 *
 * A package whose declaration drifted from its metadata fails at load rather
 * than mounting under the wrong id. Both directions are checked, so nothing
 * extra is compiled in and nothing selected is missing, and the order is checked
 * too: it decides the emitted import order and therefore the order migration
 * histories are applied in (R-21, R-25). No service is started here.
 */
export function assertSelectedIdentity(
  candidates: readonly Module[],
  expectedIds: readonly string[]
): void {
  const actual = candidates.map((candidate) => candidate.identity.id);

  for (const id of actual) {
    if (!expectedIds.includes(id)) {
      throw new Error(
        `Module "${id}" is compiled in but is not in the selection ${JSON.stringify(expectedIds)}.`
      );
    }
  }

  for (const id of expectedIds) {
    if (!actual.includes(id)) {
      throw new Error(
        `The selection asked for "${id}" but no declaration with that id was compiled in.`
      );
    }
  }

  for (const [index, id] of expectedIds.entries()) {
    if (actual[index] !== id) {
      throw new Error(
        `The compiled registry order ${JSON.stringify(actual)} does not match the resolved selection order ${JSON.stringify(expectedIds)}.`
      );
    }
  }
}

// SAFETY: the generated file emits the module declarations the selection named,
// and the two assertions below reject anything that does not match the contract
// or the resolved selection before the value is exported.
const compiled = selectedModules as readonly Module[];

assertRegistryIsValid(compiled);

assertSelectedIdentity(compiled, selectedModuleIds);

export const modules: readonly Module[] = compiled;

/**
 * The ids the image compiled, read once from the registry. The tenant context and the migrator
 * run both take this one list, so the entitlement reader and the omission check cannot disagree
 * about what the image carries (D-12).
 */
export const compiledModuleIds: readonly string[] = compiled.map(
  (module) => module.identity.id
);

/**
 * The module that owns each declared navigation path, resolved at load so the proxy can refuse a
 * disabled module's route before any page renders (R-8). The proxy cannot import this module or
 * the registry it reads, because that path reaches the database driver, so the bootstrap copies
 * this map onto the context slot instead.
 */
export const moduleRoutes: ReadonlyMap<string, string> = new Map(
  compiled.flatMap((module) =>
    module.navigation.entries.map(
      (entry) => [entry.path, module.identity.id] as const
    )
  )
);

export const moduleById: ReadonlyMap<string, Module> = new Map(
  compiled.map((module) => [module.identity.id, module])
);

/**
 * The ids that declared a frame-origin provider, which is what makes a path a
 * viewer route. One definition, used by the server bundle directly and by the
 * proxy through the context slot the bootstrap fills.
 */
export const viewerModuleIds: ReadonlySet<string> = new Set(
  compiled
    .filter((module) => module.contentSecurityPolicy !== undefined)
    .map((module) => module.identity.id)
);
