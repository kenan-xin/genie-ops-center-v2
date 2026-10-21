import type { ZodType } from "zod";

/**
 * One event's contract: its name, its version and the zod schema of its payload. The emitting
 * module and every subscriber import the same contract from one place — the module that owns it
 * or, for an event another module subscribes to, this folder — so neither side imports the other
 * (DEC-42). A payload change takes a new version; a version is never reshaped in place.
 */
export type EventContract<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: number;
  readonly payload: ZodType<TPayload>;
};

/** What `defineEvent` receives: the three parts of a contract, spelled once. */
export type EventDefinition<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: number;
  readonly payload: ZodType<TPayload>;
};

/**
 * Defines one event contract. The version must be an integer above zero, so a payload change
 * cannot reuse a version and a subscriber never sees two shapes under one name and version.
 */
export function defineEvent<TName extends string, TPayload>(
  definition: EventDefinition<TName, TPayload>
): EventContract<TName, TPayload> {
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(
      `Event "${definition.name}" has version ${definition.version}. A version is an integer above zero.`
    );
  }

  return {
    name: definition.name,
    version: definition.version,
    payload: definition.payload,
  };
}

/**
 * One delivered event, what every handler receives. `id` and `correlationId` are UUIDs minted at
 * the emit, `emittedAt` is the emit time in ISO 8601, and `payload` is the value the contract's
 * schema already parsed.
 */
export type EventEnvelope<TPayload> = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly payload: TPayload;
  readonly correlationId: string;
  readonly emittedAt: string;
};

/**
 * The named synchronous interfaces a module can provide and another can ask for. Section 0
 * declares the registry and adds no real capability; a capability is added here when a real
 * module needs one, in the same change that documents it in the module contract.
 */
export type CapabilityInterfaces = Record<never, never>;

export type CapabilityName = keyof CapabilityInterfaces & string;
