import { describe, expect, it } from "vitest";

import { DISCOVERY_TIMEOUT_MS } from "./config.ts";
import { createDiscoveryProbe } from "./discovery.ts";

const DISCOVERY_URL =
  "https://id.example.com/realms/genie/.well-known/openid-configuration";

const ISSUER = "https://id.example.com/realms/genie";

/** The document shape this test builds; the fields are optional so a case can omit one. */
type TestDiscoveryDocument = {
  readonly issuer?: string;
  readonly authorization_endpoint?: string;
  readonly token_endpoint?: string;
  readonly jwks_uri?: string;
  readonly end_session_endpoint?: string;
};

/** A fetch that answers one JSON body with a 200. */
function jsonFetch(body: TestDiscoveryDocument): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
}

const DOCUMENT: TestDiscoveryDocument = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
};

function probe(fetchImpl: typeof fetch, timeoutMs = DISCOVERY_TIMEOUT_MS) {
  return createDiscoveryProbe({
    discoveryUrl: DISCOVERY_URL,
    expectedIssuer: ISSUER,
    fetchImpl,
    timeoutMs,
  });
}

describe("the discovery probe", () => {
  it("is ready when the document names the issuer and carries the endpoints (R-54d)", async () => {
    const result = await probe(jsonFetch(DOCUMENT)).probe();

    expect(result).toEqual({
      ready: true,
      endSessionEndpoint: DOCUMENT.end_session_endpoint,
    });
  });

  it("is ready with no end-session endpoint when the document omits it", async () => {
    const { end_session_endpoint: _omitted, ...withoutLogout } = DOCUMENT;
    const result = await probe(jsonFetch(withoutLogout)).probe();

    expect(result).toEqual({ ready: true, endSessionEndpoint: undefined });
  });

  it("refuses an issuer other than the configured one (R-54d)", async () => {
    const result = await probe(
      jsonFetch({
        ...DOCUMENT,
        issuer: "https://elsewhere.example.com/realms/genie",
      })
    ).probe();

    expect(result).toEqual({ ready: false, cause: "issuer_mismatch" });
  });

  it("treats a non-200 answer as not answering", async () => {
    const result = await probe(() =>
      Promise.resolve(new Response("nope", { status: 503 }))
    ).probe();

    expect(result).toEqual({ ready: false, cause: "discovery_unreachable" });
  });

  it("treats a thrown fetch as not answering", async () => {
    const result = await probe(() =>
      Promise.reject(new Error("connection refused"))
    ).probe();

    expect(result).toEqual({ ready: false, cause: "discovery_unreachable" });
  });

  it("treats a document without the exchange endpoints as not answering", async () => {
    const result = await probe(
      jsonFetch({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth` })
    ).probe();

    expect(result).toEqual({ ready: false, cause: "discovery_unreachable" });
  });

  it("treats a document without jwks_uri as not answering, because id tokens must be verified", async () => {
    const { jwks_uri: _omitted, ...withoutKeys } = DOCUMENT;
    const result = await probe(jsonFetch(withoutKeys)).probe();

    expect(result).toEqual({ ready: false, cause: "discovery_unreachable" });
  });

  it("bounds a fetch that never answers, so sign-in never waits forever", async () => {
    const result = await probe(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        }),
      10
    ).probe();

    expect(result).toEqual({ ready: false, cause: "discovery_unreachable" });
  });
});
