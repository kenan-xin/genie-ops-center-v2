import { describe, expect, it } from "vitest";

import { prepareUpload } from "./index.ts";

const LIMIT = 1024;

function upload(bytes: Buffer, mimeType = "text/plain") {
  return { fileName: "upload.txt", mimeType, bytes, uploadedByUserId: null };
}

describe("prepareUpload, the checks before any byte is stored (R-35, R-36)", () => {
  it("accepts an upload of exactly FILE_MAX_BYTES", async () => {
    const bytes = Buffer.alloc(LIMIT, 0x41);

    await expect(prepareUpload(upload(bytes), LIMIT)).resolves.toEqual({
      bytes,
      mimeType: "text/plain",
    });
  });

  it("refuses an upload one byte over FILE_MAX_BYTES", async () => {
    await expect(
      prepareUpload(upload(Buffer.alloc(LIMIT + 1, 0x41)), LIMIT)
    ).rejects.toThrow("over the FILE_MAX_BYTES limit of 1024");
  });

  it("refuses a content type outside the upload allow-list", async () => {
    await expect(
      prepareUpload(upload(Buffer.from("x"), "application/x-malicious"), LIMIT)
    ).rejects.toThrow("is not on the upload allow-list");
  });

  it("normalizes a declared type's case and parameters before the allow-list check", async () => {
    await expect(
      prepareUpload(
        upload(Buffer.from("x"), "Text/PLAIN; charset=utf-8"),
        LIMIT
      )
    ).resolves.toMatchObject({ mimeType: "text/plain" });
  });
});
