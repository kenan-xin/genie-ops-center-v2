/**
 * The no-live-model guard (Spec 7 R-21, AC-5). The unit preset and core's
 * integration config install this file as a setup file, so a test that forgets
 * its recorded transport refuses here instead of reaching the provider. It
 * imports nothing: a setup file must not pull application code into a run.
 */
const LIVE_MODEL_HOSTS: ReadonlySet<string> = new Set([
  "openrouter.ai",
  "ai-gateway.vercel.sh",
]);

const innerFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const href = input instanceof Request ? input.url : String(input);
  const hostname = hostnameOf(href);

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
};

function hostnameOf(href: string): string | null {
  try {
    // A relative URL resolves to a host that is not a model host, so fetch
    // keeps its own error for it.
    return new URL(href, "http://not-a-model-host.invalid").hostname;
  } catch {
    return null;
  }
}
