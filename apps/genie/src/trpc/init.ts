import {
  AppError,
  GENERIC_ERROR_CODE,
  type ModuleRequestContext,
  safeMessageFor,
} from "@genie/core";
import { type TRPC_ERROR_CODE_NUMBER, initTRPC } from "@trpc/server";

import type { AppContext } from "../context.ts";

/**
 * What every procedure on the application's router reads.
 *
 * It extends `ModuleRequestContext`, the shape a module builds its router
 * against (module-contract.ts), so the object this adapter builds is the one
 * every module procedure already expects. `app` and `requestId` are the
 * application's own additions: the context itself, and the id that correlates
 * the response with the log line.
 */
export type RequestContext = ModuleRequestContext & {
  readonly app: AppContext;
  readonly requestId: string;
};

/**
 * The `data` field of the envelope tRPC hands the formatter.
 *
 * `stack` is present whenever `NODE_ENV` is not `production` (getErrorShape,
 * @trpc/server), and a TRPCError's stack starts with the wrapped cause's
 * message, so it is a leak path that does not depend on how the formatter is
 * written.
 */
export type ErrorEnvelopeData = {
  readonly code: string;
  readonly httpStatus: number;
  readonly path?: string;
  readonly stack?: string;
};

/** The protocol envelope, before and after R-46 adds its two fields. */
export type ErrorEnvelope = {
  readonly message: string;
  readonly code: TRPC_ERROR_CODE_NUMBER;
  readonly data: ErrorEnvelopeData;
};

/**
 * The `data` field this formatter returns: the protocol code, the HTTP status
 * tRPC reads back to set the response status, and R-46's two additive fields.
 *
 * `stack` is dropped explicitly rather than left to the environment, and `path`
 * is dropped because nothing reads it once the formatter returns.
 */
export type FormattedErrorEnvelopeData = {
  readonly code: string;
  readonly httpStatus: number;
  readonly appCode: string;
  readonly requestId: string;
};

/**
 * `code` is tRPC's own `TRPC_ERROR_CODE_NUMBER` union and not `number`, because
 * `ErrorFormatter`'s shape parameter is constrained by `TRPCErrorShape`, and a
 * `number` there makes `inferErrorFormatterShape` fall back to
 * `DefaultErrorShape` — which silently erases `appCode` and `requestId` from
 * every client's error type.
 */
export type FormattedErrorEnvelope = {
  readonly message: string;
  readonly code: TRPC_ERROR_CODE_NUMBER;
  readonly data: FormattedErrorEnvelopeData;
};

/**
 * R-46: the standard envelope and its protocol codes are preserved. `appCode`
 * and `requestId` are added under `data`, so a standard client decodes the
 * result without a custom transport. No cause, stack, database text or upstream
 * text reaches the envelope.
 *
 * `data` is rebuilt field by field rather than spread, so a field tRPC adds
 * later cannot reach a client by default.
 *
 * The input is named `envelope` rather than `shape`, because
 * `anti-slop/no-shape-in-symbol-names` bans that word as a symbol name.
 */
export function formatTrpcError(input: {
  envelope: ErrorEnvelope;
  error: { cause?: unknown };
  requestId: string;
}): FormattedErrorEnvelope {
  const cause = input.error.cause;
  const appCode = cause instanceof AppError ? cause.code : GENERIC_ERROR_CODE;
  const { code, httpStatus } = input.envelope.data;

  return {
    message: safeMessageFor(appCode),
    code: input.envelope.code,
    data: { code, httpStatus, appCode, requestId: input.requestId },
  };
}

export const t = initTRPC.context<RequestContext>().create({
  // The envelope is read as a member (`input.shape`), never bound to a local
  // name: `anti-slop/no-shape-in-symbol-names` exempts a statically accessed
  // member of another value and bans every other symbol name.
  errorFormatter: (input) =>
    formatTrpcError({
      envelope: input.shape,
      error: input.error,
      requestId: input.ctx?.requestId ?? "unknown",
    }),
});
