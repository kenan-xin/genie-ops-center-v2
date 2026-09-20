import type { ZodType } from "zod";

/**
 * One cross-module event. Both the emitting module and every subscriber import the same contract
 * from here, so neither imports the other (DEC-42). A payload change takes a new version; a
 * version is never reshaped in place.
 */
export type EventContract<TName extends string, TPayload> = {
  readonly name: TName;
  readonly version: number;
  readonly payload: ZodType<TPayload>;
};

export function defineEventContract<TName extends string, TPayload>(
  name: TName,
  version: number,
  payload: ZodType<TPayload>
): EventContract<TName, TPayload> {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      `Event "${name}" has version ${version}. A version is an integer above zero.`
    );
  }

  return { name, version, payload };
}

/**
 * The named synchronous interfaces a module can provide and another can ask for. Section 0
 * declares the registry and adds no real capability; a capability is added here when a real
 * module needs one, in the same change that documents it in the module contract.
 */
export type CapabilityInterfaces = Record<never, never>;

export type CapabilityName = keyof CapabilityInterfaces & string;
