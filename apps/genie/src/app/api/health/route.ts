import { randomUUID } from "node:crypto";

import { readContext } from "../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * R-36a: the body is `ok` and nothing else. It answers only after the bootstrap
 * completed, so a migration failure leaves the container unhealthy. This
 * response is the definition of readiness (R-19b amendment).
 */
export function GET(request: Request): Response {
  const context = readContext();

  if (context === undefined) {
    return new Response("unavailable", { status: 503 });
  }

  // One line per request, which is what makes the single-context acceptance
  // check real. Without this call the only log line carrying a context id is
  // the bootstrap line, so a process that built two contexts and served every
  // request from the second would still show exactly one id and pass.
  context.logRequest({
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    path: "/api/health",
  });

  return new Response("ok", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
