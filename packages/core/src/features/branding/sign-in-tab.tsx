"use client";

import { FieldError, FieldLabel, focusRing, SwitchField } from "@genie/ui";

import {
  type BrandingDraft,
  HEX_COLOR,
} from "../../services/branding/schemas.ts";
import { TextField } from "./text-field.tsx";

type SignInField =
  | "loginBackgroundColor"
  | "loginWelcomeText"
  | "loginNoticeText"
  | "loginNoticeRequiresAcknowledgement";

/** The sign-in page: background color, welcome text and the system-use notice (R-43, R-54). */
export function SignInTab(props: {
  readonly draft: BrandingDraft;
  readonly issues: Readonly<Record<string, string>>;
  readonly onChange: <K extends SignInField>(
    field: K,
    value: BrandingDraft[K]
  ) => void;
}) {
  const background = props.draft.loginBackgroundColor ?? "";
  const notice = props.draft.loginNoticeText ?? "";
  const noticeError = props.issues["loginNoticeText"];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="color"
          aria-label="Pick the background color"
          value={
            HEX_COLOR.test(background) ? background.toLowerCase() : "#ffffff"
          }
          className={`h-10 w-12 cursor-pointer rounded-lg border bg-background p-1 ${focusRing}`}
          onChange={(event) =>
            props.onChange("loginBackgroundColor", event.target.value)
          }
        />
        <div className="w-48">
          <TextField
            id="branding-sign-in-background"
            label="Background color"
            value={background}
            error={props.issues["loginBackgroundColor"]}
            description="Empty keeps the page background."
            onChange={(value) =>
              props.onChange(
                "loginBackgroundColor",
                value === "" ? null : value
              )
            }
          />
        </div>
      </div>
      <TextField
        id="branding-welcome-text"
        label="Welcome text"
        value={props.draft.loginWelcomeText ?? ""}
        error={props.issues["loginWelcomeText"]}
        onChange={(value) => props.onChange("loginWelcomeText", value)}
      />
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="branding-notice-text">
          System-use notice
        </FieldLabel>
        <textarea
          id="branding-notice-text"
          rows={4}
          value={notice}
          aria-invalid={noticeError !== undefined}
          aria-describedby={
            noticeError === undefined ? undefined : "branding-notice-text-error"
          }
          className={`rounded-lg border border-input bg-background px-3 py-2 text-sm ${focusRing}`}
          onChange={(event) => {
            props.onChange("loginNoticeText", event.target.value);

            // A switch that is disabled cannot be turned off, so clearing the notice clears it.
            if (event.target.value.trim() === "")
              props.onChange("loginNoticeRequiresAcknowledgement", false);
          }}
        />
        {noticeError === undefined ? null : (
          <FieldError id="branding-notice-text-error">{noticeError}</FieldError>
        )}
      </div>
      <SwitchField
        label="People must acknowledge the notice"
        checked={props.draft.loginNoticeRequiresAcknowledgement}
        disabled={notice.trim() === ""}
        {...(notice.trim() === ""
          ? { description: "Add a notice first." }
          : {})}
        onCheckedChange={(checked) =>
          props.onChange("loginNoticeRequiresAcknowledgement", checked)
        }
      />
    </div>
  );
}
