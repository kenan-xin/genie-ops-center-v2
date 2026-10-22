import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { withTransaction } from "../src/index.ts";
import type { TenantTransaction } from "../src/index.ts";
import type {
  PermissionKey,
  ResourceRef,
} from "../src/lib/module-contract/keys.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { file, fileBlob } from "../src/schema.ts";
import type { RequestPrincipal } from "../src/services/authorization/index.ts";
import { createRequestPrincipal } from "../src/services/authorization/index.ts";
import type { PermissionGrants } from "../src/services/authorization/index.ts";
import { databaseClient } from "./database-client.ts";
import {
  type DisposableDeployment,
  startDisposableDeployment,
} from "./index.ts";

/** The key the file links in this file are created under; the file store only records it. */
const GRANTED_KEY: PermissionKey = "placeholder:read";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
  "base64"
);

type StoreInput = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
  readonly uploadedByUserId: string | null;
};

type StoredFile = { readonly id: string; readonly storageKey: string };

type FetchedFile = {
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
};

type LinkInput = {
  readonly fileId: string;
  readonly principal: RequestPrincipal;
  readonly permission: PermissionKey;
  readonly resource: ResourceRef;
};

type TokenizedLink = { readonly token: string; readonly expiresAt: Date };

type FileStorageContract = {
  store(input: StoreInput, tx: TenantTransaction): Promise<StoredFile>;
  fetch(fileId: string): Promise<FetchedFile>;
  createLink(input: LinkInput): Promise<TokenizedLink>;
  fetchLink(input: {
    readonly token: string;
    readonly principal: RequestPrincipal;
  }): Promise<FetchedFile>;
};

type FileTenantContext = TenantContext & {
  readonly fileStorage: FileStorageContract;
};

const resource: ResourceRef = { type: "document", id: "document-1" };

function principal(): RequestPrincipal {
  return createRequestPrincipal(
    { userId: "u1", groups: [], authenticated: true },
    () =>
      Promise.resolve({
        keys: new Set([GRANTED_KEY]),
        scopes: new Map([[GRANTED_KEY, { kind: "all" } as const]]),
      })
  );
}

function principalWithGrant(
  permission: PermissionKey,
  scope: ResourceRef
): RequestPrincipal {
  const grants: PermissionGrants = {
    keys: new Set([permission]),
    scopes: new Map([[permission, { kind: "some", scopes: [scope] }]]),
  };

  return createRequestPrincipal(
    { userId: "u1", groups: [], authenticated: true },
    () => Promise.resolve(grants)
  );
}

function storageFor(context: TenantContext): FileStorageContract {
  // SAFETY: this checkout predates the ticket's required context member; each case asserts it
  // exists before using the assumed interface so the red run identifies the missing member.
  const storage = (context as FileTenantContext).fileStorage;

  expect(storage).toBeDefined();

  return storage;
}

/**
 * One migrated deployment for the whole file. Every case stores its own file and reads it back by
 * the id `store` returned, and the rollback case compares counts it read itself, so no case
 * depends on another's rows.
 */
let deployment: DisposableDeployment;

