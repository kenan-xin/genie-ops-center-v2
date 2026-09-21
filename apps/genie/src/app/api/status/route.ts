import { CORE_HISTORY } from "@genie/core";

import { requireContext } from "../../../context.ts";
import { errorResponse } from "../../../http-errors.ts";
import { newRequestId } from "../../../request-id.ts";

export const dynamic = "force-dynamic";

/**
 * The core history's ledger, taken from core rather than written twice.
 *
 * Drizzle creates its ledger in the `drizzle` schema, not `public`, and the
 * application's `search_path` does not include it. The name must therefore be
 * schema-qualified or the query fails for the wrong reason.
 */
const LEDGER = `drizzle."${CORE_HISTORY.table}"`;

/**
 * The ordinary HTTP counterpart of the tRPC path. It exists so a real database
 * failure can be observed through the route-handler helper (R-46, AC-15), and
 * so the response body shape is proven over the wire rather than in isolation.
 *
 * It reads nothing module-owned. An earlier draft imported `placeholderRecord`
 * from the placeholder package, which would have compiled that module into
 * every image including one built with an empty selection, breaking R-22. The
 * read here goes through the tenant context with no module import and no
 * database driver import, so it works whatever the selection is.
 */
export async function GET(request: Request): Promise<Response> {
  const app = requireContext();

  // The proxy logs the one request line (R-44) and forwards its id upstream, so
  // this reads that id rather than minting a second one. The fallback keeps a
  // direct invocation working instead of failing on a missing header.
  const requestId = request.headers.get("x-request-id") ?? newRequestId();

  try {
    // Reads the core migration ledger, which the migrator creates on every start
    // whatever the module selection is. A plain string is accepted:
    // `execute(query: SQLWrapper | string)` in drizzle-orm 0.45.2, pg-core/db.d.ts.
    //
    // It deliberately touches a real object rather than `select 1`. A constant
    // select cannot fail, so there would be no way to exercise the error adapter
    // with a database failure, which AC-15 requires. It is core-owned rather than
    // module-owned, so the route still works in an image built with an empty
    // selection.
    await app.tenant.db.execute(`select 1 from ${LEDGER} limit 1`);

    return Response.json({ status: "ok", requestId });
  } catch (caught) {
    // AC-15: the same request id reaches the client and the redacted log.
    app.logError(caught, { requestId });

    return errorResponse(caught, requestId);
  }
}
