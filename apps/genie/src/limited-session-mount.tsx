"use client";

import { LimitedSessionPage } from "@genie/core/features/break-glass";

/**
 * The browser half of the limited-session page (R-30, R-65). Its one action returns to the
 * break-glass door, which shows the first unmet step. It is a full navigation on purpose: the
 * root layout decides the limited page, and App Router does not re-render a shared layout on a
 * soft navigation, so only a hard load can leave the limited page (review S1).
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
      onContinueSetup={() => window.location.assign("/admin/login")}
    />
  );
}
