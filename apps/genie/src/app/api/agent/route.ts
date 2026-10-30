import { AppError, handleAgentChat } from "@genie/core";

import { requireContext } from "../../../context.ts";
import { errorResponse } from "../../../http-errors.ts";
import { newRequestId } from "../../../request-id.ts";
import { requestPrincipal } from "../../../request-principal.ts";
import {
  crossOriginRefusal,
  stateChangeOriginAllowed,
} from "../request-origin.ts";

export const dynamic = "force-dynamic";

/**
 * The agent route (Spec 7 R-40, P8). Each message spends model calls in the person's name, so the
 * origin check runs before the session is read. Core throws catalogue errors before the stream
 * starts; they answer here with the request id that matches the server log (R-46).
 */
export async function POST(request: Request): Promise<Response> {
  const app = requireContext();

  if (!stateChangeOriginAllowed(request, app.tenant.env.publicUrl))
    return crossOriginRefusal();

  // The proxy forwards its request id; the fallback keeps a direct invocation working.
  const requestId = request.headers.get("x-request-id") ?? newRequestId();
  const logError = (cause: unknown) => app.logError(cause, { requestId });

  try {
    const caller = await requestPrincipal(app.tenant, request.headers);

    return await handleAgentChat({ tenant: app.tenant, caller }, request, {
      logError,
    });
  } catch (cause) {
    if (!(cause instanceof AppError)) logError(cause);

    return errorResponse(cause, requestId);
  }
}
