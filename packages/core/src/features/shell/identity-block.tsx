"use client";

import { LabelPill } from "@genie/ui";
import { useCallback, useState } from "react";

import { tenantInitial } from "./tenant-initial.ts";
import type { ShellChrome, ShellIdentity } from "./types.ts";

// The tenant letter tile (tokens.md): 6px small, 8px medium. The mark fills about 70 percent.
const TILE = {
  sm: { tile: "size-8 rounded-md text-sm", mark: "size-5.5" },
  md: { tile: "size-10 rounded-lg text-base", mark: "size-7" },
} as const;

/**
 * The branding square mark, or the letter tile when there is none or it fails to load (an expired
 * link, a missing or unscanned file): never a broken image. No letter and no mark render nothing.
 */
export function TenantMark(props: {
  readonly identity: ShellIdentity;
  readonly size: "sm" | "md";
}) {
  const { markUrl } = props.identity;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const letter = tenantInitial(props.identity.companyName);
  const showMark = markUrl !== null && markUrl !== failedUrl;

  // A server-rendered image can fail before hydration attaches onError. decode() rejects only a
  // broken image, so an SVG with no intrinsic width still counts as loaded. Stable per URL.
  const checkLoaded = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete === true)
        image.decode().catch(() => setFailedUrl(markUrl));
    },
    [markUrl]
  );

  if (!showMark && letter === undefined) return null;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card ${TILE[props.size].tile}`}
    >
      {showMark ? (
        <img
          src={markUrl}
          alt=""
          className={`${TILE[props.size].mark} object-contain`}
          onError={() => setFailedUrl(markUrl)}
          ref={checkLoaded}
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-extrabold text-primary dark:text-brand-on-dark"
        >
          {letter}
        </span>
      )}
    </span>
  );
}

/** The top of the rail (R-39): the mark, the company, then the product or the Admin portal pill. */
export function IdentityBlock(props: {
  readonly chrome: ShellChrome;
  readonly identity: ShellIdentity;
  readonly adminPortalLabel: string;
}) {
  const { companyName, productName } = props.identity;

  return (
    <div
      data-shell-identity=""
      className="flex min-w-0 items-center gap-3 px-3 pt-3 pb-2"
    >
      <TenantMark identity={props.identity} size="md" />
      <span className="min-w-0">
        <span
          title={companyName}
          className="block truncate text-sm font-semibold text-foreground"
        >
          {companyName}
        </span>
        {props.chrome === "admin" ? (
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
            title={productName}
            className="block truncate text-xs text-muted-foreground"
          >
            {productName}
          </span>
        )}
      </span>
    </div>
  );
}
