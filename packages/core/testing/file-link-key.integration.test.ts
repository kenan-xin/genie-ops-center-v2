import { inspect } from "node:util";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTransaction } from "../src/index.ts";
import type { PermissionKey } from "../src/lib/module-contract/keys.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { createRequestPrincipal } from "../src/services/authorization/index.ts";
import { FileLinkRefusedError } from "../src/services/file-storage/token.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  type DisposableDeployment,
  startDisposableDeployment,
} from "./index.ts";

const KEY: PermissionKey = "placeholder:read";

const resource = { type: "document", id: "document-1" };

const bytes = Buffer.from("shared link bytes");

const principal = createRequestPrincipal(
  { userId: "u1", groups: [], authenticated: true },
  () =>
    Promise.resolve({
      keys: new Set([KEY]),
      scopes: new Map([[KEY, { kind: "all" } as const]]),
    })
);

let first: DisposableDeployment;

let second: DisposableDeployment;

const copies: TenantContext[] = [];

/** One more app copy on the same database as `deployment`, with its own pool and memory. */
function copyOf(deployment: DisposableDeployment): TenantContext {
  const context = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    silentLogger(),
    []
  );

  copies.push(context);

  return context;
}

/** Stores one file through `context` and returns its id. */
async function storeFile(context: TenantContext): Promise<string> {
  const stored = await withTransaction(context, (tx) =>
    context.fileStorage.store(
      {
        bytes,
        mimeType: "text/plain",
        fileName: "shared.txt",
        uploadedByUserId: null,
      },
      tx
    )
  );

  return stored.id;
}

async function linkFrom(context: TenantContext, fileId: string) {
  const { token } = await context.fileStorage.createLink({
    fileId,
    principal,
    permission: KEY,
    resource,
  });

  return token;
}

beforeAll(async () => {
  [first, second] = await Promise.all([
    startDisposableDeployment(),
    startDisposableDeployment(),
  ]);
}, 120000);

afterAll(async () => {
  await Promise.all(copies.map((context) => context.db.$client.end()));
  await Promise.all([first?.stop(), second?.stop()]);
});

describe("database file link key", () => {
  it("a link signed in one context opens in a second context on the same database", async () => {
    const fileId = await storeFile(first.context);
    const token = await linkFrom(first.context, fileId);

    const opened = await copyOf(first).fileStorage.fetchLink({
      token,
      principal,
    });

    expect(opened.bytes).toEqual(bytes);
  });

  it("two contexts that load the key at the same time agree on one key", async () => {
    const fileId = await storeFile(second.context);
    const a = copyOf(second);
    const b = copyOf(second);

    const [fromA, fromB] = await Promise.all([
      linkFrom(a, fileId),
      linkFrom(b, fileId),
    ]);

    expect(
      (await b.fileStorage.fetchLink({ token: fromA, principal })).bytes
    ).toEqual(bytes);
    expect(
      (await a.fileStorage.fetchLink({ token: fromB, principal })).bytes
    ).toEqual(bytes);

    const { rows } = await second.context.db.execute<{ count: number }>(
      sql`select count(*)::int as count from file_link_key`
    );

    expect(rows[0]?.count).toBe(1);
  });

  it("a failed load shows no query parameter and is retried on the next call", async () => {
    const fileId = await storeFile(first.context);
    const copy = copyOf(first);

    await first.context.db.execute(
      sql`alter table file_link_key rename to file_link_key_away`
    );

    try {
      const failure: unknown = await linkFrom(copy, fileId).then(
        () => undefined,
        (cause: unknown) => cause
      );

      const shown = inspect(failure, { depth: 5 });

      expect(failure).toBeInstanceOf(Error);
      expect(shown).toContain("file_link_key");
      expect(shown).not.toContain("params");
      expect(shown).not.toContain("insert into");
    } finally {
      await first.context.db.execute(
        sql`alter table file_link_key_away rename to file_link_key`
      );
    }

    const token = await linkFrom(copy, fileId);

    expect(
      (await copy.fileStorage.fetchLink({ token, principal })).bytes
    ).toEqual(bytes);
  });

  it("a link from another database is refused", async () => {
    const fileId = await storeFile(first.context);
    const token = await linkFrom(first.context, fileId);

    await expect(
      copyOf(second).fileStorage.fetchLink({ token, principal })
    ).rejects.toBeInstanceOf(FileLinkRefusedError);
  });
});
