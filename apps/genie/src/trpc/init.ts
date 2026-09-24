import {
  AppError,
  GENERIC_ERROR_CODE,
  type ModuleRequestContext,
  safeMessageFor,
} from "@genie/core";
import { TRPCError, initTRPC } from "@trpc/server";
import {
  TRPC_ERROR_CODES_BY_KEY,
  type TRPC_ERROR_CODE_KEY,
  type TRPC_ERROR_CODE_NUMBER,
} from "@trpc/server/rpc";

import type { AppContext } from "../context.ts";
import { httpStatusForCode } from "../http-errors.ts";

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
 * The app code a bare tRPC protocol code answers with, where the core catalogue
 * has one. A tRPC code names a transport condition, not a domain error, so
 * `UNAUTHORIZED` and every other code without a catalogue entry keep the
 * generic entry rather than inventing a code the catalogue does not hold.
 */
const APP_CODE_BY_TRPC_CODE = new Map<TRPC_ERROR_CODE_KEY, string>([
  ["BAD_REQUEST", "invalid-input"],
  ["FORBIDDEN", "forbidden"],
  ["NOT_FOUND", "not-found"],
]);

/** A tRPC protocol code: the numeric `code` and the `data.code` key it names. */
type ProtocolCode = {
  readonly key: TRPC_ERROR_CODE_KEY;
  readonly number: TRPC_ERROR_CODE_NUMBER;
};

/**
 * The protocol key that names each status this formatter answers with. tRPC
 * reads `data.httpStatus` back to set the HTTP response status, so the protocol
 * `code` has to name the same condition, or a client decodes one status from
 * the body and reads another from the response.
 */
const PROTOCOL_KEY_BY_HTTP_STATUS = new Map<number, TRPC_ERROR_CODE_KEY>([
  [400, "BAD_REQUEST"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [500, "INTERNAL_SERVER_ERROR"],
]);

const GENERIC_PROTOCOL_KEY: TRPC_ERROR_CODE_KEY = "INTERNAL_SERVER_ERROR";

function protocolCodeFor(httpStatus: number): ProtocolCode {
  const key =
    PROTOCOL_KEY_BY_HTTP_STATUS.get(httpStatus) ?? GENERIC_PROTOCOL_KEY;

  return { key, number: TRPC_ERROR_CODES_BY_KEY[key] };
}

/**
 * R-46: the standard envelope is preserved, and `appCode` and `requestId` are
 * added under `data`, so a standard client decodes the result without a custom
 * transport. No cause, stack, database text or upstream text reaches it.
 *
 * One source answers each branch. An `AppError` cause — core or module — takes
 * its code and its fixed safe message from the error, and its status from the
 * same `httpStatusForCode` the ordinary route helper uses, so the two transports
 * cannot disagree. A bare `TRPCError` has no catalogue error to read, so its
 * protocol code maps to the matching app code and its own status and protocol
 * code are kept: tRPC built both from that one code. Every other cause, and
 * every code without a catalogue entry, answers the generic 500.
 *
 * `data` is rebuilt field by field rather than spread, so a field tRPC adds
 * later cannot reach a client by default.
 *
 * The input is named `envelope` rather than `shape`, because
 * `anti-slop/no-shape-in-symbol-names` bans that word as a symbol name.
 */
export function formatTrpcError(input: {
  envelope: ErrorEnvelope;
  error: TRPCError;
  requestId: string;
}): FormattedErrorEnvelope {
  const cause = input.error.cause;

  if (cause instanceof AppError) {
    const httpStatus = httpStatusForCode(cause.code);
    const protocol = protocolCodeFor(httpStatus);

    return {
      message: cause.safeMessage,
      code: protocol.number,
      data: {
        code: protocol.key,
        httpStatus,
        appCode: cause.code,
        requestId: input.requestId,
      },
    };
  }

  const appCode =
    APP_CODE_BY_TRPC_CODE.get(input.error.code) ?? GENERIC_ERROR_CODE;

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
