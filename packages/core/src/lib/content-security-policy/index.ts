/**
 * The enforced baseline of DEC-31 as amended on 2026-09-19 (R-47, R-48). There is no
 * `default-src`, `script-src` or `style-src`, and no nonce. Strict script and style policy and
 * report-only evaluation are deferred, not Section 0 work.
 */
export const BASELINE_POLICY =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

const FRAME_ORIGIN =
  /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

/**
 * A module contributes an origin, never a URL, a wildcard, a policy keyword or a header
 * fragment. Anything else is dropped, because a wildcard fallback would widen the policy.
 */
export function isFrameOrigin(value: string): boolean {
  return FRAME_ORIGIN.test(value);
}

/** Drops every invalid origin and every repeat, keeping the order the module supplied. */
export function normalizeFrameOrigins(
  values: readonly string[]
): readonly string[] {
  return [...new Set(values.filter(isFrameOrigin))];
}

/**
 * Core owns serialization, so a module cannot replace another directive (R-48). An empty list
 * leaves frames denied.
 */
export function serializeContentSecurityPolicy(
  frameOrigins: readonly string[]
): string {
  const allowed = normalizeFrameOrigins(frameOrigins);
  const frameSrc = allowed.length === 0 ? "'none'" : allowed.join(" ");

  return `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src ${frameSrc}`;
}

/**
 * The optional module point. The Module type pins the context to `{ tenant: TenantContext }`;
 * the parameter stays generic here so this file needs no runtime import.
 */
export type FrameOriginProvider<Ctx> = {
  frameOrigins(ctx: Ctx): Promise<readonly string[]>;
};

/** How a caller learns that a provider failed. Core imports no logger (yt2). */
export type FrameOriginFailureOptions = {
  readonly onProviderError?: (cause: unknown) => void;
};

/**
 * An omitted provider, an empty result and a provider failure all contribute nothing. A failure
 * never falls back to a wildcard or to the broad `https:` source (module contract, Content
 * security policy provider).
 */
export async function collectFrameOrigins<Ctx>(
  provider: FrameOriginProvider<Ctx> | undefined,
  ctx: Ctx,
  options: FrameOriginFailureOptions = {}
): Promise<readonly string[]> {
  if (provider === undefined) return [];

  try {
    return normalizeFrameOrigins(await provider.frameOrigins(ctx));
  } catch (caught) {
    // A failed contribution denies frames. The caller owns the log line, because
    // this module stays pure and holds no logger. A reporter that throws must not
    // change the policy, so its own failure is swallowed too.
    try {
      options.onProviderError?.(caught);
    } catch {
      // Reporting is best effort. The denied policy above is the guarantee.
    }

    return [];
  }
}
