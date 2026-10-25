import {
  brandingTokens,
  type BrandingTokenSource,
} from "../../lib/branding/tokens.ts";

/**
 * R-17: the organization's theme is `system`, so the device decides. This runs in <head>
 * before the body paints, and it keeps following the device while the page is open.
 */
const FOLLOW_DEVICE_THEME =
  '(()=>{const m=matchMedia("(prefers-color-scheme: dark)");const a=()=>{document.documentElement.dataset.theme=m.matches?"dark":"light"};a();m.addEventListener("change",a)})()';

export type BrandingHead = {
  /** The `data-theme` that `<html>` carries before any script runs. */
  readonly theme: "light" | "dark";
  /** The per-request `:root` rule (R-12, R-16), unlayered so it beats the fixed defaults. */
  readonly rootCss: string;
  /** Set only when the device decides the theme (R-17). */
  readonly followDeviceScript: string | undefined;
};

/**
 * The tenant branding output of the document head (D3-5). No row means the packages/ui defaults
 * and a theme that follows the device (R-12a): a fresh deployment and the not-set-up page have none.
 */
export function brandingHead(
  branding:
    | (BrandingTokenSource & { readonly defaultTheme: string })
    | undefined
): BrandingHead {
  const pinned =
    branding?.defaultTheme === "light" || branding?.defaultTheme === "dark"
      ? branding.defaultTheme
      : undefined;

  const declarations = Object.entries(brandingTokens(branding))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  return {
    theme: pinned ?? "light",
    rootCss: `:root{${declarations}}`,
    followDeviceScript: pinned === undefined ? FOLLOW_DEVICE_THEME : undefined,
  };
}

/** The head elements for one `brandingHead` result. The root layout renders this inside <head>. */
export function BrandingHeadElements(props: { readonly head: BrandingHead }) {
  return (
    <>
      {props.head.followDeviceScript === undefined ? null : (
        <script
          dangerouslySetInnerHTML={{ __html: props.head.followDeviceScript }}
        />
      )}
      <style>{props.head.rootCss}</style>
    </>
  );
}
