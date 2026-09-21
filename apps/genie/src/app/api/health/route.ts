import { readContext } from "../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * R-36a: the body is `ok` and nothing else. It answers only after the bootstrap
 * completed, so a migration failure leaves the container unhealthy. This
 * response is the definition of readiness (R-19b amendment).
 *
 * No request line is written here. The proxy is the one request logger (R-44),
 * and it runs before the filesystem check, so `/api/health` is recorded there
 * with the context id the single-context acceptance check reads.
 */
export function GET(): Response {
  const context = readContext();

  if (context === undefined) {
    return new Response("unavailable", { status: 503 });
  }

  return new Response("ok", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
