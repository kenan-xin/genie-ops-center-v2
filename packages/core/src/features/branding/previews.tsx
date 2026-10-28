"use client";

import { buttonVariants } from "@genie/ui";

import { foregroundFor } from "../../lib/branding/foreground.ts";
import { primaryPair } from "../../lib/branding/tokens.ts";
import { HEX_COLOR } from "../../services/branding/schemas.ts";
import { TenantMark } from "../shell/identity-block.tsx";
import type { ShellIdentity } from "../shell/types.ts";
import { SignInStack } from "../sign-in/sign-in-stack.tsx";

/**
 * The draft colors for every element that carries `data-branding-preview` with this scope, the
 * way the root layout writes `:root` (R-12). Only a valid hex reaches the style element, so a
 * draft value can never close it; anything else falls back to the default pair.
 */
export function PreviewColors(props: {
  readonly scope: string;
  readonly primaryColor: string;
  readonly signInBackground: string | null;
}) {
  const pair = primaryPair({
    primaryColor: props.primaryColor,
    primaryForeground: foregroundFor(props.primaryColor),
  });

  const background =
    props.signInBackground !== null && HEX_COLOR.test(props.signInBackground)
      ? props.signInBackground
      : "var(--background)";

  const root = `[data-branding-preview="${props.scope}"]`;

  // `dark:` classes follow the page theme, not the preview toggle, so the preview reads its brand
  // text color from a variable that the toggle's own data-theme sets (R-47).
  return (
    // The draft color is a runtime tenant value; the root layout writes the saved one on :root the
    // same way (R-12). packages/config pins this file as a no-inline-styles exception (U-8).
    <style>{`${root}{--primary:${pair.primary};--primary-foreground:${pair.foreground};--sign-in-background:${background};--preview-brand:var(--primary);}${root}[data-theme="dark"]{--preview-brand:var(--brand-on-dark);--sign-in-background:var(--background);}`}</style>
  );
}

const NAV = ["Reports", "Settings"];

/** A small shell: the identity block, an active row with its count pill, and a primary button. */
export function ShellPreview(props: { readonly identity: ShellIdentity }) {
  return (
    <div className="flex min-h-60 overflow-hidden rounded-lg border bg-background text-sm">
      <div className="flex w-36 shrink-0 flex-col gap-3 border-r bg-muted p-2 sm:w-44">
        <div className="flex min-w-0 items-center gap-2">
          <TenantMark identity={props.identity} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">
              {props.identity.companyName}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {props.identity.productName}
            </span>
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          <li className="flex items-center justify-between rounded-md border bg-background px-2 py-1.5 font-semibold text-(--preview-brand)">
            Requests
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              3
            </span>
          </li>
          {NAV.map((label) => (
            <li key={label} className="px-2 py-1.5 text-muted-foreground">
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <p className="font-semibold">Requests</p>
        <p className="rounded-lg border bg-card p-3 text-muted-foreground">
          Three requests wait for review.
        </p>
        <span className="self-start rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
          New request
        </span>
      </div>
    </div>
  );
}

/**
 * The sign-in page's stack with the draft heading, welcome text, notice and background (R-54).
 * The mark is the page's default mark (F-1), and an empty welcome text shows no line (DR-04).
 */
export function SignInPreview(props: {
  readonly identity: ShellIdentity;
  readonly heading: string;
  readonly welcomeText: string;
  readonly noticeText: string;
  readonly requiresAcknowledgement: boolean;
}) {
  const notice = props.noticeText.trim();
  const gated = notice !== "" && props.requiresAcknowledgement;

  return (
    <div className="flex justify-center rounded-lg bg-(--sign-in-background) px-4 py-8">
      <SignInStack
        identity={{ ...props.identity, markUrl: null }}
        heading={props.heading}
        headingAs="p"
        welcome={props.welcomeText.trim() || null}
      >
        {/* The page's notice block and entry, as text: a preview holds no link or control. */}
        <div className="flex flex-col gap-3">
          {notice === "" ? null : (
            <div className="rounded-lg border bg-muted text-sm">
              <p className="p-4 whitespace-pre-line">{notice}</p>
              {gated ? (
                <p className="border-t px-4 py-3">
                  I acknowledge these conditions.
                </p>
              ) : null}
            </div>
          )}
          <span
            className={`${buttonVariants({ size: "md" })} w-full ${gated ? "opacity-50" : ""}`}
          >
            Sign in with SSO
          </span>
        </div>
      </SignInStack>
    </div>
  );
}
