import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withTransaction } from "../src/index.ts";
import type { TenantTransaction } from "../src/index.ts";
import type {
  PermissionKey,
  ResourceRef,
} from "../src/lib/module-contract/keys.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { file, fileBlob } from "../src/schema.ts";
import type { RequestPrincipal } from "../src/services/authorization/index.ts";
import {
  createRequestPrincipal,
  createStubGrantReader,
  STUB_GRANTED_KEY,
} from "../src/services/authorization/index.ts";
import { startDisposableDeployment } from "./index.ts";

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
  fetchLink(
    input: LinkInput & { readonly token: string }
  ): Promise<FetchedFile>;
};

type FileTenantContext = TenantContext & {
  readonly fileStorage: FileStorageContract;
};

const resource: ResourceRef = { type: "document", id: "document-1" };

function principal(): RequestPrincipal {
  return createRequestPrincipal(
    { userId: "u1", groups: [] },
    createStubGrantReader()
  );
}

function storageFor(context: TenantContext): FileStorageContract {
  // SAFETY: this checkout predates the ticket's required context member; each case asserts it
  // exists before using the assumed interface so the red run identifies the missing member.
  const storage = (context as FileTenantContext).fileStorage;

  expect(storage).toBeDefined();

  return storage;
}

async function startStorageDeployment() {
  const deployment = await startDisposableDeployment();

  cleanups.push(() => deployment.stop());

  return deployment;
}

function upload(
  bytes: Buffer = PNG_BYTES,
  mimeType = "image/png",
  fileName = "pixel.png"
): StoreInput {
  return { bytes, mimeType, fileName, uploadedByUserId: null };
}

describe("FileStorage against a real Postgres deployment", () => {
  it("is a fixed member of the tenant context", async () => {
    const { context } = await startStorageDeployment();

    expect(Object.keys(context).toSorted()).toContain("fileStorage");
    expect(storageFor(context)).toBeDefined();
  });

  it("stores bytes in file_blob and fetches the original bytes with response metadata", async () => {
    const { context } = await startStorageDeployment();
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

  it("refuses an upload one byte over FILE_MAX_BYTES", async () => {
    const { context } = await startStorageDeployment();
    const oversized = Buffer.alloc(context.env.fileMaxBytes + 1, 0x41);

    await expect(
      withTransaction(context, (tx) =>
        storageFor(context).store(upload(oversized), tx)
      )
    ).rejects.toThrow(/size|limit|FILE_MAX_BYTES/i);
  });

  it("refuses a content type outside the upload allow-list", async () => {
    const { context } = await startStorageDeployment();

    await expect(
      withTransaction(context, (tx) =>
        storageFor(context).store(
          upload(PNG_BYTES, "application/x-malicious", "payload.bin"),
          tx
        )
      )
    ).rejects.toThrow(/type|mime|format|unsupported|allow/i);
  });

  it("stores a hostile SVG only after scripts, handlers, javascript URLs, foreignObject and external references are removed", async () => {
    const { context } = await startStorageDeployment();

    const hostileSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        "<script>alert(1)</script>" +
        '<g onload="alert(2)"></g>' +
        '<a href="javascript:alert(3)"><text>safe</text></a>' +
        "<foreignObject><div>unsafe</div></foreignObject>" +
        '<image href="https://attacker.invalid/image.png" />' +
        '<use xlink:href="https://attacker.invalid/sprite.svg#payload" />' +
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

  it("refuses an SVG with no drawable content after sanitizing", async () => {
    const { context } = await startStorageDeployment();

    const emptyAfterSanitizing = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>' +
        "<foreignObject><div>removed</div></foreignObject></svg>"
    );

    await expect(
      withTransaction(context, (tx) =>
        storageFor(context).store(
          upload(emptyAfterSanitizing, "image/svg+xml", "empty.svg"),
          tx
        )
      )
    ).rejects.toThrow(/empty|content|saniti/i);
  });

  it("serves a valid tokenized link and refuses the same link after its expiry", async () => {
    const { context } = await startStorageDeployment();

    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const identity = principal();

    const access = {
      fileId,
      principal: identity,
      permission: STUB_GRANTED_KEY,
      resource,
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const link = await storage.createLink(access);
    const fetched = await storage.fetchLink({ ...access, token: link.token });

    expect(fetched).toEqual({
      bytes: PNG_BYTES,
      mimeType: "image/png",
      fileName: "pixel.png",
    });

    vi.setSystemTime(new Date(link.expiresAt.getTime() + 1));

    await expect(
      storage.fetchLink({ ...access, token: link.token })
    ).rejects.toThrow(/expired|invalid|token/i);
  });

  it("binds each token to its file and refuses a tampered token", async () => {
    const { context } = await startStorageDeployment();

    const storage = storageFor(context);

    const ids = await withTransaction(context, async (tx) => {
      const first = await storage.store(upload(), tx);

      const second = await storage.store(
        upload(PNG_BYTES, "image/png", "other.png"),
        tx
      );

      return [first.id, second.id] as const;
    });

    const access = {
      fileId: ids[0],
      principal: principal(),
      permission: STUB_GRANTED_KEY,
      resource,
    };

    const link = await storage.createLink(access);

    await expect(
      storage.fetchLink({ ...access, fileId: ids[1], token: link.token })
    ).rejects.toThrow();

    const tamperedToken = `${link.token}x`;

    await expect(
      storage.fetchLink({ ...access, token: tamperedToken })
    ).rejects.toThrow(/invalid|token|signature/i);
  });

  it("checks permissions through can() before issuing and serving a link", async () => {
    const { context } = await startStorageDeployment();

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
      permission: STUB_GRANTED_KEY,
      resource: denied,
    };

    const link = await storage.createLink(allowed);

    await expect(
      storage.fetchLink({
        ...allowed,
        permission: deniedPermission,
        token: link.token,
      })
    ).rejects.toThrow(/permission|forbidden|authoriz/i);
  });

  it("writes metadata and bytes in the caller transaction so rollback leaves neither", async () => {
    const { context } = await startStorageDeployment();
    const observer = new Client({ connectionString: context.env.databaseUrl });

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
