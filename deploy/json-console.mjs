// Preloaded into the application process with `node --import` (entrypoint.sh).
//
// R-75: every line the application process writes is a JSON line with the tenant id. Our own
// pino logger already writes that shape straight to fd 1. The framework does not: Next prints its
// start banner and its own error lines through `console`, before and outside our code. This turns
// each such call into one JSON line with `PUBLIC_URL` as the tenant id, the same key the core
// logger uses. A multi-line message, such as a stack, stays one line.
import { format, stripVTControlCharacters } from "node:util";

// Only a valid address is a tenant id. An invalid PUBLIC_URL fails the bootstrap, and its value
// must not reach the log.
const tenantId = /^https?:$/.test(
  URL.canParse(process.env.PUBLIC_URL ?? "")
    ? new URL(process.env.PUBLIC_URL).protocol
    : ""
)
  ? process.env.PUBLIC_URL
  : undefined;

const LEVELS = {
  debug: ["debug", process.stdout],
  log: ["info", process.stdout],
  info: ["info", process.stdout],
  warn: ["warn", process.stderr],
  error: ["error", process.stderr],
};

for (const [method, [level, stream]] of Object.entries(LEVELS)) {
  console[method] = (...args) => {
    // The colour codes Next adds for a terminal carry no meaning in a JSON line.
    const msg = stripVTControlCharacters(format(...args)).trim();

    if (msg === "") return;

    stream.write(
      `${JSON.stringify({ level, time: Date.now(), tenantId, source: "framework", msg })}\n`
    );
  };
}
