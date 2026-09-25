import {
  createRequestPrincipal,
  createStubGrantReader,
  type ModuleRequestContext,
  type TenantContext,
} from "@genie/core";
import { describe, expect, it } from "vitest";

import { placeholderRouter } from "./router.ts";

/**
 * A database that fails the test when it is touched. It is not a stand-in for Postgres: the read
 * path is proved against a real database in `testing/`. This exists so the denial cases can show
 * that the permission check happens before any read (DEC-34).
 */
function databaseTripwire(): TenantContext["db"] {
  // SAFETY: the proxy answers every property with a throw, so no member of the
  // database type is ever read from the empty target it wraps.
  const target = {} as TenantContext["db"];

  return new Proxy(target, {
    get() {
      throw new Error(
        "the router read the database before the permission check"
      );
    },
  });
}

/**
 * The three readers, at the same tripwire as the database: a module procedure must refuse an
 * unpermitted caller before it reads any of them (R-5, DEC-34). A read here fails the test.
 */
function readersTripwire(): Pick<
  TenantContext,
  "settings" | "branding" | "entitlements"
> {
  return {
    settings: {
      get: () => Promise.reject(new Error("the router read a reader")),
    },
    branding: {
      get: () => Promise.reject(new Error("the router read a reader")),
    },
    entitlements: {
      isEnabled: () => Promise.reject(new Error("the router read a reader")),
    },
  };
}

function contextWith(
  read: Parameters<typeof createRequestPrincipal>[1]
): ModuleRequestContext {
  return {
    tenant: {
      db: databaseTripwire(),
      env: {
        databaseUrl: "postgres://genie:secret@db.invalid:5432/genie",
        publicUrl: "https://genie.example.com",
        fileStorageAdapter: "postgres",
        fileMaxBytes: 15728640,
        chatAllowedOrigins: [],
        authTrustedProxies: [],
        lockTimeoutMs: 120000,
        logLevel: "info",
        port: 3000,
      },
      ...readersTripwire(),
      jobQueue: {
        enqueue: () => Promise.reject(new Error("the router enqueued a job")),
        schedule: () => Promise.reject(new Error("the router scheduled a job")),
      },
      fileStorage: {
        store: () => Promise.reject(new Error("the router stored a file")),
        fetch: () => Promise.reject(new Error("the router fetched a file")),
        createLink: () => Promise.reject(new Error("the router linked a file")),
        fetchLink: () =>
          Promise.reject(new Error("the router served a file link")),
      },
    },
    caller: createRequestPrincipal({ userId: "u1", groups: [] }, read),
  };
}

/** A reader that grants nothing, which is every person in Section 0 but the stub's own. */
const grantsNothing = () =>
  Promise.resolve({ keys: new Set<never>(), scopes: new Map() });

/** A reader holding one key of another module, which must not open this one. */
const grantsAnotherModule = () =>
  Promise.resolve({
    keys: new Set(["invoices:read" as const]),
    scopes: new Map(),
  });

describe("the placeholder router", () => {
  it("mounts one read procedure", () => {
    const caller = placeholderRouter.createCaller(contextWith(grantsNothing));

    expect(caller.read).toBeTypeOf("function");
  });

  it("refuses a caller without placeholder:read, before reading anything", async () => {
    const caller = placeholderRouter.createCaller(contextWith(grantsNothing));

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });

  it("refuses a caller holding another module's key", async () => {
    const caller = placeholderRouter.createCaller(
      contextWith(grantsAnotherModule)
    );

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });

  it("reaches the database once the stub grant allows the read", async () => {
    // The tripwire throws the moment the read starts, which is what proves the
    // check passed. The rows themselves are proved in the real-database test.
    const caller = placeholderRouter.createCaller(
      contextWith(createStubGrantReader())
    );

    await expect(caller.read()).rejects.toThrow(
      "the router read the database before the permission check"
    );
  });
});
