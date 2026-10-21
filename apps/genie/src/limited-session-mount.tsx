"use client";

import { LimitedSessionPage } from "@genie/core/features/break-glass";

/**
 * The browser half of the limited-session page (R-30, R-65). Its one action returns to the
 * break-glass door with a native hard navigation (the anchor), because the root layout decides
 * the limited page and App Router does not re-render a shared layout on a soft navigation (S1).
 */
export function LimitedSessionMount(props: {
  readonly productName: string;
  readonly passwordChanged: boolean;
  readonly authenticatorEnrolled: boolean;
}) {
  return (
    <LimitedSessionPage
      productName={props.productName}
      passwordChanged={props.passwordChanged}
      authenticatorEnrolled={props.authenticatorEnrolled}
    />
  );
}
