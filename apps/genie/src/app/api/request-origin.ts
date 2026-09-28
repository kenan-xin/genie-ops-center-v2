/**
 * The CSRF boundary for app-owned state changes. A browser request with an Origin must be the
 * configured public origin; requests without one need Fetch Metadata to prove same-origin.
 */
export function stateChangeOriginAllowed(
  request: Request,
  publicUrl: string
): boolean {
  const origin = request.headers.get("origin");

  if (origin !== null) return origin === new URL(publicUrl).origin;

  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function crossOriginRefusal(): Response {
  return Response.json(
    { code: "cross-origin-request" },
    { status: 403, headers: { "cache-control": "no-store" } }
  );
}
