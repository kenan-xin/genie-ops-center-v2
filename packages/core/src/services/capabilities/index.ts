/**
 * The capabilities channel of the module contract, channel 3: a module registers itself as the
 * provider of a named interface and another asks for it through the tenant context. Both sides
 * compile against core, never against each other, and a consumer must behave when the answer is
 * nothing, because the providing module may be disabled or absent from the image (R-58, DEC-42).
 */
export type CapabilityRegistry = {
  /**
   * Registers the one provider of a named capability. A second provider of a name is an error.
   * The registry is keyed by name and holds whatever implementation the capability's own
   * interface defines; each caller that reads a provider back casts it to that interface, which
   * the contracts package owns.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the shape belongs to the named interface, not this registry
  provide(name: string, implementation: unknown): void;
  /**
   * The provider registered under the name, or nothing when no module provides it (R-58). The
   * provider's shape belongs to the capability's interface in `packages/core/contracts`.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the shape belongs to the named interface, not this registry
  get(name: string): unknown;
};

/** Builds the registry one tenant context holds. It owns no resource and reaches nothing. */
export function createCapabilityRegistry(): CapabilityRegistry {
  const providers = new Map<string, unknown>();

  return {
    provide: (name, implementation) => {
      if (providers.has(name)) {
        throw new Error(
          `Capability "${name}" already has a provider. One capability has one provider.`
        );
      }

      providers.set(name, implementation);
    },
    get: (name) => providers.get(name),
  };
}
