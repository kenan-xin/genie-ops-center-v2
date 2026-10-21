import type { ModuleSelection } from "../selection/resolve.ts";

/** `contract-data` becomes `contractDataModule`, matching each module's exported name. */
function exportNameFor(id: string): string {
  const camel = id.replace(/-([a-z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );

  return `${camel}Module`;
}

/**
 * Emits the text of `apps/genie/src/modules.ts` from validated inventory data.
 *
 * This function reads strings only. It never imports or evaluates a module
 * declaration, so tooling stays data-only (ADR 0008). The entrypoint path each
 * inventory entry carries is validated data used to prove the package exists,
 * not an instruction for tooling to load it, which is why the emitted text
 * imports by package name and never by path.
 *
 * The resolved ids are emitted beside the declarations so the application can
 * check each compiled declaration against the id the selection asked for. The
 * selection source is emitted as a comment so an unset selection stays
 * distinguishable from an explicitly empty one (R-21).
 */
export function emitRegistryModule(selection: ModuleSelection): string {
  // Each import gets a positionally unique local binding.
  //
  // Deriving the binding from the id alone is not safe: ids are kebab-case, and
  // upper-casing the character after a hyphen does nothing to a digit, so `a-1`
  // and `a1` both derive `a1Module`. Both are valid ids, and emitting that name
  // twice would be a duplicate binding that does not parse. Aliasing removes the
  // whole class of collisions rather than rejecting ids that are legal.
  const bindings = selection.entries.map((_, index) => `module${index}`);

  const imports = selection.entries
    .map(
      (entry, index) =>
        `import { ${exportNameFor(entry.id)} as ${bindings[index]} } from "${entry.packageName}";`
    )
    .join("\n");

  const list = bindings.length === 0 ? "[]" : `[${bindings.join(", ")}]`;
  const ids = JSON.stringify(selection.entries.map((entry) => entry.id));

  return `// Generated from MODULE_INCLUDE. Do not edit and do not commit (ADR 0008).
// Selection source: ${selection.source}
${imports}${imports === "" ? "" : "\n"}
export const selectedModules = ${list} as const;

/** The ids the selection resolved, so the app can check each declaration against its metadata. */
export const selectedModuleIds = ${ids} as const;
`;
}
