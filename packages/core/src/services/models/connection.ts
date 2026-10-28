import { z } from "zod";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { MODEL_KEY_PATTERN } from "../settings/schemas.ts";

export const MODEL_PROVIDER_BASE_URL = "https://openrouter.ai/api/v1";

/** The one origin a model request may reach. It derives from the base URL, the one value a DEC-55 revisit changes. */
export const MODEL_PROVIDER_ORIGIN = new URL(MODEL_PROVIDER_BASE_URL).origin;

export const MODEL_REQUEST_TIMEOUT_MS = 120_000;

export type ModelTransport = typeof globalThis.fetch;

export type ModelConnection = {
  readonly transport: ModelTransport;
  readonly timeoutMs: number;
};

const denyingBody = z.object({
  provider: z.object({ data_collection: z.literal("deny") }),
});

function deniesDataCollection(body: BodyInit | null | undefined): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the provider sends its body as a JSON string
  if (typeof body !== "string") return false;

  try {
    return denyingBody.safeParse(JSON.parse(body)).success;
  } catch {
    return false;
  }
}

/**
 * The fetch every model request passes (R-19, AC-5): the allowed origin only, a body that denies
 * data collection whatever a call option set, no redirect, and a time limit whose signal reaches
 * the response body, so a stalled stream stops too. With `apiKey`, it sets the authorization header
 * itself after the checks, so the key lives only in this closure and never in the model a caller
 * holds (R-17, `DEC-53`).
 */
export function guardedModelFetch(
  transport: ModelTransport,
  limits: {
    readonly origin: string;
    readonly timeoutMs: number;
    readonly apiKey?: string;
  }
): ModelTransport {
  return async (input, init) => {
    const { origin } = new URL(input instanceof Request ? input.url : input);

    if (origin !== limits.origin) {
      throw new Error(
        `A model request may go only to ${limits.origin}, not ${origin}.`
      );
    }

    if (!deniesDataCollection(init?.body)) {
      throw new Error("A model request must deny data collection.");
    }

    const timeout = AbortSignal.timeout(limits.timeoutMs);

    const headers = new Headers(init?.headers);

    if (limits.apiKey !== undefined) {
      // Headers.set names the whole value in its error, so a key it would refuse never reaches it.
      if (!MODEL_KEY_PATTERN.test(limits.apiKey)) {
        throw new Error(
          "The stored model provider key holds a character that a request header cannot carry. Store the key again."
        );
      }

      headers.set("authorization", `Bearer ${limits.apiKey}`);
    }

    return transport(input, {
      ...init,
      headers,
      redirect: "error",
      signal: init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
    });
  };
}

const DEFAULT_CONNECTION: ModelConnection = {
  transport: (input, init) => globalThis.fetch(input, init),
  timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
};

const connections = new WeakMap<TenantContext, ModelConnection>();

/** Test seam: only @genie/core/testing calls it, and product code cannot import that (R-39 lint). */
export function setModelConnection(
  tenant: TenantContext,
  connection: ModelConnection
): void {
  connections.set(tenant, connection);
}

export function modelConnectionOf(tenant: TenantContext): ModelConnection {
  return connections.get(tenant) ?? DEFAULT_CONNECTION;
}
