import {
  createServer,
  type AddressInfo,
  type Server,
  type Socket,
} from "node:net";

import { type TenantContext, createTenantContext } from "@genie/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type AppContext, publishContext } from "../../../context.ts";
import { GET } from "./route.ts";

/**
 * The context pool's default size. A database that accepts TCP and never answers holds one pooled
 * client per health call, so a run longer than this is what used to exhaust the pool (dm9).
 */
const POOL_MAX = 10;

/**
 * The migrator's lock wait, lowered from its 120 s default so the bound derived from it is
 * reachable inside a test. The pool's connection wait is sized above this, so the value here moves
 * the bound with it.
 */
const LOCK_TIMEOUT_MS = 1000;

/** Accepts TCP connections and never answers their Postgres startup message (dm9). */
function silentTcpServer() {
  const sockets = new Set<Socket>();

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // A client that gives up mid-handshake can reset the connection; the server socket must
    // handle that rather than turn it into an uncaught exception.
    socket.on("error", () => undefined);
  });

  const port = new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      // SAFETY: the server is listening on a TCP port, so `address()` answers an AddressInfo;
      // only a Unix-socket bind answers a string, which this test never binds.
      const address = server.address() as AddressInfo | null;

      if (address === null) {
        reject(new Error("the silent server reported no port"));

        return;
      }

      resolve(address.port);
    });
  });

  return { server, sockets, port };
}

describe("health database probe against a database that never answers", () => {
  let server: Server;
  let sockets: Set<Socket>;
  let context: TenantContext;

  beforeAll(async () => {
    const silent = silentTcpServer();

    server = silent.server;
    sockets = silent.sockets;

    const port = await silent.port;

    context = createTenantContext(
      {
        DATABASE_URL: `postgres://genie:secret@127.0.0.1:${port}/genie`,
        PUBLIC_URL: "https://test.example.invalid",
        LOCK_TIMEOUT_MS: String(LOCK_TIMEOUT_MS),
      },
      { error: () => undefined, info: () => undefined, debug: () => undefined },
      []
    );

    // SAFETY: the health route reads only `context.tenant`; the remaining members are unused by
    // this one handler, so the narrow stub is the whole surface under test.
    publishContext({ tenant: context } as AppContext);
  });

  afterAll(async () => {
    // Destroying the sockets rejects every hung connect, so ending the pool below cannot wait on
    // a request that will never settle.
    for (const socket of sockets) socket.destroy();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await context.db.$client.end().catch(() => undefined);
  });

  it("answers 503 on every call and frees the pool after more calls than its size", async () => {
    const responses = await Promise.all(
      Array.from({ length: POOL_MAX + 2 }, () => GET())
    );

    const bodies = await Promise.all(
      responses.map((response) => response.text())
    );

    expect(responses.every((response) => response.status === 503)).toBe(true);
    expect(bodies.every((body) => body === "unavailable")).toBe(true);

    // The hung connects still hold every pooled client while the database never answers...
    expect(context.db.$client.totalCount).toBe(POOL_MAX);

    // ...but the connection wait is bounded, so each hung connect fails at the bound and the pool
    // recovers on its own rather than staying exhausted forever.
    await vi.waitFor(
      () => {
        expect(context.db.$client.totalCount).toBeLessThan(POOL_MAX);
      },
      { timeout: 12000, interval: 100 }
    );
  }, 30000);
});
