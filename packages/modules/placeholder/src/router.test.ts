import {
  createRequestPrincipal,
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
 * The three readers with the module enabled: the entitlement gate reads `isEnabled` and gets
 * `true`, while settings and branding stay at the same tripwire as the database, because a module
 * procedure must refuse an unpermitted caller before it reads them (R-5, DEC-34).
 */
function readersWithModuleEnabled(): Pick<
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
      isEnabled: () => Promise.resolve(true),
    },
  };
}

function contextWithModuleDisabled(
  read: Parameters<typeof createRequestPrincipal>[1]
): ModuleRequestContext {
  const context = contextWith(read);

  return {
    ...context,
    tenant: {
      ...context.tenant,
      entitlements: { isEnabled: () => Promise.resolve(false) },
    },
  };
}

function contextWith(
  read: Parameters<typeof createRequestPrincipal>[1]
): ModuleRequestContext {
  return {
    tenant: {
      // SAFETY: this router never reads or enters an authentication callback scope.
      authRequestScope: {} as TenantContext["authRequestScope"],
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
        runtimeMode: "production",
        mailProvider: "none",
        mailFrom: undefined,
        resendApiKey: undefined,
        smtpUrl: undefined,
      },
      ...readersWithModuleEnabled(),
      jobQueue: {
        enqueue: () => Promise.reject(new Error("the router enqueued a job")),
        schedule: () => Promise.reject(new Error("the router scheduled a job")),
      },
      events: {
        emit: () =>
          Promise.reject(
            new Error("the router emitted an event outside a transaction")
          ),
        on: () => {
          throw new Error("the router registered an event handler");
        },
      },
      capabilities: {
        provide: () => {
          throw new Error("the router provided a capability");
        },
        get: () => {
          throw new Error("the router looked up a capability");
        },
      },
      fileStorage: {
        store: () => Promise.reject(new Error("the router stored a file")),
        fetch: () => Promise.reject(new Error("the router fetched a file")),
        createLink: () => Promise.reject(new Error("the router linked a file")),
        fetchLink: () =>
          Promise.reject(new Error("the router served a file link")),
      },
      mailer: {
        provider: "none",
        requireConfigured: () => {},
        send: () => Promise.reject(new Error("the router sent mail")),
      },
      publicUrl: () => {
        throw new Error("the router built a public link");
      },
    },
    caller: createRequestPrincipal({ userId: "u1", groups: [] }, read),
  };
}

/**
 * A reader holding `placeholder:read`. This unit layer only proves the check runs before the
 * tripwire database; the real grant through a real role assignment is proved in `testing/`.
 */
const grantsRead = () =>
  Promise.resolve({
    keys: new Set(["placeholder:read" as const]),
    scopes: new Map([["placeholder:read" as const, { kind: "all" } as const]]),
  });

/** A reader that grants nothing. */
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

  it("refuses a disabled placeholder through its own procedure", async () => {
    const caller = placeholderRouter.createCaller(
      contextWithModuleDisabled(grantsRead)
    );

    await expect(caller.read()).rejects.toMatchObject({
      cause: { code: "module-disabled" },
    });
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

  it("reaches the database once the grant allows the read", async () => {
    // The tripwire throws the moment the read starts, which is what proves the
    // check passed. The rows themselves are proved in the real-database test.
    const caller = placeholderRouter.createCaller(contextWith(grantsRead));

    await expect(caller.read()).rejects.toThrow(
      "the router read the database before the permission check"
    );
  });
});
