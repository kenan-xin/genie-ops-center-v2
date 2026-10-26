"use client";

import { Checkbox, focusRing } from "@genie/ui";
import { useState } from "react";

export type SignInActionProps = {
  readonly notice: string | null;
  readonly requiresAcknowledgement: boolean;
  readonly label: string;
  readonly acknowledgeLabel: string;
  /** The realm's reset-password page, set only while the realm holds local accounts (R-51a). */
  readonly forgotPasswordUrl?: string | null;
  readonly forgotPasswordLabel?: string;
};

const ACTION_CLASS = `inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground ${focusRing}`;

/**
 * The system-use notice and the one sign-in action (R-54). The acknowledgement gates the action
 * only when there is notice text to acknowledge, so an empty notice never locks a person out.
 */
export function SignInAction({
  notice,
  requiresAcknowledgement,
  label,
  acknowledgeLabel,
  forgotPasswordUrl = null,
  forgotPasswordLabel,
}: SignInActionProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const text = notice?.trim() ?? "";

  const gated = text !== "" && requiresAcknowledgement;

  return (
    <div className="flex flex-col gap-4">
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
      {gated && !acknowledged ? (
        <button
          type="button"
          disabled
          className={`${ACTION_CLASS} cursor-not-allowed opacity-50`}
        >
          {label}
        </button>
      ) : (
        <a href="/api/auth/sign-in/keycloak" className={ACTION_CLASS}>
          {label}
        </a>
      )}
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
