import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  countInWindow,
  logsUntilOrThrow,
  pollHealth,
  startImage,
  type RunningImage,
} from "./image-process.ts";

/**
 * The viewer provider-count proof (R-49a, AC-25), read from the container log
 * of the real image rather than from code: exactly one provider call for a
 * normal viewer document, and none for a background request at the same URL.
 *
 * The background forms are Next's own navigation traffic — an RSC flight, a
 * router prefetch, and the Link prefetch header — and each is sent to
 * `/viewer/placeholder` itself, the URL where the reviewed defect lived, not to
 * a path where absence is unremarkable. The normal document is the positive
 * control: it proves the counter sees real provider calls at all, so a zero
 * below is a measured zero.
 *
 * Every claim is measured inside a checkpoint window, never by sleeping. The
 * window opens when the log is read before the request (the checkpoint) and
 * closes at a sentinel barrier: a second, unique request — `/api/health`,
 * which invokes no provider, carrying its own fresh request id — issued only
 * after the target response has been received. The application logs through
 * one pino destination in one process, so byte order is logging order: a
 * provider line for the target is written before the target response
 * completes, therefore before the sentinel is issued, therefore before the
 * sentinel's own request line is written. The sentinel marker is waited for
 * with a barrier that THROWS if it never arrives, so a stalled or missing
 * barrier fails the proof instead of measuring a window that does not exist.
 * Provider lines inside the window are exactly the target request's; the
 * target's own request line cannot serve as the barrier, because the proxy
 * writes it before the provider runs.
 */
const PORT = 3412;

const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Written once per provider call by the counted wrapper in the bootstrap. */
const PROVIDER_LINE = "frame origin provider invoked";

/** The policy a background request keeps: frames denied, nothing widened. */
const BASELINE =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

/** The policy the viewer document carries: the module's one frame origin. */
const VIEWER_POLICY =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com";

let database: Awaited<ReturnType<typeof startDisposableDeployment>>;

let image: RunningImage;

/**
 * Issues one request to the viewer URL and returns the provider invocation
 * count inside its checkpoint window: from the log read taken before the
 * request to the sentinel barrier observed after the response completed.
 */
async function providerInvocationsFor(
  headers: Readonly<Record<string, string>>
): Promise<{ response: Response; invocations: number }> {
  const checkpoint = await image.logs();

  const response = await fetch(`${BASE_URL}/viewer/placeholder`, {
    headers: { ...headers },
  });

  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);

  // The sentinel: a unique request through the same logger, issued only after
  // the target response completed, so its request line postdates everything
  // the target logged.
  const sentinel = await fetch(`${BASE_URL}/api/health`);

  const sentinelId = sentinel.headers.get("x-request-id");

  expect(sentinelId).toMatch(/^[0-9a-f-]{36}$/);

  const logs = await logsUntilOrThrow(image, `"requestId":"${sentinelId}"`);

  return {
    response,
    invocations: countInWindow(
      logs,
      checkpoint,
      `"requestId":"${sentinelId}"`,
      PROVIDER_LINE
    ),
  };
}

beforeAll(async () => {
  database = await startDisposableDeployment([]);

  image = await startImage(
    {
      DATABASE_URL: database.context.env.databaseUrl,
      PUBLIC_URL: "https://example.invalid",
    },
    PORT
  );

  const observations = await pollHealth(PORT);

  expect(observations.some((observation) => observation.status === 200)).toBe(
    true
  );
}, 240000);

afterAll(async () => {
  await image?.stop();
  await database?.stop();
});

describe("the viewer URL", () => {
  it("a normal viewer document invokes the frame origin provider exactly once", async () => {
    const { response, invocations } = await providerInvocationsFor({});

    expect(response.status).toBe(200);

    // The document the browser would render carries the module's frame origin,
    // which is the one provider call the policy needs.
    expect(response.headers.get("content-security-policy")).toBe(VIEWER_POLICY);

    expect(invocations).toBe(1);
  }, 240000);

  it("an RSC request at the viewer URL invokes no provider", async () => {
    const { response, invocations } = await providerInvocationsFor({
      RSC: "1",
    });

    expect(response.status).toBe(200);

    // A background request keeps the deny baseline, never the viewer policy.
    expect(response.headers.get("content-security-policy")).toBe(BASELINE);

    expect(invocations).toBe(0);
  }, 240000);

  it("a next-router-prefetch request at the viewer URL invokes no provider", async () => {
    const { response, invocations } = await providerInvocationsFor({
      "next-router-prefetch": "1",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(BASELINE);

    expect(invocations).toBe(0);
  }, 240000);

  it("a purpose-prefetch request at the viewer URL invokes no provider", async () => {
    const { response, invocations } = await providerInvocationsFor({
      purpose: "prefetch",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(BASELINE);

    expect(invocations).toBe(0);
  }, 240000);
});
