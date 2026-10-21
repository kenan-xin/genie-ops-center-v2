import { z } from "zod";

/**
 * One raw RPC call to a running application: a `POST` to `/api/rpc/<path>` with the input in the
 * RPC body, `{ json: input }`. It sends `Sec-Fetch-Site: same-origin`, as a browser does, so the
 * origin check passes; a caller testing that check sets its own headers.
 */
export function rpcRequest(
  baseUrl: string,
  path: string,
  options: {
    readonly input?: unknown;
    readonly headers?: Readonly<Record<string, string>> | undefined;
  } = {}
): Promise<Response> {
  return fetch(`${baseUrl}/api/rpc/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...options.headers,
    },
    body: JSON.stringify(
      options.input === undefined ? {} : { json: options.input }
    ),
  });
}

/** The body of an RPC refusal, as the route's error interceptor writes it. */
export const rpcRefusalBody = z.object({
  json: z.object({
    defined: z.boolean(),
    code: z.string(),
    status: z.number(),
    message: z.string(),
    data: z.object({
      appCode: z.string(),
      requestId: z.string(),
      retryAfterMinutes: z.number().optional(),
    }),
  }),
});

export type RpcRefusalBody = z.infer<typeof rpcRefusalBody>;

/** Parses a refusal body, failing the test with zod's message when the body has another shape. */
export async function readRpcRefusal(
  response: Response
): Promise<RpcRefusalBody> {
  return rpcRefusalBody.parse(await response.json());
}
