/**
 * The preload a probe process registers with `--import` before it loads an entry
 * point. Two detectors record what that import started, and the report file is
 * written when the process exits.
 *
 * `node:net` captures `dns.lookup` while it loads, so the DNS patch must be in
 * place before `node:net` is first required. That is why this module reaches for
 * both through `createRequire` in this order: static imports would load
 * `node:net` before the patch runs, and the DNS half of the connection detector
 * would go silently dead.
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

// The require calls stay above the patches so the DNS patch lands before
// `node:net` loads and captures the un-patched `dns.lookup` for itself.
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
