import { requireContext } from "../../../../context.ts";
import { modules } from "../../../../registry.ts";
import { requestPrincipal } from "../../../../request-principal.ts";
import { createRpcHandler } from "../../../../rpc/handler.ts";
import { createAppRouter } from "../../../../rpc/router.ts";
import { serveRpc } from "../../../../rpc/serve.ts";

export const dynamic = "force-dynamic";

const handler = createRpcHandler(createAppRouter(modules), (cause, meta) =>
  requireContext().logError(cause, meta)
);

/**
 * The RPC transport (ADR 0011). Only `POST` is exported: oRPC's handler would also serve a `GET`
 * for every read, so the missing export is the guard, and the framework refuses any other method.
 */
export async function POST(request: Request): Promise<Response> {
  const app = requireContext();

  return serveRpc({
    request,
    app,
    handler,
    principal: () => requestPrincipal(app.tenant, request.headers),
  });
}
