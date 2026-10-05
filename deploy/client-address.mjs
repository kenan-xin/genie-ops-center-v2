// Preloaded into the application process with `node --import` (entrypoint.sh).
//
// Spec 2 R-4a and R-16: the session's stored address comes from `X-Forwarded-For` only when the
// request arrived from an address in `AUTH_TRUSTED_PROXIES`; otherwise it is the socket address.
// Better Auth never sees the socket, and the framework only fills `X-Forwarded-For` when the
// client left it out, so a header the client sent would pass straight through. Here, before the
// framework reads the request, a request whose socket is not a trusted proxy carries exactly its
// socket address in that header. A request from a trusted proxy keeps the proxy's header, and
// Better Auth walks it from the right past the trusted hops.
import { Server } from "node:http";
import { BlockList, isIP } from "node:net";

const trusted = new BlockList();

// The application's own environment validation refuses a malformed entry at start, so an entry
// this cannot parse is skipped here rather than crashing before that clear message.
for (const entry of (process.env.AUTH_TRUSTED_PROXIES ?? "").split(",")) {
  const [address = "", prefix] = entry.trim().split("/");
  const family = isIP(address);

  if (family === 0) continue;

  const type = family === 6 ? "ipv6" : "ipv4";

  if (prefix === undefined) trusted.addAddress(address, type);
  else if (/^\d+$/.test(prefix))
    trusted.addSubnet(address, Number(prefix), type);
}

/** The socket's peer address, with an IPv4 address mapped into IPv6 written as IPv4. */
function peerAddress(socket) {
  const address = socket?.remoteAddress ?? "";
  const mapped = address.startsWith("::ffff:") ? address.slice(7) : "";

  return isIP(mapped) === 4 ? mapped : address;
}

const emit = Server.prototype.emit;

Server.prototype.emit = function emitWithClientAddress(
  event,
  request,
  ...rest
) {
  if (event === "request") {
    const address = peerAddress(request.socket);
    const family = isIP(address);

    if (family === 0) {
      delete request.headers["x-forwarded-for"];
    } else if (!trusted.check(address, family === 6 ? "ipv6" : "ipv4")) {
      request.headers["x-forwarded-for"] = address;
    }
  }

  return emit.call(this, event, request, ...rest);
};
