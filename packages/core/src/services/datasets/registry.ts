import type {
  DatasetDeclaration,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";

/** One module's dataset declaration, kept with the id of the module that published it. */
export type RegisteredDataset = {
  readonly moduleId: string;
  readonly declaration: DatasetDeclaration;
};

/** The registered dataset of that name whose module is enabled, or undefined. */
export async function findDataset(
  ctx: ModuleRequestContext,
  name: string
): Promise<RegisteredDataset | undefined> {
  const found = ctx.tenant.datasets
    .all()
    .find((entry) => entry.declaration.name === name);

  return found !== undefined &&
    (await ctx.tenant.entitlements.isEnabled(found.moduleId))
    ? found
    : undefined;
}

/**
 * The datasets of every compiled module, registered once per tenant context (DEC-54). A
 * declaration's name is the key, so one name never answers for two sources.
 */
export type DatasetRegistry = {
  register(moduleId: string, declaration: DatasetDeclaration): void;
  all(): readonly RegisteredDataset[];
};

/** Builds the registry one tenant context holds. It owns no resource and reaches nothing. */
export function createDatasetRegistry(): DatasetRegistry {
  const datasets = new Map<string, RegisteredDataset>();

  return {
    register: (moduleId, declaration) => {
      if (datasets.has(declaration.name)) {
        throw new Error(
          `Dataset "${declaration.name}" is registered more than once.`
        );
      }

      datasets.set(declaration.name, { moduleId, declaration });
    },
    all: () => [...datasets.values()],
  };
}
