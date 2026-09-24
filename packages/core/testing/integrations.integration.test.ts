import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { tenantIntegration } from "../src/schema.ts";
import { createLogger } from "../src/services/logging/index.ts";
import { startDisposableDeployment } from "./index.ts";

const SECRET_REF = "GENIE_TEST_INTEGRATION_API_KEY";

const OTHER_SECRET = "GENIE_TEST_UNRELATED_SECRET";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

type ResolvedIntegration = {
  readonly id: string;
  readonly config: JsonValue;
  readonly secret: string | undefined;
  readonly status?: string;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

async function resolveIntegration(
  context: TenantContext,
  integrationId: string
): Promise<ResolvedIntegration> {
  const service = await import("../src/services/integrations/index.ts");

  return service.resolveIntegration(context, integrationId);
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  const pending = cleanups.splice(0);

  await Promise.all(pending.slice(1).map((cleanup) => cleanup()));
  await pending[0]?.();
  vi.restoreAllMocks();
});

function contextWithLogLevel(
  databaseUrl: string,
  logLevel: (typeof LOG_LEVELS)[number]
) {
  const context = createTenantContext(
    {
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://test.example.invalid",
      LOG_LEVEL: logLevel,
    },
    createLogger({ logLevel }),
    []
  );

  cleanups.push(() => context.db.$client.end());

  return context;
}

