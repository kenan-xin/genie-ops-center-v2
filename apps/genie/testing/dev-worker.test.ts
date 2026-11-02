import { type AddressInfo, createServer, type Socket } from "node:net";

import { afterEach, expect, it } from "vitest";

import { startWorker } from "./dev-worker.ts";

const sockets = new Set<Socket>();

/** Accepts every connection and never answers, so a Postgres client waits for a reply. */
const silent = createServer((socket) => sockets.add(socket));

afterEach(() => {
  // A closed socket fails the worker's pending connect, so its run ends with the test.
  for (const socket of sockets) socket.destroy();
  silent.close();
});

it("refuses a worker that never says it started, within its bound (xok3.37)", async () => {
  await new Promise<void>((listening) =>
    silent.listen(0, "127.0.0.1", listening)
  );

  // SAFETY: a TCP server that is listening answers its address as an AddressInfo.
  const { port } = silent.address() as AddressInfo;

  await expect(
    startWorker({
      source: {
        DATABASE_URL: `postgres://genie:genie@127.0.0.1:${port}/genie`,
        PUBLIC_URL: "http://127.0.0.1:3000",
      },
      modules: [],
      histories: [],
      timeoutMs: 500,
    })
  ).rejects.toThrow("The worker did not start within 500 ms.");
}, 5000);
