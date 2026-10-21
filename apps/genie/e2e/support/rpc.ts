import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * One RPC call as the browser client makes it: a `POST` to an `/api/rpc/...` URL with an empty RPC
 * body. It sends `Sec-Fetch-Site: same-origin`, the proof the route's origin check accepts from a
 * caller with no `Origin`. A request context bound to a page carries that page's cookies.
 */
export function rpcPost(
  request: APIRequestContext,
  url: string,
  options: { readonly headers?: Readonly<Record<string, string>> } = {}
): Promise<APIResponse> {
  return request.post(url, {
    headers: { "sec-fetch-site": "same-origin", ...options.headers },
    data: {},
  });
}
