import { describe, expect, it } from "vitest";

import {
  isUnauthenticatedAnswer,
  UNAUTHENTICATED_APP_CODE,
} from "./unauthenticated.ts";

/** A tRPC error response carrying one app code, shaped exactly as the envelope the route writes. */
function answer(input: {
  readonly status: number;
  readonly appCode: string;
}): Response {
  return Response.json(
    {
      error: {
        message: "safe message",
        code: -32001,
        data: {
          code: "UNAUTHORIZED",
          httpStatus: input.status,
          appCode: input.appCode,
          requestId: "req-test",
        },
      },
    },
    { status: input.status }
  );
}

describe("isUnauthenticatedAnswer", () => {
  it("reads the unauthenticated app code from a 401 envelope", async () => {
    await expect(
      isUnauthenticatedAnswer(
        answer({ status: 401, appCode: UNAUTHENTICATED_APP_CODE })
      )
    ).resolves.toBe(true);
  });

  it("refuses an envelope whose app code is another refusal", async () => {
    await expect(
      isUnauthenticatedAnswer(answer({ status: 401, appCode: "forbidden" }))
    ).resolves.toBe(false);
  });

  it("refuses a 200 answer even when it names the code", async () => {
    await expect(
      isUnauthenticatedAnswer(
        answer({ status: 200, appCode: UNAUTHENTICATED_APP_CODE })
      )
    ).resolves.toBe(false);
  });

  it("refuses a 401 body that is not a tRPC envelope", async () => {
    await expect(
      isUnauthenticatedAnswer(
        Response.json({ code: "session_expired" }, { status: 401 })
      )
    ).resolves.toBe(false);
  });

  it("refuses a 401 body that is not JSON at all", async () => {
    await expect(
      isUnauthenticatedAnswer(
        new Response("not json", {
          status: 401,
          headers: { "content-type": "text/plain" },
        })
      )
    ).resolves.toBe(false);
  });
});
