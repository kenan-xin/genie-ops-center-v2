import { createHash, randomUUID } from "node:crypto";

import { queryDatabase } from "./database.ts";

/** A 1×1 opaque PNG. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c63e02fcbfb0f00037e01f3a9df61700000000049454e44ae426082",
  "hex"
);

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

/**
 * Seeds the branding square mark the way the postgres file adapter stores one: a `file` row whose
 * `storage_key` is the sha256 of its id, its `file_blob`, and `tenant_branding.logo_mark_file_id`.
 * The caller holds the `branding` deployment lock.
 */
export async function seedBrandingMark(input: {
  readonly scanStatus: "skipped" | "pending";
}): Promise<void> {
  const id = randomUUID();

  await queryDatabase(
    `insert into file (id, storage_key, file_name, mime_type, size_bytes, checksum, scan_status)
       values ('${id}', '${sha256(id)}', 'mark.png', 'image/png', ${PNG.length}, '${sha256(PNG)}', '${input.scanStatus}');
     insert into file_blob (id, bytes) values ('${id}', decode('${PNG.toString("hex")}', 'hex'));
     update tenant_branding set logo_mark_file_id = '${id}'`
  );
}

/** Nulls the mark column, then deletes the file rows it named. */
export async function clearBrandingMark(): Promise<void> {
  const [id] = await queryDatabase(
    "select logo_mark_file_id from tenant_branding where logo_mark_file_id is not null"
  );

  await queryDatabase("update tenant_branding set logo_mark_file_id = null");

  if (id !== undefined) {
    await queryDatabase(
      `delete from file_blob where id = '${id}'; delete from file where id = '${id}'`
    );
  }
}
