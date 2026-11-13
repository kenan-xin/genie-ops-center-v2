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
  TEST_FILE_LINK_SECRET,
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

let deployment: DisposableDeployment;

const others: TenantContext[] = [];

/** One more app copy on the same database, with its own pool and its own link secret. */
function copy(secret: string | undefined): TenantContext {
  const context = createTenantContext(
    {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
      FILE_LINK_SECRET: secret,
    },
    silentLogger(),
    []
  );

  others.push(context);

  return context;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment();
}, 120000);

afterAll(async () => {
  await Promise.all(others.map((context) => context.db.$client.end()));
  await deployment?.stop();
});

describe("shared file link secret", () => {
  it("serves a link from one copy through another copy with the same secret, and only that", async () => {
    const a = deployment.context;

    const stored = await withTransaction(a, (tx) =>
      a.fileStorage.store(
        {
          bytes,
          mimeType: "text/plain",
          fileName: "shared.txt",
          uploadedByUserId: null,
        },
        tx
      )
    );

    const { token } = await a.fileStorage.createLink({
      fileId: stored.id,
      principal,
      permission: KEY,
      resource,
    });

    const b = copy(TEST_FILE_LINK_SECRET);

    expect((await b.fileStorage.fetchLink({ token, principal })).bytes).toEqual(
      bytes
    );

    const other = copy("another-file-link-secret-of-32-chars!");

    await expect(
      other.fileStorage.fetchLink({ token, principal })
    ).rejects.toBeInstanceOf(FileLinkRefusedError);

    const unset = copy(undefined);

    const fault =
      "FILE_LINK_SECRET is not set; this process cannot sign file links.";

    await expect(
      unset.fileStorage.createLink({
        fileId: stored.id,
        principal,
        permission: KEY,
        resource,
      })
    ).rejects.toThrow(fault);
    await expect(
      unset.fileStorage.fetchLink({ token, principal })
    ).rejects.toThrow(fault);
  });
});
