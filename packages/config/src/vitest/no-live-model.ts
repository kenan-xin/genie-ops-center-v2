/**
 * The no-live-model guard (Spec 7 R-21, AC-5). The unit preset and core's
 * integration config install this file as a setup file, so a test that forgets
 * its recorded transport refuses here instead of reaching the provider. It
 * imports nothing: a setup file must not pull application code into a run.
 *
 * In the owner's record mode (`MODEL_RECORDING_KEY` set, never in CI) it steps
 * aside, so the recorded transport can send a request that no recording answers
 * to the provider (packages/core/testing/README.md).
 */
const LIVE_MODEL_HOSTS: ReadonlySet<string> = new Set([
  "openrouter.ai",
  "ai-gateway.vercel.sh",
]);

const innerFetch = globalThis.fetch;

const recordMode =
  Boolean(process.env.MODEL_RECORDING_KEY) && process.env.CI === undefined;

if (!recordMode) globalThis.fetch = guardedFetch;

function guardedFetch(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
): Promise<Response> {
  const href = input instanceof Request ? input.url : String(input);
  // A trailing dot is the same host, but URL keeps it.
  const hostname = hostnameOf(href)?.replace(/\.$/, "") ?? null;

  if (
    hostname !== null &&
    (LIVE_MODEL_HOSTS.has(hostname) || hostname.endsWith(".openrouter.ai"))
  ) {
    return Promise.reject(
      new Error(
        `A test tried to reach the live model host ${hostname}. Use the recorded test model.`
      )
    );
  }

  return innerFetch(input, init);
}

function hostnameOf(href: string): string | null {
  try {
    // A relative URL resolves to a host that is not a model host, so fetch
    // keeps its own error for it.
    return new URL(href, "http://not-a-model-host.invalid").hostname;
  } catch {
    return null;
  }
}