async function withEnvironment<T>(
  values: Readonly<Record<string, string | undefined>>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function captureProcessOutput<T>(
  run: () => Promise<T>
): Promise<{ readonly value: T; readonly output: string }> {
  const writes: string[] = [];

  const capture = (chunk: string | Uint8Array): boolean => {
    writes.push(Buffer.from(chunk).toString("utf8"));

    return true;
  };

  // SAFETY: the stream write overloads pass the written chunk as the first argument.
  const captureWrite = capture as typeof process.stdout.write;

  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(captureWrite);

  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(captureWrite);

  try {
    const value = await run();

    return { value, output: writes.join("") };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

describe("integration resolver against a real database", () => {
  it("returns non-secret configuration and the live secret at call time without storing the credential", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const config = {
      baseUrl: "https://records.example.invalid/api",
      region: "eu",
    };

    const inserted = await deployment.context.db
      .insert(tenantIntegration)
      .values({
        moduleId: "records",
        kind: "http",
        name: "Records API",
        config,
        secretRef: SECRET_REF,
      })
      .returning({ id: tenantIntegration.id });

    const integration = inserted[0];

    expect(integration).toBeDefined();

    if (integration === undefined)
      throw new Error("Integration insert returned no row.");

    const { id } = integration;

    const secret = "integration-secret-that-must-not-be-logged";

    const outputs: string[] = [];
    let resolved: Awaited<ReturnType<typeof resolveIntegration>> | undefined;

    for (const logLevel of LOG_LEVELS) {
      const context = contextWithLogLevel(
        deployment.context.env.databaseUrl,
        logLevel
      );

      // The process environment is shared, so each level must be restored before the next.
      // oxlint-disable-next-line no-await-in-loop
      const captured = await withEnvironment({ [SECRET_REF]: secret }, () =>
        captureProcessOutput(() => resolveIntegration(context, id))
      );

      outputs.push(captured.output);
      resolved = captured.value;
    }

    const [stored] = await deployment.context.db
      .select()
      .from(tenantIntegration)
      .where(eq(tenantIntegration.id, id));

    expect(resolved).toBeDefined();

    if (resolved === undefined)
      throw new Error("Resolver returned no integration.");

    expect(resolved).toMatchObject({ id, config, secret });

    const { secret: resolvedSecret, ...nonSecretConfiguration } = resolved;

    expect(resolvedSecret).toBe(secret);

    expect(JSON.stringify(nonSecretConfiguration)).not.toContain(secret);
    expect(stored).toMatchObject({ secretRef: SECRET_REF, config });
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(outputs.join("")).not.toContain(secret);
  }, 120000);

  it("reads a rotated secret at each call and refuses once the environment value is removed", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const inserted = await deployment.context.db
      .insert(tenantIntegration)
      .values({
        moduleId: "records",
        kind: "http",
        name: "Records API",
        config: { baseUrl: "https://records.example.invalid/api" },
        secretRef: SECRET_REF,
      })
      .returning({ id: tenantIntegration.id });

    const integration = inserted[0];

    expect(integration).toBeDefined();

    if (integration === undefined)
      throw new Error("Integration insert returned no row.");

    const context = contextWithLogLevel(
      deployment.context.env.databaseUrl,
      "info"
    );

    const secretA = "integration-secret-version-a";
    const secretB = "integration-secret-version-b";

    const first = await withEnvironment({ [SECRET_REF]: secretA }, () =>
      resolveIntegration(context, integration.id)
    );

    const second = await withEnvironment({ [SECRET_REF]: secretB }, () =>
      resolveIntegration(context, integration.id)
    );

    const absent = await withEnvironment(
      { [SECRET_REF]: undefined },
      async () => {
        try {
          await resolveIntegration(context, integration.id);
        } catch (error) {
          return error;
        }

        return undefined;
      }
    );

    expect(first.secret).toBe(secretA);
    expect(second.secret).toBe(secretB);

    expect(absent).toBeInstanceOf(Error);

    if (absent instanceof Error) {
      expect(absent.message).toContain(SECRET_REF);
    }
  }, 120000);

  it("resolves an integration with no secret reference and returns undefined secret", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const inserted = await deployment.context.db
      .insert(tenantIntegration)
      .values({
        moduleId: "records",
        kind: "http",
        name: "Public records API",
        config: { baseUrl: "https://records.example.invalid/api" },
        secretRef: null,
      })
      .returning({ id: tenantIntegration.id });

    const integration = inserted[0];

    expect(integration).toBeDefined();

    if (integration === undefined)
      throw new Error("Integration insert returned no row.");

    const resolved = await withEnvironment({ [SECRET_REF]: undefined }, () =>
      resolveIntegration(deployment.context, integration.id)
    );

    expect(resolved).toMatchObject({
      id: integration.id,
      config: { baseUrl: "https://records.example.invalid/api" },
      secret: undefined,
    });
  }, 120000);

  it("rejects a missing integration id and names the id in the error", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const missingId = "00000000-0000-4000-8000-000000000001";

    await expect(
      resolveIntegration(deployment.context, missingId)
    ).rejects.toThrow(missingId);
  }, 120000);

  it("returns integration status so the caller can decide whether to use it", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const inserted = await deployment.context.db
      .insert(tenantIntegration)
      .values({
        moduleId: "records",
        kind: "http",
        name: "Disabled records API",
        config: { baseUrl: "https://records.example.invalid/api" },
        secretRef: null,
        status: "disabled",
      })
      .returning({ id: tenantIntegration.id });

    const integration = inserted[0];

    expect(integration).toBeDefined();

    if (integration === undefined)
      throw new Error("Integration insert returned no row.");

    const resolved = await resolveIntegration(
      deployment.context,
      integration.id
    );

    expect(resolved.status).toBe("disabled");
  }, 120000);

  it("names an absent secret reference without exposing another secret in the error or output", async () => {
    const deployment = await startDisposableDeployment();

    cleanups.push(deployment.stop);

    const inserted = await deployment.context.db
      .insert(tenantIntegration)
      .values({
        moduleId: "records",
        kind: "http",
        name: "Records API",
        config: { baseUrl: "https://records.example.invalid/api" },
        secretRef: SECRET_REF,
      })
      .returning({ id: tenantIntegration.id });

    const integration = inserted[0];

    expect(integration).toBeDefined();

    if (integration === undefined)
      throw new Error("Integration insert returned no row.");

    const { id } = integration;

    const unrelatedSecret = "unrelated-secret-that-must-not-be-exposed";

    const outputs: string[] = [];

    for (const logLevel of LOG_LEVELS) {
      const context = contextWithLogLevel(
        deployment.context.env.databaseUrl,
        logLevel
      );

      // The process environment is shared, so each level must be restored before the next.
      // oxlint-disable-next-line no-await-in-loop
      const captured = await withEnvironment(
        {
          [SECRET_REF]: undefined,
          [OTHER_SECRET]: unrelatedSecret,
        },
        () =>
          captureProcessOutput(async () => {
            try {
              await resolveIntegration(context, id);
            } catch (error) {
              return error;
            }

            return undefined;
          })
      );

      outputs.push(captured.output);

      const error = captured.value;

      expect(error).toBeInstanceOf(Error);

      if (!(error instanceof Error)) continue;

      expect(error.message).toContain(SECRET_REF);

      expect(error.message).not.toContain(unrelatedSecret);
      expect(error.stack).not.toContain(unrelatedSecret);
      expect(JSON.stringify(error)).not.toContain(unrelatedSecret);
    }

    expect(outputs.join("")).not.toContain(unrelatedSecret);
  }, 120000);
});
