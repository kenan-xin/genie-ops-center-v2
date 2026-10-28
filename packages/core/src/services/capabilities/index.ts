import type { EntitlementReader } from "../../lib/tenant-context/readers.ts";

/**
 * The capabilities channel of the module contract, channel 3: a module registers itself as the
 * provider of a named interface and another asks for it through the tenant context. Both sides
 * compile against core, never against each other, and a consumer must behave when the answer is
 * nothing, because the providing module may be disabled or absent from the image (R-58, DEC-42).
 */
export type CapabilityProvider = {
  /** The module whose provision this is, so `list` can check its entitlement (R-13). */
  readonly moduleId: string;
  /** The implementation the capability's own interface defines. */
  readonly implementation: unknown;
};

export type CapabilityRegistry = {
  /**
   * Registers one module as a provider of a named capability. One module provides a name once.
   * The registry is keyed by name and holds whatever implementation the capability's own
   * interface defines; each caller that reads a provider back casts it to that interface, which
   * the contracts package owns.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the shape belongs to the named interface, not this registry
  provide(moduleId: string, name: string, implementation: unknown): void;
  /**
   * The one provider of a name, or nothing when no module provides it (R-58). Several modules may
   * provide one name; `get` refuses that and names the list form instead.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the shape belongs to the named interface, not this registry
  get(name: string): unknown;
  /** Every provider of a name whose module is enabled, in registration order (R-13). */
  list(name: string): Promise<readonly CapabilityProvider[]>;
};

/**
 * Builds the registry one tenant context holds. It owns no resource; `list` reads module
 * enablement through the context's entitlement reader, never through a cache of its own (DEC-46).
 */
export function createCapabilityRegistry(
  entitlements: EntitlementReader
): CapabilityRegistry {
  const providers = new Map<string, CapabilityProvider[]>();

  return {
    provide: (moduleId, name, implementation) => {
      const ofName = providers.get(name);

      if (ofName === undefined) {
        providers.set(name, [{ moduleId, implementation }]);

        return;
      }

      if (ofName.some((provider) => provider.moduleId === moduleId)) {
        throw new Error(
          `Module "${moduleId}" provides capability "${name}" more than once.`
        );
      }

      ofName.push({ moduleId, implementation });
    },
    get: (name) => {
      const ofName = providers.get(name) ?? [];

      if (ofName.length > 1) {
        throw new Error(
          `Capability "${name}" has ${ofName.length} providers. Read them with list("${name}").`
        );
      }

      return ofName[0]?.implementation;
    },
    list: async (name) => {
      const ofName = providers.get(name) ?? [];

      const enabled = await Promise.all(
        ofName.map((provider) => entitlements.isEnabled(provider.moduleId))
      );

      return ofName.filter((_, index) => enabled[index]);
    },
  };
}
