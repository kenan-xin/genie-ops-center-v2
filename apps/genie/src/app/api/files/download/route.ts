import { FileLinkRefusedError } from "@genie/core";
import { DOWNLOAD_POLICY } from "@genie/core/security";

import { requireContext } from "../../../../context.ts";
import { newRequestId } from "../../../../request-id.ts";
import { requestPrincipal } from "../../../../request-principal.ts";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": DOWNLOAD_POLICY,
    },
  });
}

/** RFC 8187 `ext-value` encoding: `encodeURIComponent` leaves `'`, `(`, `)` and `*` bare. */
function encodeFileName(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Serves a tokenized download link (Spec 1 R-38): the file service's one generic route for every
 * link kind, record and branding alike. It is not an image route (D3-7). The file store checks the
 * token and the principal; every refusal answers the same empty 404, so a caller learns nothing
 * about why. Only a real failure, such as a missing blob, reaches the log, and never the token.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) return notFound();

  const app = requireContext();

  let served;

  try {
    served = await app.tenant.fileStorage.fetchLink({
      token,
      principal: await requestPrincipal(app.tenant, request.headers),
    });
  } catch (caught) {
    if (!(caught instanceof FileLinkRefusedError)) {
      app.logError(caught, {
        requestId: request.headers.get("x-request-id") ?? newRequestId(),
      });
    }

    return notFound();
  }

  const disposition = served.mimeType.startsWith("image/")
    ? "inline"
    : "attachment";

  return new Response(new Uint8Array(served.bytes), {
    status: 200,
    headers: {
      "content-type": served.mimeType,
      "cache-control": "private, max-age=300",
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeFileName(served.fileName)}`,
      "content-security-policy": DOWNLOAD_POLICY,
      "x-content-type-options": "nosniff",
    },
  });
}
