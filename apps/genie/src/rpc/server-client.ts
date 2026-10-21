import type { ModuleContract } from "@genie/core";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

/**
 * A typed RPC client for a caller outside the browser: an integration test or a smoke check that
 * reaches a running application over HTTP. It sends `Sec-Fetch-Site: same-origin`, the proof the
 * `/api/rpc` origin check accepts from a caller with no `Origin` (decision 5). Tests reach oRPC
 * through this file, never through `@orpc/*` (ADR 0011).
 */
export function createServerRpcClient<
  TContract extends ModuleContract,
>(options: {
  /** The absolute `/api/rpc` URL of the running application. */
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Replaces the network, to answer from an in-process handler. */
  readonly fetch?: (request: Request) => Promise<Response>;
}): ContractRouterClient<TContract> {
  const link = new RPCLink({
    url: options.url,
    headers: { "sec-fetch-site": "same-origin", ...options.headers },
    fetch: options.fetch ?? globalThis.fetch,
  });

  return createORPCClient(link);
}

/** A refusal as a client decoded it, or `undefined` for a failure that is not a refusal. */
export type RpcFailure = {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly data: unknown;
};

export function rpcFailureOf(cause: unknown): RpcFailure | undefined {
  if (!(cause instanceof ORPCError)) return undefined;

  return {
    code: cause.code,
    status: cause.status,
    message: cause.message,
    data: cause.data,
  };
}
