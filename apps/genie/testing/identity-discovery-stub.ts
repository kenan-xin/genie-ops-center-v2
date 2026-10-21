import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * The alias `startImage` adds for the host (`--add-host host.docker.internal:host-gateway`). It is
 * duplicated here rather than imported, because `image-process.ts` imports this module and a
 * cycle through that constant would be evaluated before the alias was assigned.
 */
const CONTAINER_HOST_ALIAS = "host.docker.internal";

/**
 * A throwaway discovery document for a test deployment whose realm is not the subject of the test.
 *
 * R-54d makes `/api/health` answer `degraded` while the realm's discovery document does not
 * answer, so a test that wants a healthy application needs a realm that does. Rather than run a
 * real Keycloak, this serves one OpenID Connect discovery document whose `issuer` is built from
 * the request's own `Host`, so the same server satisfies the app's exact-issuer comparison whether
 * the app reaches it as `127.0.0.1` (a host process) or `host.docker.internal` (a container).
 *
 * A test that signs in supplies its own realm address instead and never uses this.
 */
export type DiscoveryStub = {
  /** The address a host process uses, with the port the OS assigned. */
  readonly hostUrl: string;
  /** The address a container uses, through the `host.docker.internal` alias. */
  readonly containerUrl: string;
  readonly stop: () => Promise<void>;
};

export async function startDiscoveryStub(): Promise<DiscoveryStub> {
  const server = createServer((request, response) => {
    const host = request.headers.host ?? "127.0.0.1";

    const match =
      /^\/realms\/([^/]+)\/\.well-known\/openid-configuration$/.exec(
        request.url ?? ""
      );

    if (match?.[1] === undefined) {
      response.writeHead(404);
      response.end();

      return;
    }

    const base = `http://${host}/realms/${match[1]}`;

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        issuer: base,
        authorization_endpoint: `${base}/protocol/openid-connect/auth`,
        token_endpoint: `${base}/protocol/openid-connect/token`,
        jwks_uri: `${base}/protocol/openid-connect/certs`,
        end_session_endpoint: `${base}/protocol/openid-connect/logout`,
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));

  // SAFETY: the server is listening on a TCP port, so `address()` answers an AddressInfo; only a
  // Unix-socket bind answers a string, which this stub never binds.
  const { port } = server.address() as AddressInfo;

  return {
    hostUrl: `http://127.0.0.1:${port}`,
    containerUrl: `http://${CONTAINER_HOST_ALIAS}:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve(undefined));
      }),
  };
}
