import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/errors/index.ts";
import { file, fileBlob } from "../src/schema.ts";
import {
  principalFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import type { RequestPrincipal } from "../src/services/authorization/principal.ts";
import {
  BRANDING_UPLOAD_BAD_SVG,
  BRANDING_UPLOAD_OVER_LIMIT,
} from "../src/services/branding/schemas.ts";
import { uploadBrandingImage } from "../src/services/branding/upload.ts";
import { insertPersonWith, startDisposableDeployment } from "./index.ts";

/**
 * The branding upload seam of Spec 3 (R-49, DEC-20) against a real Postgres: the 1 MB cap and the
 * four-type list run before the file store, and an accepted file is served through a signed link.
 */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
  "base64"
);

const ONE_MB = 1_048_576;

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let caller: RequestPrincipal;

beforeAll(async () => {
  deployment = await startDisposableDeployment();
  await seedRoles(deployment.context, []);

  const { userId } = await insertPersonWith(deployment.context, [
    "core:branding:manage",
  ]);

  caller = principalFor({
    tenant: deployment.context,
    modules: [],
    userId,
    authenticated: true,
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

async function fileCount(): Promise<number> {
  return (await deployment.context.db.select({ id: file.id }).from(file))
    .length;
}

async function refusal(
  input: {
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  },
  context = deployment.context
) {
  const before = await fileCount();

  const error: unknown = await uploadBrandingImage(context, caller, input).then(
    () => undefined,
    (cause: unknown) => cause
  );

  expect(await fileCount()).toBe(before);
  expect(error).toBeInstanceOf(AppError);

  // SAFETY: the line above proved the instance.
  const appError = error as AppError;

  return { code: appError.code, issues: appError.issues };
}

describe("uploadBrandingImage", () => {
  it.each([
    ["logo.png", "image/png", PNG_BYTES],
    [
      "logo.svg",
      "image/svg+xml",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'
      ),
    ],
    ["logo.webp", "image/webp", Buffer.from("RIFF\0\0\0\0WEBP")],
    ["favicon.ico", "image/x-icon", Buffer.from([0, 0, 1, 0])],
    ["favicon.ico", "image/vnd.microsoft.icon", Buffer.from([0, 0, 1, 0])],
  ])(
    "stores %s as %s with scan_status skipped and a link that serves it",
    async (fileName, mimeType, bytes) => {
      const view = await uploadBrandingImage(deployment.context, caller, {
        fileName,
        mimeType,
        bytes,
      });

      const [row] = await deployment.context.db
        .select({ scanStatus: file.scanStatus, mimeType: file.mimeType })
        .from(file)
        .where(eq(file.id, view.fileId));

      expect(row).toEqual({ scanStatus: "skipped", mimeType });
      expect(view).toMatchObject({ fileName, mimeType, scanStatus: "skipped" });
      expect(view.url).not.toBeNull();

      const token = new URL(view.url ?? "").searchParams.get("token") ?? "";

      const served = await deployment.context.fileStorage.fetchLink({
        token,
        principal: caller,
      });

      expect(served.mimeType).toBe(mimeType);
    }
  );

  it("accepts a file of exactly 1048576 bytes and refuses 1048577 bytes with no file row", async () => {
    const exact = await uploadBrandingImage(deployment.context, caller, {
      fileName: "exact.png",
      mimeType: "image/png",
      bytes: Buffer.alloc(ONE_MB),
    });

    expect(exact.sizeBytes).toBe(ONE_MB);
    expect(
      await refusal({
        fileName: "big.png",
        mimeType: "image/png",
        bytes: Buffer.alloc(ONE_MB + 1),
      })
    ).toEqual({
      code: "branding-upload-refused",
      issues: [{ path: "file", message: "This file is over 1 MB." }],
    });
  });

  it.each([
    ["report.pdf", "application/pdf"],
    ["photo.jpg", "image/jpeg"],
    [
      "sheet.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  ])(
    "refuses %s (%s) with branding-upload-refused",
    async (fileName, mimeType) => {
      expect(await refusal({ fileName, mimeType, bytes: PNG_BYTES })).toEqual({
        code: "branding-upload-refused",
        issues: [
          { path: "file", message: "Use a PNG, SVG, WebP or ICO file." },
        ],
      });
    }
  );

  it.each([
    [
      "a script-only svg",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      ),
    ],
    [
      "a UTF-16 svg",
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>',
          "utf16le"
        ),
      ]),
    ],
  ])("refuses %s with branding-upload-refused", async (_name, bytes) => {
    expect(
      await refusal({ fileName: "logo.svg", mimeType: "image/svg+xml", bytes })
    ).toEqual({
      code: "branding-upload-refused",
      issues: [{ path: "file", message: BRANDING_UPLOAD_BAD_SVG }],
    });
  });

  it("refuses a file over a FILE_MAX_BYTES below 1 MB with branding-upload-refused", async () => {
    const small = {
      ...deployment.context,
      env: { ...deployment.context.env, fileMaxBytes: 1000 },
    };

    expect(
      await refusal(
        {
          fileName: "logo.png",
          mimeType: "image/png",
          bytes: Buffer.alloc(1001),
        },
        small
      )
    ).toEqual({
      code: "branding-upload-refused",
      issues: [{ path: "file", message: BRANDING_UPLOAD_OVER_LIMIT }],
    });
  });

  it("stores an svg without its script element and its onload attribute", async () => {
    const view = await uploadBrandingImage(deployment.context, caller, {
      fileName: "hostile.svg",
      mimeType: "image/svg+xml",
      bytes: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="4" height="4"/></svg>'
      ),
    });

    const [blob] = await deployment.context.db
      .select({ bytes: fileBlob.bytes })
      .from(fileBlob)
      .where(eq(fileBlob.id, view.fileId));

    const stored = Buffer.from(blob?.bytes ?? []).toString("utf8");

    expect(stored).toContain("<rect");
    expect(stored).not.toMatch(/script|onload/i);
  });
});
