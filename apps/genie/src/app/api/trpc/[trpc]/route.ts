import { createRequestPrincipal, createStubGrantReader } from "@genie/core";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { requireContext } from "../../../../context.ts";
import { newRequestId } from "../../../../request-id.ts";
import { appRouter } from "../../../../trpc/root.ts";

export const dynamic = "force-dynamic";

function handler(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const app = requireContext();

  // One line per request (R-44). The image acceptance counts these lines to
  // prove that a single context serves every bundle, so a route that skipped
  // this call would make a two-context process look like a one-context one.
  app.logRequest({ requestId, path: "/api/trpc" });

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => ({
      app,
      requestId,
      // The Section 0 stub grants placeholder:read and nothing else (R-13).
      caller: createRequestPrincipal(
        { userId: "anonymous", groups: [] },
        createStubGrantReader()
      ),
    }),
    // AC-15: the id the client receives must match a redacted server log entry.
    // The formatter writes the response and logs nothing, so the logging belongs
    // here, where the caught error is still available.
    onError: ({ error }) => {
      app.logError(error, { requestId });
    },
  });
}

export { handler as GET, handler as POST };
