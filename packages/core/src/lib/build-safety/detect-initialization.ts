/**
 * The preload a probe process registers with `--import` before it loads an entry
 * point. Two detectors record what that import started, and the report file is
 * written when the process exits.
 *
 * Both modules are reached through `createRequire` rather than imported, to keep
 * the load order of this file's own body under its control. On Node 26 that buys
 * nothing measurable: `node:net` reads `dns.lookup` when it connects, not while
 * it loads, and forcing `node:net` to load first leaves every build-safety test
 * passing. The ordering is defensive against a runtime that captures the
 * reference at load time instead. What proves the DNS half of the connection
 * detector is live is the `opens-connection.ts` control fixture, which asserts
 * both "socket" and "dns": if the patch ever went dead, that test would fail.
 */
import { writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import type { Socket } from "node:net";

const FORBIDDEN = ["pg", "drizzle-orm/node-postgres", "pg-pool"] as const;

const resolved: string[] = [];

const connections: string[] = [];

const require = createRequire(import.meta.url);

type DnsModule = typeof import("node:dns");

type NetModule = typeof import("node:net");

const dns: DnsModule = require("node:dns");

const net: NetModule = require("node:net");

const realLookup = dns.lookup.bind(dns);

// `Object.assign` carries the original's static side (its `__promisify__` and
// overloads) onto the wrapper, so the patch satisfies the declared property type
// without a cast.
dns.lookup = Object.assign(function patchedLookup(
  ...args: Parameters<typeof realLookup>
) {
  connections.push("dns");

  return realLookup(...args);
}, dns.lookup);

const realConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = Object.assign(function patchedConnect(
  this: Socket,
  ...args: Parameters<typeof realConnect>
) {
  connections.push("socket");

  return realConnect.apply(this, args);
}, realConnect);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      FORBIDDEN.some(
        (name) => specifier === name || specifier.startsWith(`${name}/`)
      )
    ) {
      resolved.push(specifier);
    }

    return nextResolve(specifier, context);
  },
});

process.on("exit", () => {
  writeFileSync(
    process.env.GENIE_PROBE_REPORT ?? "probe-report.json",
    JSON.stringify({ resolved, connections }),
    "utf8"
  );
});

// An export keeps a future bundler from dropping this side-effect-only preload.
export { net };
