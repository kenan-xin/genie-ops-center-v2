import {
  type AuthMember,
  createTenantContext,
  type FetchedFile,
  type FileStorage,
} from "@genie/core";
import { afterAll, describe, expect, it } from "vitest";

import { type AppContext, publishContext } from "../../../../context.ts";
import { GET } from "./route.ts";

const PUBLIC_URL = "https://ops.example.invalid";

/** What the stub file store answers; each case sets it before its visit. */
let served: () => Promise<FetchedFile>;

const unused = () => Promise.reject(new Error("the route does not call this"));

/** The auth member the route reads; only its session read answers, as no one signed in. */
const auth: AuthMember = {
  handler: unused,
  getSession: () => Promise.resolve(null),
  sessionState: unused,
  endIdleSession: unused,
  recordActivity: unused,
  listOwnSessions: unused,
  revokeOwnSession: unused,
  revokeOtherOwnSessions: unused,
  beginKeycloakSignIn: unused,
  signOut: unused,
  discovery: () => ({ ready: true }),
  ensureDiscovery: () => Promise.resolve({ ready: true }),
};

// The pool opens no connection until a query, and the route makes none.
const tenant = createTenantContext(
  { DATABASE_URL: "postgres://genie:secret@127.0.0.1:1/genie", PUBLIC_URL },
  { error: () => undefined, info: () => undefined, debug: () => undefined },
  []
);

const fileStorage: FileStorage = {
  store: unused,
  fetch: unused,
  createLink: unused,
  createBrandingMarkLink: unused,
  fetchLink: () => served(),
};

// SAFETY: the route reads only `tenant`; the remaining members are unused by this one handler.
publishContext({ tenant: { ...tenant, auth, fileStorage } } as AppContext);

afterAll(async () => {
  await tenant.db.$client.end();
});

function visit(query = "?token=abc"): Promise<Response> {
  return GET(new Request(`${PUBLIC_URL}/api/files/download${query}`));
}

function file(mimeType: string, fileName: string): FetchedFile {
  return { bytes: Buffer.from("bytes"), mimeType, fileName };
}

describe("GET /api/files/download (Spec 1 R-38)", () => {
  it("answers 404 without a token", async () => {
    served = () => Promise.resolve(file("image/png", "mark.png"));

    const response = await visit("");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 404 with an empty body when the file store refuses", async () => {
    served = () =>
      Promise.reject(new Error("Permission denied for this file link."));

    const response = await visit();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("serves an image inline with a private cache", async () => {
    served = () => Promise.resolve(file("image/png", "mark one.png"));

    const response = await visit();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("content-disposition")).toBe(
      "inline; filename*=UTF-8''mark%20one.png"
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("bytes");
  });

  it("sandboxes an inline SVG opened as a document", async () => {
    served = () => Promise.resolve(file("image/svg+xml", "mark.svg"));

    const response = await visit();

    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox"
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves a document as an attachment", async () => {
    served = () => Promise.resolve(file("application/pdf", "report.pdf"));

    const response = await visit();

    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''report.pdf"
    );
  });
});
