import { AsyncLocalStorage } from "node:async_hooks";

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/require-readable-spacing -- OAuth profiles are third-party untyped input and this holder is the boundary parser. */

export type AuthRequestFacts = {
  groups: readonly string[] | undefined;
  oauth: boolean;
  refusal:
    | {
        readonly reason:
          | "not_registered"
          | "no_mapped_group"
          | "groups_claim_absent"
          | "disabled";
        readonly email: string;
        readonly groups?: readonly string[];
      }
    | undefined;
};

/** Request-local OAuth facts; an empty claim remains distinct from an absent claim. */
export class AuthRequestScope {
  readonly #storage = new AsyncLocalStorage<AuthRequestFacts>();

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.#storage.run(
      { groups: undefined, oauth: false, refusal: undefined },
      fn
    );
  }

  capture(groups: unknown, marker: unknown): void {
    const facts = this.#storage.getStore();
    if (facts === undefined) return;
    facts.oauth = true;
    facts.groups = Array.isArray(groups)
      ? groups.filter((value): value is string => typeof value === "string")
      : groups === undefined && marker === true
        ? []
        : undefined;
  }

  refuse(refusal: NonNullable<AuthRequestFacts["refusal"]>): void {
    const facts = this.#storage.getStore();
    if (facts !== undefined) facts.refusal = refusal;
  }

  current(): AuthRequestFacts | undefined {
    return this.#storage.getStore();
  }
}
