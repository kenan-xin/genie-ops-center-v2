import { eq, inArray } from "drizzle-orm";

import { fileBlob } from "../../../schema.ts";
import type { FileBlobStore, FileStorageDatabase } from "../blob-store.ts";

/**
 * The default adapter: bytes in the tenant database (DEC-20, R-32). It is the only module that
 * touches the `file_blob` table. The blob is keyed by the file id, so the caller writes or deletes
 * the `file` row and this row in one transaction, and a rollback undoes both (R-33, D-6).
 */
export function createPostgresFileBlobStore(
  db: FileStorageDatabase
): FileBlobStore {
  return {
    async put(fileId, bytes, tx) {
      await tx.insert(fileBlob).values({ id: fileId, bytes });
    },
    async get(fileId) {
      const [row] = await db
        .select({ bytes: fileBlob.bytes })
        .from(fileBlob)
        .where(eq(fileBlob.id, fileId));

      return row?.bytes;
    },
    async remove(fileIds, tx) {
      await tx.delete(fileBlob).where(inArray(fileBlob.id, fileIds));
    },
  };
}
