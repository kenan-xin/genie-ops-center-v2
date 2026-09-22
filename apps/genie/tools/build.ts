import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The application build, as one command that owns its output tree.
 *
 * Checking the generated registry is not enough on its own. Two builds in one
 * checkout share `apps/genie/.next`, so a build can find its own registry intact
 * at both boundaries while another build writes into the same output tree
 * throughout. Nx then stores that mixed tree under a legitimate selection hash
 * and restores it later, which is cross-customer leakage in the artifact rather
 * than in the registry.
 *
 * No check on the registry can see that, so this refuses the situation instead.
 * The first build in a checkout takes the root and a second one fails at once
 * rather than waiting: waiting would only queue a second writer behind the
 * first, and the supported way to build two selections at the same time is two
 * build roots (`--root`).
 *
 * The claim is a listening port on the loopback interface, derived from the
 * application root. Two earlier mechanisms were wrong, and both failures are
 * worth keeping in view:
 *
 * A lock file outlives the process that wrote it, so a build killed by a signal
 * or a lost machine blocked every later build until somebody deleted the file.
 *
 * A socket file fixed that but needed a recovery step, and the recovery is what
 * broke it: two builds could each find the same abandoned path, each judge it
 * dead, and the second removal would delete the first's live socket. Both would
 * then be listening, on different inodes, and both would believe they owned the
 * root. That is the exact situation the claim exists to prevent.
 *
 * A port has no filesystem entry, so there is nothing to leave behind and
 * nothing to clean up. Binding is the whole mechanism: the kernel grants the
 * address to one process and refuses everybody else, and it takes the address
 * back however that process ends. There is no recovery path here, because there
 * is no state that can go stale.
 */
const APP_ROOT = resolve(import.meta.dirname, "..");

/** The dynamic port range, which is reserved for exactly this kind of use. */
const FIRST_PRIVATE_PORT = 49152;

const PRIVATE_PORT_COUNT = 16384;

export const BUILD_STEPS: readonly (readonly [string, readonly string[]])[] = [
  // Before: the registry on disk must be the one this selection generates.
  ["node", ["tools/check-registry.ts"]],
  ["next", ["build"]],
  // After: nothing rewrote it while the bundler was reading it.
  ["node", ["tools/check-registry.ts"]],
  ["node", ["tools/prune-public-migration-sql.mjs"]],
];

export function lockPortFor(appRoot: string): number {
  const digest = createHash("sha256").update(appRoot, "utf8").digest();

  return FIRST_PRIVATE_PORT + (digest.readUInt16BE(0) % PRIVATE_PORT_COUNT);
}

function listenOn(server: Server, port: number): Promise<void> {
  return new Promise((settle, fail) => {
    server.once("error", fail);

    // Loopback only. The claim is about this machine, and binding a routable
    // address would offer it to the network for no reason.
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", fail);

      settle();
    });
  });
}

/**
 * Takes the application root for this build, or refuses when it is taken.
 *
 * The bind either wins or fails. Nothing is inspected, removed or retried, so
 * no ordering of concurrent builds can produce two owners.
 */
export async function acquireBuildLock(appRoot: string): Promise<Server> {
  const port = lockPortFor(appRoot);

  const server = createServer();

  try {
    await listenOn(server, port);

    return server;
  } catch {
    server.close();

    throw new Error(
      `Another build already owns ${appRoot}. Two builds in one checkout share .next, so the cached bundle would mix both selections. ` +
        `Build each selection in its own root. Nothing needs cleaning up: port ${port} is released when that build ends, however it ends. ` +
        `If no build is running, an unrelated program holds that port.`
    );
  }
}

export function releaseBuildLock(server: Server): void {
  server.close();
}

async function main(): Promise<void> {
  const lock = await acquireBuildLock(APP_ROOT);

  try {
    for (const [command, args] of BUILD_STEPS) {
      const result = spawnSync(command, [...args], {
        cwd: APP_ROOT,
        stdio: "inherit",
        shell: process.platform === "win32",
      });

      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;

        return;
      }
    }
  } finally {
    releaseBuildLock(lock);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
