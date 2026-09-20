import { validModule } from "./__fixtures__/valid-module.ts";
import type { Module } from "./module.ts";

/**
 * Type assertions. Vitest does not run this file: the unit preset does not enable typecheck and
 * its collection glob matches `.test.ts` files only, never `.test-d.ts`. The `typecheck` target
 * compiles it because the core tsconfig includes every `src` TypeScript file, and every
 * `@ts-expect-error` below must keep matching a real error or `tsc` fails with "Unused
 * '@ts-expect-error' directive".
 */

// The fixture satisfies every point of the contract.
export const assigns: Module = validModule;

// A declaration missing `identity` is not a Module.
// @ts-expect-error identity is missing
export const missingIdentity: Module = { ...validModule, identity: undefined };

// A declaration whose id is not a string is not a Module.
export const badId: Module = {
  ...validModule,
  // @ts-expect-error id must be a string
  identity: { ...validModule.identity, id: 7 },
};
