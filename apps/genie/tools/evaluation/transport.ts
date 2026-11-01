import {
  guardedModelFetch,
  MODEL_PROVIDER_ORIGIN,
  MODEL_REQUEST_TIMEOUT_MS,
} from "@genie/core/testing";

/**
 * The owner's key on a live request, through core's own guard (R-19): the provider origin only, a
 * body that denies data collection, a time limit, and a key check before any header is set, so a
 * refused key is never named in an error that a result could carry.
 */
export function liveTransport(key: string): typeof globalThis.fetch {
  return guardedModelFetch(globalThis.fetch, {
    origin: MODEL_PROVIDER_ORIGIN,
    timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
    apiKey: key,
  });
}

/** A point in the meter's record, taken before a case. */
export type CostMark = { readonly spent: number; readonly costed: number };

/**
 * Counts the provider cost of every answer that `fetch` passes on: each `"cost"` number in the
 * answer, JSON or an event stream (the provider puts `usage.cost` in its last event). A case whose
 * answers named no cost gets `null`, never 0, so a failing model does not look cheap.
 */
export function costMeter(send: typeof globalThis.fetch) {
  let spent = 0;
  let costed = 0;

  const counted: typeof globalThis.fetch = async (input, init) => {
    const response = await send(input, init);
    const text = await response.clone().text();

    for (const match of text.matchAll(/"cost":\s*([0-9.eE+-]+)/g)) {
      spent += Number(match[1]);
      costed += 1;
    }

    return response;
  };

  return {
    fetch: counted,
    mark: (): CostMark => ({ spent, costed }),
    since: (mark: CostMark): number | null =>
      costed === mark.costed ? null : spent - mark.spent,
  };
}
