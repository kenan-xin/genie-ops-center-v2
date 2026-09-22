import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { connect, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
 * The claim is a listening socket, not a file holding a process id. A lock file
 * outlives the process that wrote it, so a build killed by a signal, a full
 * disk or a lost machine leaves every later build in that checkout failing
 * until somebody deletes the file by hand. The operating system closes a socket
 * when its process ends, however the process ends, so a crash leaves nothing to
 * clean up: the path may remain, but nothing listens on it, and the next build
 * sees a refused connection and takes the root.
 */
const APP_ROOT = resolve(import.meta.dirname, "..");

export const BUILD_STEPS: readonly (readonly [string, readonly string[]])[] = [
  // Before: the registry on disk must be the one this selection generates.
  ["node", ["tools/check-registry.ts"]],
  ["next", ["build"]],
  // After: nothing rewrote it while the bundler was reading it.
  ["node", ["tools/check-registry.ts"]],
  ["node", ["tools/prune-public-migration-sql.mjs"]],
];

export function lockPathFor(appRoot: string): string {
  const key = createHash("sha256")
    .update(appRoot, "utf8")
    .digest("hex")
    .slice(0, 16);

  // Windows has no filesystem socket. A named pipe is the same resource there,
  // and it is released with the process in the same way.
  return process.platform === "win32"
    ? `\\\\.\\pipe\\genie-app-build-${key}`
    : join(tmpdir(), `genie-app-build-${key}.sock`);
}

function listenOn(server: Server, path: string): Promise<void> {
  return new Promise((settle, fail) => {
    server.once("error", fail);

    server.listen(path, () => {
      server.removeListener("error", fail);

      settle();
    });
  });
}

/**
 * Whether a build still holds this path.
 *
 * A connection completes as soon as the kernel accepts it, so an owner that is
 * blocked running the bundler still answers. Only an owner that no longer
 * exists refuses.
 */
function ownerIsAlive(path: string): Promise<boolean> {
  return new Promise((settle) => {
    const probe = connect(path);

    probe.once("connect", () => {
      probe.destroy();

      settle(true);
    });

    probe.once("error", () => {
      probe.destroy();

      settle(false);
    });
  });
}

const refused = (appRoot: string, path: string) =>
  new Error(
    `Another build already owns ${appRoot}. Two builds in one checkout share .next, so the cached bundle would mix both selections. ` +
      `Build each selection in its own root. Nothing needs cleaning up: ${path} is released when that build ends, however it ends.`
  );

/** Takes the application root for this build, or refuses when a build holds it. */
export async function acquireBuildLock(appRoot: string): Promise<Server> {
  const path = lockPathFor(appRoot);

  const server = createServer();

  try {
    await listenOn(server, path);

    return server;
  } catch {
    if (await ownerIsAlive(path)) {
      throw refused(appRoot, path);
    }

    // Nothing listens, so the path is the remains of a build that died. Clearing
    // it is the whole recovery a crash needs.
    rmSync(path, { force: true });

    try {
      await listenOn(server, path);

      return server;
    } catch {
      // Another build cleared and took it first. One of the two wins, and this
      // is the one that did not.
      throw refused(appRoot, path);
    }
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
