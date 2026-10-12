// Type-only imports are erased, so this browser file pulls no core runtime into the bundle.
import type {
  AuditContract,
  GroupsContract,
  PeopleContract,
  RolesContract,
} from "@genie/core";
import { appErrorData } from "@genie/core/rpc";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

import {
  isUnauthenticatedAnswer,
  SESSION_EXPIRED_PATH,
} from "../unauthenticated.ts";

/** The contracts the browser calls: core's four administration areas. */
type BrowserContract = {
  readonly audit: AuditContract;
  readonly groups: GroupsContract;
  readonly people: PeopleContract;
  readonly roles: RolesContract;
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

/** A refusal as a screen shows it: the catalogue message and, when rate-limited, the wait. */
export type Refusal = {
  readonly message: string;
  readonly retryAfterMinutes?: number;
};

/**
 * Reads a failed call. A transport refusal carries the catalogue's safe message and the data
 * `appErrorData` describes; anything else (a network failure) has no message a person can use.
 */
export function refusalOf(cause: unknown): Refusal {
  if (!(cause instanceof ORPCError)) return { message: "" };

  const data = appErrorData.safeParse(cause.data);
  const minutes = data.success ? data.data.retryAfterMinutes : undefined;

  return minutes === undefined
    ? { message: cause.message }
    : { message: cause.message, retryAfterMinutes: minutes };
}
