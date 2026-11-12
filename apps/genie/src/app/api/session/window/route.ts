import { requireAuth } from "../../../../auth.ts";
import { requireContext } from "../../../../context.ts";
import { expiredAnswer } from "../expired-answer.ts";

export const dynamic = "force-dynamic";

/**
 * The read of the idle window (`d8l5.53`, P16g-8): a live session answers 200 with the tenant's
 * current idle window, read through the settings reader, so an idle tab learns a lowered window
 * without input. It never slides the session (R-15), so it needs no origin check. Any other
 * session state gets the activity call's refusal (R-14), so the browser lands on the sign-in
 * page's session-expired state with its cookie cleared.
 */
async function handler(request: Request): Promise<Response> {
  const app = requireContext();
  const auth = requireAuth(app.tenant);
  const state = await auth.sessionState({ headers: request.headers });

  if (state.status !== "authenticated")
    return expiredAnswer({
      auth,
      headers: request.headers,
      publicUrl: app.tenant.env.publicUrl,
    });

  const { sessionIdleMinutes } = await app.tenant.settings.get();

  return Response.json(
    { idleMinutes: sessionIdleMinutes },
    { headers: { "cache-control": "no-store" } }
  );
}

export { handler as GET };
