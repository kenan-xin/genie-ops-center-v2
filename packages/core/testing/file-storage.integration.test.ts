import { eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
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
import type { PermissionGrants } from "../src/services/authorization/index.ts";
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
    { userId: "u1", groups: [] },
    createStubGrantReader()
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

  return createRequestPrincipal({ userId: "u1", groups: [] }, () =>
    Promise.resolve(grants)
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

  it("accepts an upload exactly FILE_MAX_BYTES", async () => {
    const { context } = await startStorageDeployment();
    const bytes = Buffer.alloc(context.env.fileMaxBytes, 0x41);

    const stored = await withTransaction(context, (tx) =>
      storageFor(context).store(upload(bytes, "text/plain", "at-limit.txt"), tx)
    );

    const [row] = await context.db
      .select({ sizeBytes: file.sizeBytes })
      .from(file)
      .where(eq(file.id, stored.id));

    expect(row?.sizeBytes).toBe(context.env.fileMaxBytes);
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
        '<a href="https://attacker.invalid/page"><text>external href</text></a>' +
        '<a xlink:href="//attacker.invalid/page"><text>external xlink</text></a>' +
        '<path fill="url(https://attacker.invalid/fill.svg#g)" stroke="url(https://attacker.invalid/stroke.svg#g)" d="M0 0" />' +
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

  it("preserves drawing attributes and same-document paint references in an SVG logo", async () => {
    const { context } = await startStorageDeployment();

    const logo = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">' +
        '<path d="M0 0L64 64" stroke="#000" stroke-width="4" />' +
        '<circle cx="32" cy="32" r="10" fill="blue" />' +
        '<defs><linearGradient id="g"><stop offset="0%" stop-color="red" /></linearGradient></defs>' +
        '<rect x="4" y="4" width="5" height="5" fill="url(#g)" />' +
        '<a href="https://attacker.invalid/logo.svg"><text>external link</text></a>' +
        '<a xlink:href="https://attacker.invalid/icon.svg"><text>external xlink</text></a>' +
        '<path fill="url(https://attacker.invalid/fill.svg#g)" stroke="url(https://attacker.invalid/stroke.svg#g)" d="M1 1" />' +
        "</svg>"
    );

    const stored = await withTransaction(context, (tx) =>
      storageFor(context).store(upload(logo, "image/svg+xml", "logo.svg"), tx)
    );

    const bytes = (await storageFor(context).fetch(stored.id)).bytes;

    const dom = new JSDOM("");

    try {
      const document = new dom.window.DOMParser().parseFromString(
        bytes.toString("utf8"),
        "image/svg+xml"
      );

      const svg = document.documentElement;
      const path = svg.querySelector("path");
      const circle = svg.querySelector("circle");
      const rect = svg.querySelector("rect");

      expect(svg.getAttribute("width")).toBe("64");
      expect(svg.getAttribute("height")).toBe("64");
      expect(svg.getAttribute("viewBox")).toBe("0 0 64 64");
      expect(path?.getAttribute("d")).toBe("M0 0L64 64");
      expect(path?.getAttribute("stroke")).toBe("#000");
      expect(circle?.getAttribute("cx")).toBe("32");
      expect(circle?.getAttribute("cy")).toBe("32");
      expect(circle?.getAttribute("r")).toBe("10");
      expect(circle?.getAttribute("fill")).toBe("blue");
      expect(rect?.getAttribute("fill")).toBe("url(#g)");
      expect(document.getElementById("g")?.tagName).toBe("linearGradient");

      expect(bytes.toString("utf8")).not.toMatch(
        /attacker\.invalid|url\(https:/i
      );
    } finally {
      dom.window.close();
    }
  });

  it("stores SVG bytes with a non-breaking space that reparse as XML", async () => {
    const { context } = await startStorageDeployment();

    const bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>North\u00a0Star</text></svg>'
    );

    const dom = new JSDOM("");

    try {
      const stored = await withTransaction(context, (tx) =>
        storageFor(context).store(
          upload(bytes, "image/svg+xml", "nbsp.svg"),
          tx
        )
      );

      const fetched = await storageFor(context).fetch(stored.id);

      const document = new dom.window.DOMParser().parseFromString(
        fetched.bytes.toString("utf8"),
        "image/svg+xml"
      );

      expect(document.querySelector("parsererror")).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it("stores a DOCTYPE subset input as well-formed SVG XML", async () => {
    const { context } = await startStorageDeployment();

    const bytes = Buffer.from(
      '<!DOCTYPE svg [<!ENTITY label "North Star">]><svg xmlns="http://www.w3.org/2000/svg"><text>&label;</text></svg>'
    );

    const dom = new JSDOM("");

    try {
      const stored = await withTransaction(context, (tx) =>
        storageFor(context).store(
          upload(bytes, "image/svg+xml", "doctype.svg"),
          tx
        )
      );

      const fetched = await storageFor(context).fetch(stored.id);

      const document = new dom.window.DOMParser().parseFromString(
        fetched.bytes.toString("utf8"),
        "image/svg+xml"
      );

      expect(document.querySelector("parsererror")).toBeNull();
    } finally {
      dom.window.close();
    }
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
    const { context } = await startStorageDeployment();

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
        token: link.token,
        principal: principalWithGrant(deniedPermission, denied),
      })
    ).rejects.toThrow(/permission|forbidden|authoriz/i);
  });

  it("refuses a forged link before reading the principal grants", async () => {
    const { context } = await startStorageDeployment();

    const storage = storageFor(context);

    const fileId = await withTransaction(context, async (tx) => {
      const stored = await storage.store(upload(), tx);

      return stored.id;
    });

    const link = await storage.createLink({
      fileId,
      principal: principal(),
      permission: STUB_GRANTED_KEY,
      resource,
    });

    let grantReads = 0;

    const fetchPrincipal = createRequestPrincipal(
      { userId: "u1", groups: [] },
      () => {
        grantReads += 1;

        return Promise.resolve({
          keys: new Set([STUB_GRANTED_KEY]),
          scopes: new Map([[STUB_GRANTED_KEY, { kind: "all" } as const]]),
        });
      }
    );

    await expect(
      storage.fetchLink({ token: `${link.token}x`, principal: fetchPrincipal })
    ).rejects.toThrow(/invalid|token|signature/i);
    expect(grantReads).toBe(0);
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
