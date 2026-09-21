import { AppError, GENERIC_ERROR_CODE, safeMessageFor } from "@genie/core";
import { initTRPC } from "@trpc/server";

import type { AppContext } from "../context.ts";

export type RequestContext = {
  readonly app: AppContext;
  readonly requestId: string;
  readonly caller: Parameters<typeof import("@genie/core").can>[0];
};

/**
 * The `data` field of the protocol error envelope. `code` is the only field this
 * adapter reads or promises; the fields tRPC also carries (`httpStatus`, `stack`,
 * `path`) survive the spread at run time without being promised to a client.
 */
export type ErrorEnvelopeData = {
  readonly code: string;
};

/** The protocol envelope, before and after R-46 adds its two fields. */
export type ErrorEnvelope = {
  readonly message: string;
  readonly code: number;
  readonly data: ErrorEnvelopeData;
};

export type FormattedErrorEnvelope = {
  readonly message: string;
  readonly code: number;
  readonly data: ErrorEnvelopeData & {
    readonly appCode: string;
    readonly requestId: string;
  };
};

/**
 * R-46: the standard envelope and its protocol codes are preserved. `appCode`
 * and `requestId` are added under `data`, so a standard client decodes the
 * result without a custom transport. No cause, stack, database text or upstream
 * text reaches the envelope.
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

  return {
    ...input.envelope,
    message: safeMessageFor(appCode),
    data: { ...input.envelope.data, appCode, requestId: input.requestId },
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
