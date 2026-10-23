import {
  AppError,
  type AppErrorIssue,
  CORE_ERRORS,
  GENERIC_ERROR_CODE,
  type ModuleRPCContext,
  safeMessageFor,
} from "@genie/core";
import { ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { httpStatusForCode } from "../http-errors.ts";
import type { AppRouter } from "./router.ts";

/** The path the handler serves, and the prefix it strips before it matches a procedure. */
export const RPC_PREFIX = "/api/rpc";

/**
 * What every procedure reads: the module request context, with the request id the route always
 * supplies, so a refusal body and its log line share one value (R-46, AC-15).
 */
export type RequestContext = ModuleRPCContext & { readonly requestId: string };

/** The data of every refusal: built fresh, never copied from oRPC's own `data` (decision 6). */
type RefusalData = {
  readonly appCode: string;
  readonly requestId: string;
  readonly retryAfterMinutes?: number;
  readonly issues?: readonly AppErrorIssue[];
};

function refusal(
  appCode: string,
  message: string,
  data: RefusalData
): ORPCError<string, RefusalData> {
  return new ORPCError(appCode, {
    status: httpStatusForCode(appCode),
    message,
    data,
  });
}

/**
 * The one error mapping of the RPC transport (ADR 0011, decision 6). An `AppError` keeps its
 * catalogue code and fixed safe message, and takes its status from `httpStatusForCode`, so a
 * procedure and an ordinary route answer the same status. oRPC's own `BAD_REQUEST` (input
 * validation) and a decode failure answer `invalid-input`. Everything else answers the generic
 * entry at 500. No cause, stack or zod issue reaches the body.
 */
export function toTransportError(input: {
  readonly cause: unknown;
  readonly requestId: string;
  /** Whether the procedure client was entered, so the request body had already decoded. */
  readonly procedureStarted: boolean;
}): ORPCError<string, RefusalData> {
  const { cause, requestId } = input;

  if (cause instanceof AppError) {
    let data: RefusalData = { appCode: cause.code, requestId };

    if (cause.retryAfterMinutes !== undefined) {
      data = { ...data, retryAfterMinutes: cause.retryAfterMinutes };
    }

    // Only a real list is carried, as in `safeBodyFor` (`@genie/core`, lib/errors).
    if (cause.issues?.length) data = { ...data, issues: cause.issues };

    return refusal(cause.code, cause.safeMessage, data);
  }

  const badRequest =
    cause instanceof ORPCError
      ? cause.code === "BAD_REQUEST"
      : !input.procedureStarted;

  const appCode = badRequest
    ? CORE_ERRORS["invalid-input"].code
    : GENERIC_ERROR_CODE;

  return refusal(appCode, safeMessageFor(appCode), { appCode, requestId });
}

/**
 * The request contexts whose procedure client was entered. The route builds a fresh context object
 * for each request, and the default `StrictGetMethodPlugin` copies it once in a root interceptor,
 * before both chains below run; both chains then receive that one copy by reference. So a key
 * marks exactly one request, and the weak reference lets it go with the request. A root
 * interceptor added later that replaces the context between the chains would break this mark.
 */
const procedureEntered = new WeakSet<RequestContext>();

/**
 * The RPC handler for the composed router: no batching and no CORS plugin (decision 5), and the
 * default `StrictGetMethodPlugin` and middleware dedupe left on.
 *
 * Why two interceptor chains: in oRPC 1.15.5, `StandardHandler.handle` converts a decode failure
 * to `BAD_REQUEST` in a catch that sits outside the handler `interceptors` chain. Inside the chain,
 * a malformed JSON body arrives as a raw `SyntaxError`, and a body of `null` as a raw `TypeError`.
 * The `clientInterceptors` entry only marks that the procedure started, and maps or swallows
 * nothing. The one `interceptors` entry logs every raw error with the request id, then maps a raw
 * error from before that mark to `invalid-input` and one from after it to the generic 500.
 *
 * The default `StrictGetMethodPlugin.init` runs in the `StandardHandler` constructor and unshifts
 * its own client interceptor ahead of that mark, so a plugin or client interceptor placed before
 * the mark would answer its raw errors as `invalid-input` at 400. Nothing sits before the mark
 * today (the route exports only `POST`, so the plugin's `METHOD_NOT_SUPPORTED` branch never
 * fires), but the 2.x upgrade chore must re-check this ordering before adding one.
 */
export function createRpcHandler(
  router: AppRouter,
  logError: (cause: unknown, meta: { readonly requestId: string }) => void
): RPCHandler<RequestContext> {
  return new RPCHandler<RequestContext>(router, {
    clientInterceptors: [
      ({ context, next }) => {
        procedureEntered.add(context);

        return next();
      },
    ],
    interceptors: [
      async ({ context, next }) => {
        try {
          return await next();
        } catch (cause) {
          // AC-15: the original error is logged before the conversion drops its detail.
          logError(cause, { requestId: context.requestId });

          throw toTransportError({
            cause,
            requestId: context.requestId,
            procedureStarted: procedureEntered.has(context),
          });
        }
      },
    ],
  });
}
