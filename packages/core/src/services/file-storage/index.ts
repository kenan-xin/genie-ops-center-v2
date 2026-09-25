import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type {
  PermissionKey,
  ResourceRef,
} from "../../lib/module-contract/keys.ts";
import type {
  DeploymentEnvironment,
  FileStorageAdapter,
} from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { file } from "../../schema.ts";
import { can } from "../authorization/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { createPostgresFileBlobStore } from "./adapters/postgres.ts";
import type { FileBlobStore, FileStorageDatabase } from "./blob-store.ts";
import { sanitizeUploadedSvg } from "./sanitize-svg.ts";
import { createFileLinkSecret, readFileLink, signFileLink } from "./token.ts";

export type { FileBlobStore, FileStorageDatabase } from "./blob-store.ts";

/** The SVG type that goes through the sanitizer before it is stored (R-37). */
const SVG_MIME_TYPE = "image/svg+xml";

/** How long an issued download link stays valid. Short-lived, per R-38. */
const FILE_LINK_TTL_MS = 5 * 60 * 1000;

/**
 * The document and image types an upload may declare (R-36). A type not on this list is refused
 * before any byte is stored.
 */
export const UPLOAD_ALLOWED_MIME_TYPES: readonly string[] = Object.freeze([
  "application/pdf",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/tiff",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

/** What an upload declares: the name, the declared type, the bytes and the uploader (R-32). */
export type UploadFileInput = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
  readonly uploadedByUserId: string | null;
};

/** The identity of a stored file. The `storage_key` column stays internal (R-34). */
export type StoredFile = {
  readonly id: string;
};

/** The bytes and response metadata of one file. */
export type FetchedFile = {
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
};

/** What a caller passes to issue or serve a download link: the file and the `can()` check. */
export type FileLinkInput = {
  readonly fileId: string;
  readonly principal: RequestPrincipal;
  readonly permission: PermissionKey;
  readonly resource: ResourceRef;
};

/** A short-lived token and the moment it stops working (R-38). */
export type TokenizedFileLink = {
  readonly token: string;
  readonly expiresAt: Date;
};

/**
 * The serve step: the token and the principal asking for it. The permission and the resource are
 * read from the verified token, never from this input (R-38).
 */
export type FetchFileLinkInput = {
  readonly token: string;
  readonly principal: RequestPrincipal;
};

/**
 * The one file store every caller reaches through `context.fileStorage` (R-6, R-32). `store` and
 * `fetch` are the byte operations; `createLink` and `fetchLink` are the tokenized download pair,
 * each gated by the one `can()` seam (R-38, DEC-39).
 */
export type FileStorage = {
  readonly store: (
    input: UploadFileInput,
    tx: TenantTransaction
  ) => Promise<StoredFile>;
  readonly fetch: (fileId: string) => Promise<FetchedFile>;
  readonly createLink: (input: FileLinkInput) => Promise<TokenizedFileLink>;
  readonly fetchLink: (input: FetchFileLinkInput) => Promise<FetchedFile>;
};

/** Lower-cases a declared type and drops any parameters, so `image/PNG; x` is `image/png`. */
function normalizeMimeType(value: string): string {
  return (value.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * The opaque key for one file. It is derived from the file id alone, so every adapter computes
 * the same key and the row never records which store holds the bytes (R-34).
 */
function storageKeyFor(fileId: string): string {
  return createHash("sha256").update(fileId).digest("hex");
}

/**
 * Applies the size limit, the type allow-list and the SVG sanitizer, in that order, before any
 * byte reaches the adapter (R-35, R-36, R-37). The returned bytes and type are what gets stored.
 */
async function prepareUpload(input: UploadFileInput, fileMaxBytes: number) {
  if (input.bytes.length > fileMaxBytes) {
    throw new Error(
      `The upload is ${input.bytes.length} bytes, over the FILE_MAX_BYTES limit of ${fileMaxBytes}.`
    );
  }

  const mimeType = normalizeMimeType(input.mimeType);

  if (!UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `The content type "${input.mimeType}" is not on the upload allow-list.`
    );
  }

  const bytes =
    mimeType === SVG_MIME_TYPE
      ? await sanitizeUploadedSvg(input.bytes)
      : input.bytes;

  return { bytes, mimeType };
}

/**
 * Selects the byte store from `FILE_STORAGE_ADAPTER`. This section ships `postgres` (R-32); a
 * deployment that names an adapter without an implementation fails when the context is built,
 * not on the first upload.
 */
function createBlobStore(
  adapter: FileStorageAdapter,
  db: FileStorageDatabase
): FileBlobStore {
  if (adapter === "postgres") return createPostgresFileBlobStore(db);

  throw new Error(
    `The "${adapter}" file storage adapter is not implemented in this section; only "postgres" is available.`
  );
}

/** Refuses a link step the one `can()` seam does not grant (R-38, DEC-39). */
async function assertCan(
  principal: RequestPrincipal,
  permission: PermissionKey,
  resource: ResourceRef
): Promise<void> {
  const allowed = await can(principal, permission, resource);

  if (!allowed) throw new Error("Permission denied for this file link.");
}

/**
 * Builds the context's file store. It writes no global and no second connection: the metadata
 * goes through the caller's transaction and the bytes through the selected adapter (R-33).
 */
export function createFileStorage(
  db: FileStorageDatabase,
  env: Pick<DeploymentEnvironment, "fileStorageAdapter" | "fileMaxBytes">
): FileStorage {
  const blobStore = createBlobStore(env.fileStorageAdapter, db);
  const secret = createFileLinkSecret();

  async function fetch(fileId: string): Promise<FetchedFile> {
    const [row] = await db
      .select({
        fileName: file.fileName,
        mimeType: file.mimeType,
        scanStatus: file.scanStatus,
      })
      .from(file)
      .where(eq(file.id, fileId));

    if (row === undefined) {
      throw new Error(`No file is recorded with the id "${fileId}".`);
    }

    // A file is served only when it is clean or skipped; `pending` waits for a scanner (R-39).
    if (row.scanStatus !== "clean" && row.scanStatus !== "skipped") {
      throw new Error(
        `The file "${fileId}" is not available while its scan is ${row.scanStatus}.`
      );
    }

    const bytes = await blobStore.get(fileId);

    if (bytes === undefined) {
      throw new Error(`The bytes of file "${fileId}" are missing.`);
    }

    return { bytes, mimeType: row.mimeType, fileName: row.fileName };
  }

  return {
    async store(input, tx) {
      const { bytes, mimeType } = await prepareUpload(input, env.fileMaxBytes);
      const id = randomUUID();
      const storageKey = storageKeyFor(id);

      // The row and the bytes share the caller's transaction, so a rollback leaves neither (D-6).
      await tx.insert(file).values({
        id,
        storageKey,
        fileName: input.fileName,
        mimeType,
        sizeBytes: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        scanStatus: "skipped",
        uploadedByUserId: input.uploadedByUserId,
      });

      await blobStore.put(id, bytes, tx);

      return { id };
    },
    fetch,
    async createLink(input) {
      await assertCan(input.principal, input.permission, input.resource);

      const expiresAt = new Date(Date.now() + FILE_LINK_TTL_MS);

      // The scope is signed into the token, so serving cannot widen the authorization decision.
      const scope = {
        fileId: input.fileId,
        permission: input.permission,
        resource: input.resource,
      };

      return {
        token: signFileLink(scope, expiresAt, secret),
        expiresAt,
      };
    },
    async fetchLink(input) {
      // Verify first: a forged token costs no `can()` work (Section 2 reads the database there).
      const scope = readFileLink(input.token, secret);

      await assertCan(input.principal, scope.permission, scope.resource);

      return fetch(scope.fileId);
    },
  };
}
