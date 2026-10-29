// Type-only imports are erased, so this browser file pulls no core runtime into the bundle.
import type {
  AuditContract,
  BrandingContract,
  CategoriesContract,
  GroupsContract,
  ModulesContract,
  PeopleContract,
  RolesContract,
  SettingsContract,
} from "@genie/core";
import { appErrorData } from "@genie/core/rpc";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

import {
  isUnauthenticatedAnswer,
  SESSION_EXPIRED_PATH,
} from "../unauthenticated.ts";

/**
 * The contracts the browser calls: core's eight administration areas. A module's browser code
 * reaches its own router at runtime through `useModuleClient`, which reads its entry from this
 * client's Proxy by module id; the type does not enumerate module contracts.
 */
type BrowserContract = {
  readonly audit: AuditContract;
  readonly groups: GroupsContract;
  readonly people: PeopleContract;
  readonly roles: RolesContract;
  readonly modules: ModulesContract;
  readonly categories: CategoriesContract;
  readonly settings: SettingsContract;
  readonly branding: BrandingContract;
};

const link = new RPCLink({
  // `RPCLink` needs an absolute URL. A function defers the read of `window` to the first call, so
  // a server render that imports this file never touches it.
  url: () => new URL("/api/rpc", window.location.origin),
  // The session rendered under is gone (idle-expired, capped or revoked): land the browser on the
  // sign-in page's expired state instead of leaving a bare error behind (R-14, R-17a).
  fetch: async (request, init) => {
    const response = await globalThis.fetch(request, init);

    if (await isUnauthenticatedAnswer(response)) {
      window.location.assign(SESSION_EXPIRED_PATH);
    }

    return response;
  },
});

/**
 * The browser's one RPC client, typed from the contracts alone. It reaches `/api/rpc` with
 * `RPCLink`'s default `POST`, and the server builds the request principal from the real session on
 * every call, so the client never decides authorization. A module singleton, so a suspended first
 * render does not discard it.
 */
export const rpc: ContractRouterClient<BrowserContract> =
  createORPCClient(link);

/** Why a call failed, as the save copy names it. `unknown` names no cause. */
export type FailureKind =
  | "network"
  | "timeout"
  | "refused"
  | "conflict"
  | "invalid"
  | "unknown";

/**
 * A refusal as a screen shows it: its kind, the server's own reason (empty when it gave none a
 * person can act on), when rate-limited the wait, and for an invalid write its issues.
 */
export type Refusal = {
  readonly kind: FailureKind;
  readonly message: string;
  readonly retryAfterMinutes?: number;
  readonly issues?: readonly {
    readonly path: string;
    readonly message: string;
  }[];
};

// Catalogue texts that name no reason of their own; the save copy of their kind replaces them.
const GENERIC_CODES = new Set(["forbidden", "invalid-input", "internal-error"]);

function kindOfStatus(status: number): FailureKind {
  if (status === 408 || status === 504) return "timeout";

  if (status === 400 || status === 413 || status === 422) return "invalid";

  if (status === 401 || status === 403 || status === 429) return "refused";

  if (status === 404 || status === 409) return "conflict";

  return status === 500 ? "unknown" : "network";
}

/**
 * Reads a failed call. A transport refusal carries the catalogue's safe message and the data
 * `appErrorData` describes. Anything else has no message a person can use: a network failure, or
 * an answer the route wrote outside the interceptor (the origin refusal, an unknown path), whose
 * `ORPCError` holds only oRPC's fallback text.
 */
export function refusalOf(cause: unknown): Refusal {
  if (!(cause instanceof ORPCError)) {
    const timedOut =
      cause instanceof DOMException &&
      (cause.name === "TimeoutError" || cause.name === "AbortError");

    return { kind: timedOut ? "timeout" : "network", message: "" };
  }

  const data = appErrorData.safeParse(cause.data);

  if (!data.success) return { kind: kindOfStatus(cause.status), message: "" };

  const { appCode, retryAfterMinutes, issues } = data.data;
  const status = kindOfStatus(cause.status);

  // A module's refusal is missing from the status table and answers 500; a 502 reads as network.
  const kind =
    appCode === "internal-error"
      ? "unknown"
      : status === "unknown" || status === "network"
        ? "refused"
        : status;

  let refusal: Refusal = {
    kind,
    message: GENERIC_CODES.has(appCode) ? "" : cause.message,
  };

  if (retryAfterMinutes !== undefined)
    refusal = { ...refusal, retryAfterMinutes };

  if (issues !== undefined) refusal = { ...refusal, issues };

  return refusal;
}