beforeAll(async () => {
  deployment = await startDisposableDeployment();
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function upload(
  bytes: Buffer = PNG_BYTES,
  mimeType = "image/png",
  fileName = "pixel.png"
): StoreInput {
  return { bytes, mimeType, fileName, uploadedByUserId: null };
}

describe("FileStorage against a real Postgres deployment", () => {
  it("stores bytes in file_blob and fetches the original bytes with response metadata", async () => {
    const { context } = deployment;
    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const [metadata] = await context.db
      .select({
        id: file.id,
        storageKey: file.storageKey,
        scanStatus: file.scanStatus,
      })
      .from(file)
      .where(eq(file.id, fileId));

    const blobs = await context.db
      .select({ bytes: fileBlob.bytes })
      .from(fileBlob)
      .where(eq(fileBlob.id, fileId));

    const fetched = await storage.fetch(fileId);

    expect(blobs).toHaveLength(1);
    expect(Buffer.from(blobs[0]!.bytes)).toEqual(PNG_BYTES);
    expect(fetched).toEqual({
      bytes: PNG_BYTES,
      mimeType: "image/png",
      fileName: "pixel.png",
    });
    expect(metadata?.scanStatus).toBe("skipped");
    expect(metadata?.storageKey).toBeDefined();
    expect(metadata?.storageKey).not.toBe(fileId);
  });

  it("stores a hostile SVG only after scripts, handlers, javascript URLs, foreignObject and external references are removed", async () => {
    const { context } = deployment;

    const hostileSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        "<script>alert(1)</script>" +
        '<g onload="alert(2)"></g>' +
        '<a href="javascript:alert(3)"><text>safe</text></a>' +
        "<foreignObject><div>unsafe</div></foreignObject>" +
        '<image href="https://attacker.invalid/image.png" />' +
        '<use xlink:href="https://attacker.invalid/sprite.svg#payload" />' +
        '<a href="https://attacker.invalid/page"><text>external href</text></a>' +
        '<a xlink:href="//attacker.invalid/page"><text>external xlink</text></a>' +
        '<path fill="url(https://attacker.invalid/fill.svg#g)" stroke="url(https://attacker.invalid/stroke.svg#g)" d="M0 0" />' +
        '<path fill="u\\72l(https://attacker.invalid/escaped-fill.svg#g)" d="M0 0" />' +
        '<path filter="\\75rl(https://attacker.invalid/escaped-filter.svg#g)" d="M0 0" />' +
        '<path mask="u&#92;72l(//attacker.invalid/escaped-mask)" d="M0 0" />' +
        "</svg>"
    );

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storageFor(context).store(
        upload(hostileSvg, "image/svg+xml", "hostile.svg"),
        tx
      );

      return stored.id;
    });

    const sanitized = (await storageFor(context).fetch(fileId)).bytes.toString(
      "utf8"
    );

    expect(sanitized).toContain("<svg");
    expect(sanitized).toContain("safe");
    expect(sanitized).not.toMatch(
      /<script|onload|javascript:|foreignobject|attacker\.invalid/i
    );
  });

  it("serves a valid tokenized link and refuses the same link after its expiry", async () => {
    const { context } = deployment;

    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const identity = principal();

    const access = {
      fileId,
      principal: identity,
      permission: GRANTED_KEY,
      resource,
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const link = await storage.createLink(access);

    const fetched = await storage.fetchLink({
      token: link.token,
      principal: identity,
    });

    expect(fetched).toEqual({
      bytes: PNG_BYTES,
      mimeType: "image/png",
      fileName: "pixel.png",
    });

    vi.setSystemTime(new Date(link.expiresAt.getTime() + 1));

    await expect(
      storage.fetchLink({ token: link.token, principal: identity })
    ).rejects.toThrow(/expired|invalid|token/i);
  });

  it("binds the permission and resource to the token rather than fetchLink input", async () => {
    const { context } = deployment;

    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const permission: PermissionKey = "documents:read";
    const ownerResource = { type: "document", id: "document-owner" };
    const issuingPrincipal = principalWithGrant(permission, ownerResource);

    const link = await storage.createLink({
      fileId,
      principal: issuingPrincipal,
      permission,
      resource: ownerResource,
    });

    await expect(
      storage.fetchLink({ token: link.token, principal: issuingPrincipal })
    ).resolves.toMatchObject({ fileName: "pixel.png" });

    await expect(
      storage.fetchLink({
        token: link.token,
        principal: principalWithGrant("documents:download", ownerResource),
      })
    ).rejects.toThrow(/permission|forbidden|authoriz/i);

    await expect(
      storage.fetchLink({
        token: link.token,
        principal: principalWithGrant(permission, {
          type: ownerResource.type,
          id: "another-record",
        }),
      })
    ).rejects.toThrow(/permission|forbidden|authoriz/i);
  });

  it("checks permissions through can() before issuing and serving a link", async () => {
    const { context } = deployment;

    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const allowedPrincipal = principal();

    const denied = { ...resource };
    const deniedPermission: PermissionKey = "placeholder:admin";

    await expect(
      storage.createLink({
        fileId,
        principal: allowedPrincipal,
        permission: deniedPermission,
        resource: denied,
      })
    ).rejects.toThrow(/permission|forbidden|authoriz/i);

    const allowed = {
      fileId,
      principal: allowedPrincipal,
      permission: GRANTED_KEY,
      resource: denied,
    };

    const link = await storage.createLink(allowed);

    await expect(
      storage.fetchLink({
        token: link.token,
        principal: principalWithGrant(deniedPermission, denied),
      })
    ).rejects.toThrow(/permission|forbidden|authoriz/i);
  });

  it("refuses a forged link before reading the principal grants", async () => {
    const { context } = deployment;

    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const link = await storage.createLink({
      fileId,
      principal: principal(),
      permission: GRANTED_KEY,
      resource,
    });

    let grantReads = 0;

    const fetchPrincipal = createRequestPrincipal(
      { userId: "u1", groups: [], authenticated: true },
      () => {
        grantReads += 1;

        return Promise.resolve({
          keys: new Set([GRANTED_KEY]),
          scopes: new Map([[GRANTED_KEY, { kind: "all" } as const]]),
        });
      }
    );

    await expect(
      storage.fetchLink({ token: `${link.token}x`, principal: fetchPrincipal })
    ).rejects.toThrow(/invalid|token|signature/i);
    expect(grantReads).toBe(0);
  });

  it("writes metadata and bytes in the caller transaction so rollback leaves neither", async () => {
    const { context } = deployment;

    const observer = databaseClient({
      connectionString: context.env.databaseUrl,
    });

    cleanups.push(() => observer.end());
    await observer.connect();

    const before = await observer.query<{ files: number; blobs: number }>(
      "select (select count(*)::int from file) as files, (select count(*)::int from file_blob) as blobs"
    );

    let attemptedFileId: string | undefined;

    await expect(
      withTransaction(context, async (tx) => {
        const stored = await storageFor(context).store(upload(), tx);

        attemptedFileId = stored.id;

        throw new Error("roll back file upload");
      })
    ).rejects.toThrow("roll back file upload");

    const after = await observer.query<{ files: number; blobs: number }>(
      "select (select count(*)::int from file) as files, (select count(*)::int from file_blob) as blobs"
    );

    const [fileCountBefore, blobCountBefore] = [
      before.rows[0]?.files,
      before.rows[0]?.blobs,
    ];

    expect(attemptedFileId).toBeDefined();

    expect(after.rows[0]?.files).toBe(fileCountBefore);
    expect(after.rows[0]?.blobs).toBe(blobCountBefore);

    if (attemptedFileId !== undefined) {
      const orphan = await observer.query(
        "select id from file_blob where id = $1::uuid",
        [attemptedFileId]
      );

      expect(orphan.rows).toEqual([]);
    }
  });
});
