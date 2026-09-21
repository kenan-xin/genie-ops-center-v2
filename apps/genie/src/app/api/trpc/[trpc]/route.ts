import { createRequestPrincipal, createStubGrantReader } from "@genie/core";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { CONTEXT_HEADER, requireContext } from "../../../../context.ts";
import { newRequestId } from "../../../../request-id.ts";
import { appRouter } from "../../../../trpc/root.ts";

export const dynamic = "force-dynamic";

async function handler(request: Request): Promise<Response> {
  const app = requireContext();

  // The proxy is the one request logger (R-44) and it forwards its id upstream,
  // so this reads that id rather than minting a second one. The response header,
  // the proxy's log line and the error body below then all carry one value. The
  // fallback keeps a direct invocation (a unit test, or a path the proxy does
  // not match) working instead of throwing on a missing header.
  const requestId = request.headers.get("x-request-id") ?? newRequestId();

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => ({
      app,
      requestId,
      // The one tenant context the bootstrap published. A module procedure
      // reaches its data only through this, so omitting it makes every
      // procedure throw before it reads anything (DEC-34).
      tenant: app.tenant,
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

  // AC-26, across real bundles: this header is written by the route-handler
  // bundle from the context it read, not by the proxy. The proxy never sets this
  // name, so a second context in this bundle would show up here as a second id
  // even while every proxy log line stayed consistent with itself.
  response.headers.set(CONTEXT_HEADER, app.contextId);

  return response;
}

export { handler as GET, handler as POST };
