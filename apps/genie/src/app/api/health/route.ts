import { readSetupProgress, setupSatisfied } from "@genie/core";

import { requireAuth } from "../../../auth.ts";
import { readContext } from "../../../context.ts";

export const dynamic = "force-dynamic";

/**
 * D-14: short enough that a stopped or hung database is answered well inside a monitor's own
 * timeout, and a shorter value only trades flakiness for speed. The read is a per-call database
 * round trip, never the setup gate's latch, so an outage after startup is always visible.
 */
const DATABASE_PROBE_TIMEOUT_MS = 2000;

/** Bounds a probe so a hung round trip cannot hold the response open (D-14). The work is not
 * cancelled, but the response is, which is what the monitor reads. */
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("database probe timed out")),
      timeoutMs
    );
  });

  return Promise.race([work, expiry]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function body(text: "ok" | "degraded"): Response {
  return new Response(text, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * R-11: unauthenticated, body `ok` or `degraded` and nothing else. `degraded` means setup is
 * incomplete or, once it is complete, the realm's discovery document does not answer (R-54d). An
 * unreachable database is a 503 with no detail (D-14). It checks the database on every call and
 * does not use the setup gate's latch, so a database that stops after startup is visible here
 * even while the gate stays open in the proxy.
 *
 * No request line is written here. The proxy is the one request logger (R-44), and it runs before
 * the filesystem check, so `/api/health` is recorded there with the context id the
 * single-context acceptance check reads.
 */
export async function GET(): Promise<Response> {
  const context = readContext();

  if (context === undefined) {
    return new Response("unavailable", { status: 503 });
  }

  try {
    const steps = await withTimeout(
      readSetupProgress(context.tenant),
      DATABASE_PROBE_TIMEOUT_MS
    );

    if (!setupSatisfied(steps)) return body("degraded");

    // R-54d: before setup the answer is already `degraded`; once it is done, the realm's
    // discovery document decides. `ensureDiscovery` retries at most every ten seconds, so a
    // recovered realm is reported without a restart.
    const discovery = await requireAuth(context.tenant).ensureDiscovery();

    return body(discovery.ready ? "ok" : "degraded");
  } catch {
    // The cause stays in the server; the body carries no database text (R-11 amendment).
    return new Response("unavailable", { status: 503 });
  }
}
