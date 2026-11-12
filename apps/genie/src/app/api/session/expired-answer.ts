import { sessionCookieName } from "@genie/core";

import type { requireAuth } from "../../../auth.ts";

/** The refused session call (R-14, R-17a): ends an idle row, clears the cookie, answers 401 `session_expired`. */
export async function expiredAnswer(input: {
  readonly auth: ReturnType<typeof requireAuth>;
  readonly headers: Headers;
  readonly publicUrl: string;
}): Promise<Response> {
  // The cookie is cleared below, so an idle row ends here too; a missing row is a no-op.
  await input.auth.endIdleSession({ headers: input.headers });

  const cookie = `${sessionCookieName(input.publicUrl)}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${input.publicUrl.startsWith("https://") ? "; Secure" : ""}`;

  return Response.json(
    { code: "session_expired" },
    {
      status: 401,
      headers: { "cache-control": "no-store", "set-cookie": cookie },
    }
  );
}
