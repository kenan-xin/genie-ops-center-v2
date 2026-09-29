"use client";

import { LimitedSessionPage } from "@genie/core/features/break-glass";
import { useRouter } from "next/navigation.js";

/**
 * The browser half of the limited-session page (R-30, R-65). Its one action returns to the
 * break-glass door, which shows the first unmet step.
 */
export function LimitedSessionMount(props: {
  readonly productName: string;
  readonly passwordChanged: boolean;
  readonly authenticatorEnrolled: boolean;
}) {
  const router = useRouter();

  return (
    <LimitedSessionPage
      productName={props.productName}
      passwordChanged={props.passwordChanged}
      authenticatorEnrolled={props.authenticatorEnrolled}
      onContinueSetup={() => router.push("/admin/login")}
    />
  );
}
