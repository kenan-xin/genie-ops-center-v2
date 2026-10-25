import type { QueryResultRow } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AppError } from "../src/lib/errors/index.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import {
  principalFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import type { RequestPrincipal } from "../src/services/authorization/principal.ts";
import { applyBranding, readBranding } from "../src/services/branding/index.ts";
import type { BrandingDraft } from "../src/services/branding/schemas.ts";
import { uploadBrandingImage } from "../src/services/branding/upload.ts";
import {
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The Branding page service of Spec 3 (R-44, R-45, R-49, AC-5) against a real Postgres: one
 * Publish writes the changed columns and one `core:branding_published` row in one transaction, a
 * refusal changes nothing, and an image renders only while its scan is clean or skipped.
 */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
  "base64"
);

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let actorUserId: string;

let caller: RequestPrincipal;

async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  return (await deployment.context.db.$client.query<Row>(text, values)).rows;
}

beforeAll(async () => {
  deployment = await startDisposableDeployment();
  await markSetupDone(deployment.context);
  await seedRoles(deployment.context, []);

  ({ userId: actorUserId } = await insertPersonWith(deployment.context, [
    "core:branding:manage",
  ]));
  await query("update \"user\" set name = 'Ada Admin' where id = $1", [
    actorUserId,
  ]);

  caller = principalFor({
    tenant: deployment.context,
    modules: [],
    userId: actorUserId,
    authenticated: true,
  });
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

let since: Date;

beforeEach(async () => {
  await query(
    `update tenant_branding set company_name = 'E2E', product_name = 'Genie', primary_color = null,
       primary_foreground = null, default_theme = 'system', logo_light_file_id = null,
       logo_dark_file_id = null, logo_mark_file_id = null, favicon_file_id = null,
       login_background_file_id = null, login_background_color = null, login_welcome_text = null,
       login_notice_text = null, login_notice_requires_acknowledgement = false,
       updated_by_user_id = null`
  );
  const [row] = await query<{ now: Date }>("select clock_timestamp() as now");

  since = row?.now ?? new Date();
});

afterEach(() => {
  vi.useRealTimers();
});

async function published() {
  return query<{ metadata: { changedFields: string[] } }>(
    "select metadata from audit_event where action = 'core:branding_published' and occurred_at >= $1",
    [since]
  );
}

async function brandingRow() {
  const [row] = await query("select * from tenant_branding");

  return row;
}

async function storedFile(mimeType: string, fileName: string): Promise<string> {
  const stored = await withTransaction(deployment.context, (tx) =>
    deployment.context.fileStorage.store(
      { fileName, mimeType, bytes: PNG_BYTES, uploadedByUserId: null },
      tx
    )
  );

  return stored.id;
}

/** Uploads one PNG through the branding seam and answers its file id. */
async function imageId(fileName: string): Promise<string> {
  const image = await uploadBrandingImage(deployment.context, caller, {
    fileName,
    mimeType: "image/png",
    bytes: PNG_BYTES,
  });

  return image.fileId;
}

/** Which of the ids still have a `file` row and which still have bytes, each list sorted. */
async function storedFiles(ids: readonly string[]) {
  const present = async (table: "file" | "file_blob") =>
    (
      await query<{ id: string }>(
        `select id from ${table} where id = any($1::uuid[])`,
        [ids]
      )
    )
      .map((row) => row.id)
      .toSorted();

  return { files: await present("file"), blobs: await present("file_blob") };
}

async function refusalOf(draft: Partial<BrandingDraft>) {
  const error: unknown = await applyBranding(deployment.context, {
    actorUserId,
    draft,
  }).then(
    () => undefined,
    (cause: unknown) => cause
  );

  expect(error).toBeInstanceOf(AppError);

  // SAFETY: the line above proved the instance.
  return error as AppError;
}

describe("applyBranding", () => {
  it("writes three changed fields, the stored foreground and one audit row naming them", async () => {
    const result = await applyBranding(deployment.context, {
      actorUserId,
      draft: {
        companyName: "Acme",
        primaryColor: "#0f766e",
        defaultTheme: "dark",
      },
    });

    expect(result).toEqual({
      changed: true,
      changedFields: ["companyName", "primaryColor", "defaultTheme"],
    });
    expect(await brandingRow()).toMatchObject({
      company_name: "Acme",
      product_name: "Genie",
      primary_color: "#0f766e",
      primary_foreground: "#ffffff",
      default_theme: "dark",
      updated_by_user_id: actorUserId,
    });
    expect(await published()).toEqual([
      {
        metadata: {
          changedFields: ["companyName", "primaryColor", "defaultTheme"],
        },
      },
    ]);
  });

  it("answers changed false for the stored values and writes no audit row", async () => {
    const { draft } = await readBranding(deployment.context, caller);

    expect(
      await applyBranding(deployment.context, { actorUserId, draft })
    ).toEqual({
      changed: false,
      changedFields: [],
    });
    expect(await published()).toEqual([]);
    expect((await brandingRow())?.["updated_by_user_id"]).toBeNull();
  });

  it("refuses a failing color, an empty company name and a pdf or missing file id, changing nothing", async () => {
    const pdfId = await storedFile("application/pdf", "report.pdf");
    const before = await brandingRow();

    const cases: readonly [Partial<BrandingDraft>, string][] = [
      [{ primaryColor: "#ffff00" }, "primaryColor"],
      [{ companyName: "" }, "companyName"],
      [{ logoLightFileId: pdfId }, "logoLightFileId"],
      [
        { logoMarkFileId: "00000000-0000-4000-8000-000000000000" },
        "logoMarkFileId",
      ],
    ];

    const errors = await Promise.all(cases.map(([draft]) => refusalOf(draft)));

    expect(errors.map((error) => error.code)).toEqual(
      cases.map(() => "branding-invalid")
    );
    expect(
      errors.map((error) => error.issues?.map((issue) => issue.path))
    ).toEqual(cases.map(([, path]) => [path]));

    expect(await brandingRow()).toEqual(before);
    expect(await published()).toEqual([]);
  });

  it("refuses an unrelated publish while a stored image id has no file row, naming each dead slot", async () => {
    await query(
      "update tenant_branding set logo_light_file_id = $1, logo_mark_file_id = $2",
      [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ]
    );

    const error = await refusalOf({ companyName: "Acme" });

    expect(error.code).toBe("branding-invalid");
    expect(error.issues).toEqual([
      {
        path: "logoLightFileId",
        message:
          "The logo for light backgrounds is missing. Remove it or upload it again.",
      },
      {
        path: "logoMarkFileId",
        message: "The square mark is missing. Remove it or upload it again.",
      },
    ]);
    expect(await brandingRow()).toMatchObject({ company_name: "E2E" });
    expect(await published()).toEqual([]);
  });

  it("lets two concurrent publishes each name only their own change", async () => {
    await Promise.all([
      applyBranding(deployment.context, {
        actorUserId,
        draft: { companyName: "Acme" },
      }),
      applyBranding(deployment.context, {
        actorUserId,
        draft: { productName: "Acme Ops" },
      }),
    ]);

    expect(await brandingRow()).toMatchObject({
      company_name: "Acme",
      product_name: "Acme Ops",
    });
    expect(
      (await published()).map((row) => row.metadata.changedFields).toSorted()
    ).toEqual([["companyName"], ["productName"]]);
  });

  it("deletes the images a publish replaced or removed and keeps every image a column or a draft still names", async () => {
    const [replaced, removed, shared, next, unpublished] = await Promise.all([
      imageId("replaced.png"),
      imageId("removed.png"),
      imageId("shared.png"),
      imageId("next.png"),
      imageId("unpublished.png"),
    ]);

    await applyBranding(deployment.context, {
      actorUserId,
      draft: {
        logoLightFileId: replaced,
        logoMarkFileId: shared,
        faviconFileId: removed,
      },
    });
    // The sign-in background, which no page edits, still names `shared`. The dark logo slot holds
    // an id with no file row, as in the dead-id case above.
    await query(
      "update tenant_branding set login_background_file_id = $1, logo_dark_file_id = $2",
      [shared, "00000000-0000-4000-8000-000000000003"]
    );

    expect(
      await applyBranding(deployment.context, {
        actorUserId,
        draft: {
          logoLightFileId: next,
          logoDarkFileId: null,
          logoMarkFileId: null,
          faviconFileId: null,
        },
      })
    ).toEqual({
      changed: true,
      changedFields: [
        "logoLightFileId",
        "logoDarkFileId",
        "logoMarkFileId",
        "faviconFileId",
      ],
    });

    // `unpublished` stands for an upload in another administrator's draft.
    const kept = [shared, next, unpublished].toSorted();

    expect(
      await storedFiles([replaced, removed, shared, next, unpublished])
    ).toEqual({ files: kept, blobs: kept });
  });
});

describe("readBranding", () => {
  it("shows a publish at once and names the actor as the last publisher", async () => {
    await applyBranding(deployment.context, {
      actorUserId,
      draft: { companyName: "Acme" },
    });

    const view = await readBranding(deployment.context, caller);

    expect(view.draft.companyName).toBe("Acme");
    expect(view.draft.primaryColor).toBe("#2563eb");
    expect(view.lastPublished.by).toBe("Ada Admin");
  });

  // The branding reader caches for ten seconds (DEC-46). Each case moves the clock further past it,
  // so a value cached at an earlier case's clock never looks fresh.
  let clockShift = 0;

  it.each(["pending", "infected"])(
    "returns no url while the scan is %s, and the shell issues no mark link",
    async (status) => {
      const image = await uploadBrandingImage(deployment.context, caller, {
        fileName: "mark.png",
        mimeType: "image/png",
        bytes: PNG_BYTES,
      });

      await applyBranding(deployment.context, {
        actorUserId,
        draft: { logoMarkFileId: image.fileId },
      });
      await query("update file set scan_status = $1 where id = $2", [
        status,
        image.fileId,
      ]);

      clockShift += 60_000;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + clockShift);

      const view = await readBranding(deployment.context, caller);

      expect(view.images.logoMark).toMatchObject({
        scanStatus: status,
        url: null,
      });
      await expect(
        deployment.context.fileStorage.createBrandingMarkLink({
          principal: caller,
        })
      ).resolves.toBeUndefined();
    }
  );
});
