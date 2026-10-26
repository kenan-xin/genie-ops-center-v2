import { DOWNLOAD_POLICY } from "@genie/core/security";

import { requireContext } from "../../../../context.ts";
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

/**
 * Serves a tokenized download link (Spec 1 R-38): the file service's one generic route for every
 * link kind, record and branding alike. It is not an image route (D3-7). The file store checks the
 * token and the principal; every refusal answers the same empty 404, so a caller learns nothing
 * about why.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) return notFound();

  const { tenant } = requireContext();

  let served;

  try {
    served = await tenant.fileStorage.fetchLink({
      token,
      principal: await requestPrincipal(tenant, request.headers),
    });
  } catch {
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
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(served.fileName)}`,
      "content-security-policy": DOWNLOAD_POLICY,
      "x-content-type-options": "nosniff",
    },
  });
}
