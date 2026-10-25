import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";

/** The context's own database handle; the store writes through the caller's transaction. */
export type FileStorageDatabase = TenantContext["db"];

/**
 * The byte side of the file store, one implementation per `FILE_STORAGE_ADAPTER` (R-32, R-34).
 * It is the only runtime place the blob table is read or written, so a future object-store
 * adapter swaps this out without any caller changing. The key is the file id, and the row never
 * records which store holds the bytes.
 */
export type FileBlobStore = {
  /** Writes the bytes in the caller's transaction, keyed by the file id (R-33). */
  readonly put: (
    fileId: string,
    bytes: Buffer,
    tx: TenantTransaction
  ) => Promise<void>;
  /** Reads the bytes for one file, or `undefined` when the store holds none for it. */
  readonly get: (fileId: string) => Promise<Buffer | undefined>;
  /**
   * Deletes the bytes of the files in the caller's transaction, so a rollback keeps them (DR-20).
   * A store outside the database must delete them only after that transaction commits, through
   * `currentAfterCommit(tx)`.
   */
  readonly remove: (
    fileIds: readonly string[],
    tx: TenantTransaction
  ) => Promise<void>;
};
