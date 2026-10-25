"use client";

import { LabelPill } from "@genie/ui";
import { type ReactNode, useCallback, useState } from "react";

import type { ShellChrome, ShellIdentity } from "./types.ts";

/** The Ops Center icon, a static file of the app's `public/brand/` folder (DR-03, DR-19). */
export const DEFAULT_MARK_URL = "/brand/icon-blue.svg";

// The mark tile (tokens.md): 6px small, 8px medium. The mark fills about 70 percent.
const TILE = {
  sm: { tile: "size-8 rounded-md", mark: "size-5.5" },
  md: { tile: "size-10 rounded-lg", mark: "size-7" },
} as const;

/**
 * A published branding image whose `src` turns null once it fails to load (an expired link, a
 * missing or unscanned file), so the caller falls back instead of showing a broken image.
 */
function useBrandingImage(url: string | null) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // A server-rendered image can fail before hydration attaches onError. decode() rejects only a
  // broken image, so an SVG with no intrinsic width still counts as loaded. Stable per URL.
  const ref = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete === true)
        image.decode().catch(() => setFailedUrl(url));
    },
    [url]
  );

  return {
    src: url === failedUrl ? null : url,
    ref,
    onError: () => setFailedUrl(url),
  };
}

/** The branding square mark, or the Ops Center icon when there is none or it fails to load. */
export function TenantMark(props: {
  readonly identity: ShellIdentity;
  readonly size: "sm" | "md";
}) {
  const mark = useBrandingImage(props.identity.markUrl);

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card ${TILE[props.size].tile}`}
    >
      <img
        src={mark.src ?? DEFAULT_MARK_URL}
        alt=""
        className={`${TILE[props.size].mark} object-contain`}
        onError={mark.onError}
        ref={mark.ref}
      />
    </span>
  );
}

/** One theme's identity: its logo above the second line, else the mark beside both names. */
function IdentityRow(props: {
  readonly identity: ShellIdentity;
  readonly logoUrl: string | null;
  readonly secondLine: ReactNode;
}) {
  const logo = useBrandingImage(props.logoUrl);
  const { companyName } = props.identity;

  if (logo.src !== null)
    return (
      <span className="flex min-w-0 flex-col items-start gap-1">
        <img
          src={logo.src}
          alt={companyName}
          title={companyName}
          className="h-8 max-w-full object-contain object-left"
          onError={logo.onError}
          ref={logo.ref}
        />
        {props.secondLine}
      </span>
    );

  return (
    <span className="flex min-w-0 items-center gap-3">
      <TenantMark identity={props.identity} size="md" />
      <span className="min-w-0">
        <span
          title={companyName}
          className="block truncate text-sm font-semibold text-foreground"
        >
          {companyName}
        </span>
        {props.secondLine}
      </span>
    </span>
  );
}

/**
 * The top of the rail (R-39, DR-03): the light logo in light theme and the dark logo in dark theme,
 * else the mark and the company, then the product or the Admin portal pill.
 */
export function IdentityBlock(props: {
  readonly chrome: ShellChrome;
  readonly identity: ShellIdentity;
  readonly adminPortalLabel: string;
}) {
  const { identity } = props;

  const secondLine =
    props.chrome === "admin" ? (
      <span className="mt-0.5 flex">
        <LabelPill>
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-muted-foreground"
          />
          {props.adminPortalLabel}
        </LabelPill>
      </span>
    ) : (
      <span
        title={identity.productName}
        className="block truncate text-xs text-muted-foreground"
      >
        {identity.productName}
      </span>
    );

  const row = (logoUrl: string | null) => (
    <IdentityRow
      identity={identity}
      logoUrl={logoUrl}
      secondLine={secondLine}
    />
  );

  // A dark-theme row never borrows the light logo: dark ink can vanish on the dark panel.
  return (
    <div data-shell-identity="" className="min-w-0 px-3 pt-3 pb-2">
      {identity.logoLightUrl === identity.logoDarkUrl ? (
        row(identity.logoLightUrl)
      ) : (
        <>
          <span className="block dark:hidden">
            {row(identity.logoLightUrl)}
          </span>
          <span className="hidden dark:block">{row(identity.logoDarkUrl)}</span>
        </>
      )}
    </div>
  );
}
