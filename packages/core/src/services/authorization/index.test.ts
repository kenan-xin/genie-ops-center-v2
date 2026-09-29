import { describe, expect, it } from "vitest";

import { landingRoute } from "../../lib/entitlement/index.ts";
import type { PermissionKey, Scope } from "../../lib/module-contract/keys.ts";
import type { NavigationEntry } from "../../lib/module-contract/module.ts";
import { can, scopesFor } from "./index.ts";
import {
  type PermissionGrants,
  type RecordResolver,
  createRequestPrincipal,
} from "./principal.ts";

/**
 * The pure half of the seam: the scope match, the declared-parent match, the bypass and the lazy
 * loader. The assignment query itself is proved against a real Postgres in
 * `testing/access.integration.test.ts`.
 */
const RECORD = { type: "placeholder-record", id: "r1" };

const FOLDER: Scope = { type: "placeholder-folder", id: "f1" };

function grants(
  entries: Readonly<Record<string, "all" | readonly Scope[]>>,
  bypass = false
): PermissionGrants {
  const scopes = new Map(
    Object.entries(entries).map(([key, value]) => [
      // SAFETY: every key a case below writes is a `<prefix>:<action>` literal.
      key as PermissionKey,
      value === "all"
        ? ({ kind: "all" } as const)
        : ({ kind: "some", scopes: value } as const),
    ])
  );

  return { keys: new Set(scopes.keys()), scopes, bypass };
}

function principal(held: PermissionGrants, resolve?: RecordResolver) {
  return createRequestPrincipal(
    { userId: "u1", groups: [], authenticated: true },
    () => Promise.resolve(held),
    resolve
  );
}

function countingResolver(parents: readonly Scope[]) {
  let calls = 0;

  return {
    calls: () => calls,
    resolve: async () => {
      calls += 1;

      return { label: "Record", parents };
    },
  };
}

describe("the scope match", () => {
  it("grants a tenant-wide key for any resource", async () => {
    const user = principal(grants({ "placeholder:use": "all" }));

    await expect(can(user, "placeholder:use", RECORD)).resolves.toBe(true);
  });

  it("grants a record scope on that record only", async () => {
    const user = principal(grants({ "placeholder:use": [RECORD] }));

    await expect(can(user, "placeholder:use", RECORD)).resolves.toBe(true);
    await expect(
      can(user, "placeholder:use", { type: RECORD.type, id: "r2" })
    ).resolves.toBe(false);
  });

  it("grants through a declared parent, resolving the record once", async () => {
    const resolver = countingResolver([FOLDER]);

    const user = principal(
      grants({ "placeholder:use": [FOLDER], "placeholder:admin": [FOLDER] }),
      resolver.resolve
    );

    await expect(can(user, "placeholder:use", RECORD)).resolves.toBe(true);
    await expect(can(user, "placeholder:admin", RECORD)).resolves.toBe(true);

    expect(resolver.calls()).toBe(1);
  });

  it("does not resolve when the record scope already matched", async () => {
    const resolver = countingResolver([FOLDER]);

    const user = principal(
      grants({ "placeholder:use": [RECORD] }),
      resolver.resolve
    );

    await can(user, "placeholder:use", RECORD);

    expect(resolver.calls()).toBe(0);
  });

  it("refuses a parent the record does not declare", async () => {
    const user = principal(
      grants({ "placeholder:use": [FOLDER] }),
      countingResolver([]).resolve
    );

    await expect(can(user, "placeholder:use", RECORD)).resolves.toBe(false);
  });

  it("refuses a key it does not hold", async () => {
    const user = principal(grants({ "placeholder:use": "all" }));

    await expect(can(user, "placeholder:admin")).resolves.toBe(false);
    await expect(scopesFor(user, "placeholder:admin")).resolves.toEqual({
      kind: "none",
    });
  });

  it("answers scopesFor with all or the list, parents unchanged", async () => {
    const user = principal(
      grants({ "placeholder:use": "all", "placeholder:read": [FOLDER] })
    );

    await expect(scopesFor(user, "placeholder:use")).resolves.toEqual({
      kind: "all",
    });
    await expect(scopesFor(user, "placeholder:read")).resolves.toEqual({
      kind: "some",
      scopes: [FOLDER],
    });
  });

  it("lets only the bypass answer everything", async () => {
    const user = principal(grants({}, true));

    await expect(can(user, "invoices:approve", RECORD)).resolves.toBe(true);
    await expect(scopesFor(user, "invoices:approve")).resolves.toEqual({
      kind: "all",
    });
  });
});

describe("the lazy loader", () => {
  function counting() {
    let reads = 0;

    return {
      reads: () => reads,
      read: async () => {
        reads += 1;

        return grants({ "placeholder:read": "all" });
      },
    };
  }

  it("reads once however many calls one execution makes, even concurrent ones", async () => {
    const reader = counting();

    const user = createRequestPrincipal(
      { userId: "u1", groups: [], authenticated: true },
      reader.read
    );

    expect(reader.reads()).toBe(0);

    await Promise.all([
      can(user, "placeholder:read"),
      scopesFor(user, "placeholder:read"),
    ]);
    await can(user, "placeholder:admin");

    expect(reader.reads()).toBe(1);
  });

  it("memoises a rejected read for the principal's lifetime", async () => {
    let reads = 0;

    const user = createRequestPrincipal(
      { userId: "u1", groups: [], authenticated: true },
      async () => {
        reads += 1;

        throw new Error("loader down");
      }
    );

    await expect(can(user, "placeholder:read")).rejects.toThrow("loader down");
    await expect(can(user, "placeholder:read")).rejects.toThrow("loader down");

    expect(reads).toBe(1);
  });

  it("refuses an unauthenticated principal with no read, even when the loader would grant", async () => {
    const reader = counting();

    const user = createRequestPrincipal(
      { userId: "anonymous", groups: [], authenticated: false },
      reader.read
    );

    expect(await can(user, "placeholder:read")).toBe(false);
    expect(await scopesFor(user, "placeholder:read")).toEqual({ kind: "none" });
    expect(reader.reads()).toBe(0);
  });

  it("follows the real grants of a signed-in person whose id is the string anonymous", async () => {
    // `userId` is the person's own row id and may be any text; authentication is the explicit
    // flag, so an id that reads like a sentinel does not make a signed-in person anonymous.
    const reader = counting();

    const user = createRequestPrincipal(
      { userId: "anonymous", groups: [], authenticated: true },
      reader.read
    );

    expect(await can(user, "placeholder:read")).toBe(true);
    expect(await scopesFor(user, "placeholder:read")).toEqual({ kind: "all" });
    expect(reader.reads()).toBe(1);
  });
});

const ARCHIVE: NavigationEntry = {
  id: "archive",
  label: "Archive",
  path: "/archive",
  surface: "workspace",
  requiredPermission: "placeholder:use",
};

const HOME: NavigationEntry = {
  id: "home",
  label: "Home",
  path: "/home",
  surface: "workspace",
  requiredPermission: "placeholder:use",
  landing: true,
};

describe("the landing route", () => {
  it("is the landing entry's path when it survived the filter", () => {
    expect(landingRoute([ARCHIVE, HOME])).toBe("/home");
  });

  it("is undefined when the landing entry was omitted", () => {
    expect(landingRoute([ARCHIVE])).toBeUndefined();
  });
});
