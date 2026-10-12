import { z } from "zod";

/**
 * The core catalogue's `unauthenticated` code (R-46, `packages/core/src/lib/errors/index.ts`).
 * The browser reads it from the RPC error body's `json.data.appCode`; it is written here rather than
 * imported, because a client bundle must not reach the core root.
 */
export const UNAUTHENTICATED_APP_CODE = "unauthenticated";

/**
 * Where an RPC answer with no valid session lands the browser (R-14, R-17a): the sign-in page in
 * its session-expired state. A mounted browser client only ever gets this answer when the session
 * it rendered under has expired or been revoked, so the expired banner is the state to show.
 */
export const SESSION_EXPIRED_PATH = "/sign-in?error=session_expired";

/**
 * The one field this reader takes from an RPC error body, `{ json: { defined, code, status,
 * message, data } }`; every other field is ignored.
 */
const rpcErrorBody = z.object({
  json: z.object({ data: z.object({ appCode: z.string() }) }),
});

/**
 * Whether an RPC response is the unauthenticated refusal. The body is parsed at this boundary - an
 * answer that is not an RPC error body, or is not JSON at all, is not this answer - and the status is
 * checked first so a successful or otherwise failed response never reads its body here.
 */
export async function isUnauthenticatedAnswer(
  response: Response
): Promise<boolean> {
  if (response.status !== 401) return false;

  const parsed = rpcErrorBody.safeParse(
    await response
      .clone()
      .json()
      .catch(() => undefined)
  );

  return (
    parsed.success && parsed.data.json.data.appCode === UNAUTHENTICATED_APP_CODE
  );
}
