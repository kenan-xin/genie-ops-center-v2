import { type BrandingContract, CORE_ERROR_MESSAGES } from "@genie/core";
import {
  insertCredentialPerson,
  insertSession,
  markSetupDone,
  signedSessionCookie,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createServerRpcClient,
  rpcFailureOf,
} from "../src/rpc/server-client.ts";
import { TEST_AUTH_ENV } from "./auth-env.ts";
import { imageHostPort } from "./image-ports.ts";
import { startBuiltApp } from "./start-built-app.ts";

/**
 * The Branding procedures over the built application's `/api/rpc` with the browser's own encoding
 * (R-49, R-93): an upload is one multipart request, the 1 MB cap and the type list answer 400
 * `branding-upload-refused`, a failing color answers 400 `branding-invalid` with its issue, and
 * the `core:branding:manage` gate answers before the body is read. A request over the 2 MB cap of
 * `/api/rpc` answers 413 before oRPC reads it, and a 900 KB upload stays under it (DR-23).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

let managerCookie: string;

let outsiderCookie: string;

async function cookieFor(
  permissions: readonly string[],
  email: string
): Promise<string> {
  const userId = await insertCredentialPerson(deployment.context, {
    email,
    password: "branding-rpc-password-14",
    isBreakGlass: false,
    permissions,
  });

  return signedSessionCookie({
    token: await insertSession(deployment.context, { userId }),
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: "__Host-genie-session",
  });
}

function client(cookie?: string) {
  const url = `${server.baseUrl}/api/rpc`;

  return createServerRpcClient<{ branding: BrandingContract }>(
    cookie === undefined ? { url } : { url, headers: { cookie } }
  );
}

const refusalData = z.object({
  appCode: z.string(),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

async function refusal(call: Promise<unknown>) {
  const failure = rpcFailureOf(
    await call.then(
      () => undefined,
      (cause: unknown) => cause
    )
  );

  expect(failure).toBeDefined();

  const data = refusalData.parse(failure?.data);

  return {
    status: failure?.status,
    appCode: data.appCode,
    issues: data.issues,
  };
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);

  managerCookie = await cookieFor(
    ["core:branding:manage"],
    "branding-rpc-admin@example.com"
  );
  outsiderCookie = await cookieFor(
    ["core:settings:manage"],
    "branding-rpc-outsider@example.com"
  );

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3417)
  );
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop().catch(() => undefined);
});

describe("the branding RPC", () => {
  it("stores an ico upload in one multipart request and returns its preview link", async () => {
    const view = await client(managerCookie).branding.upload({
      file: new File([new Uint8Array([0, 0, 1, 0])], "favicon.ico", {
        type: "image/x-icon",
      }),
    });

    expect(view).toMatchObject({
      fileName: "favicon.ico",
      scanStatus: "skipped",
    });
    expect(view.url).toContain("/api/files/download?token=");
  });

  it("refuses a png over 1 MB and a pdf with branding-upload-refused at 400", async () => {
    const api = client(managerCookie).branding;

    expect(
      await refusal(
        api.upload({
          file: new File([new Uint8Array(1_048_577)], "big.png", {
            type: "image/png",
          }),
        })
      )
    ).toMatchObject({ status: 400, appCode: "branding-upload-refused" });
    expect(
      await refusal(
        api.upload({
          file: new File(["%PDF-1.7"], "report.pdf", {
            type: "application/pdf",
          }),
        })
      )
    ).toMatchObject({ status: 400, appCode: "branding-upload-refused" });
  });

  it("refuses an anonymous 5 MB request at 413 before any procedure runs (DR-23)", async () => {
    const form = new FormData();

    form.set(
      "0",
      new File([new Uint8Array(5_242_880)], "big.png", { type: "image/png" })
    );

    const response = await fetch(`${server.baseUrl}/api/rpc/branding/upload`, {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
      body: form,
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: "request-too-large",
      message: CORE_ERROR_MESSAGES["request-too-large"],
      requestId: response.headers.get("x-request-id"),
    });
  });

  it("stores a 900 KB upload, which stays under the request cap (DR-23)", async () => {
    const view = await client(managerCookie).branding.upload({
      file: new File([new Uint8Array(921_600)], "logo.png", {
        type: "image/png",
      }),
    });

    expect(view).toMatchObject({ fileName: "logo.png", sizeBytes: 921_600 });
  });

  it("refuses a failing color with branding-invalid and the primaryColor issue", async () => {
    expect(
      await refusal(
        client(managerCookie).branding.publish({
          draft: { primaryColor: "#ffff00" },
        })
      )
    ).toEqual({
      status: 400,
      appCode: "branding-invalid",
      issues: [
        {
          path: "primaryColor",
          message: "Fix the failing contrast checks first.",
        },
      ],
    });
  });

  it("refuses a caller without the branding key at 403 and an anonymous caller at 401", async () => {
    expect(await refusal(client(outsiderCookie).branding.read())).toMatchObject(
      {
        status: 403,
        appCode: "forbidden",
      }
    );
    expect(
      await refusal(
        client().branding.upload({
          file: new File(["x"], "favicon.ico"),
        })
      )
    ).toMatchObject({ status: 401, appCode: "unauthenticated" });
  });
});
