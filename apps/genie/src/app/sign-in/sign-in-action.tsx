"use client";

import { buttonVariants, Checkbox, focusRing } from "@genie/ui";
import { useState } from "react";

export type SignInActionProps = {
  readonly notice: string | null;
  readonly requiresAcknowledgement: boolean;
  readonly label: string;
  /** Where the first entry starts the sign-in; the SSO entry adds the provider hint (R-17c). */
  readonly href?: string;
  /** The label of the second entry, "Sign in with email and password", set only beside SSO (R-17c). */
  readonly passwordLabel?: string;
  readonly acknowledgeLabel: string;
  /** The realm's reset-password page, set only while the realm holds local accounts (R-51a). */
  readonly forgotPasswordUrl?: string | null;
  readonly forgotPasswordLabel?: string;
};

const SIGN_IN_ROUTE = "/api/auth/sign-in/keycloak";

// The shadcn default size (40 px) at the full width of the stack, with no icon (direction D2).
const ACTION_CLASS = `${buttonVariants({ size: "md" })} w-full ${focusRing}`;

const PASSWORD_CLASS = `${buttonVariants({ variant: "secondary", size: "md" })} w-full ${focusRing}`;

/**
 * The system-use notice and the sign-in entries (R-54): one action, or SSO beside email and password
 * (R-17c). The acknowledgement gates the entries only when there is notice text to acknowledge, so
 * an empty notice never locks a person out.
 */
export function SignInAction({
  notice,
  requiresAcknowledgement,
  label,
  href = SIGN_IN_ROUTE,
  passwordLabel,
  acknowledgeLabel,
  forgotPasswordUrl = null,
  forgotPasswordLabel,
}: SignInActionProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const text = notice?.trim() ?? "";

  const gated = text !== "" && requiresAcknowledgement;

  // The acknowledgement gates every entry: a disabled button until it is given, then a link.
  const entry = (name: string, target: string, className: string) =>
    gated && !acknowledged ? (
      <button
        type="button"
        disabled
        className={`${className} cursor-not-allowed opacity-50`}
      >
        {name}
      </button>
    ) : (
      <a href={target} className={className}>
        {name}
      </a>
    );

  return (
    <div className="flex flex-col gap-3">
      {text === "" ? null : (
        <div className="rounded-lg border bg-muted text-sm">
          <p role="note" className="p-4 whitespace-pre-line">
            {text}
          </p>
          {gated ? (
            <label className="flex items-center gap-3 border-t px-4 py-3">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={setAcknowledged}
              />
              {acknowledgeLabel}
            </label>
          ) : null}
        </div>
      )}
      {entry(label, href, ACTION_CLASS)}
      {passwordLabel === undefined
        ? null
        : entry(passwordLabel, SIGN_IN_ROUTE, PASSWORD_CLASS)}
      {forgotPasswordUrl === null ? null : (
        <a
          href={forgotPasswordUrl}
          className={`self-center rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${focusRing}`}
        >
          {forgotPasswordLabel}
        </a>
      )}
    </div>
  );
}
