import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createFileLinkSecret, readFileLink, signFileLink } from "./token.ts";

const secret = createFileLinkSecret();

const later = () => new Date(Date.now() + 60_000);

describe("the download link token (R-38, Spec 3 R-39)", () => {
  it("round-trips a record scope with its permission and resource", () => {
    const scope = {
      kind: "record",
      fileId: "f1",
      permission: "placeholder:read",
      resource: { type: "document", id: "d:1" },
    } as const;

    expect(readFileLink(signFileLink(scope, later(), secret), secret)).toEqual(
      scope
    );
  });

  it("round-trips a branding scope as the file id alone", () => {
    const scope = { kind: "branding", fileId: "f2" } as const;

    expect(readFileLink(signFileLink(scope, later(), secret), secret)).toEqual(
      scope
    );
  });

  it("refuses a correctly signed payload that names no kind", () => {
    const payload = Buffer.from(
      JSON.stringify({
        fileId: "f3",
        permission: "placeholder:read",
        resourceType: "document",
        resourceId: "d1",
        expiresAt: later().getTime(),
      })
    ).toString("base64url");

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

    expect(() => readFileLink(`${payload}.${signature}`, secret)).toThrow(
      "The file link token is invalid or has expired."
    );
  });
});
