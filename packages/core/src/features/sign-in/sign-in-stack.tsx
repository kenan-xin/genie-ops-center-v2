import type { ReactNode } from "react";

import { TenantMark } from "../shell/identity-block.tsx";
import type { ShellIdentity } from "../shell/types.ts";

export type SignInStackProps = {
  readonly identity: ShellIdentity;
  readonly heading: string;
  /** `p` inside a preview, so the page that shows it keeps one `h1`. */
  readonly headingAs?: "h1" | "p";
  readonly welcome?: string | null;
  readonly notice?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
};

/**
 * The sign-in stack (direction D2): one centered 320 px column with the tenant mark alone, the
 * heading, an optional welcome line, the notice, the entries or fields at full width, and an
 * optional footer line. No card. The sign-in page, its Branding preview and the break-glass door
 * render it, so the three stay one layout. It renders only the column; the caller owns the page.
 */
export function SignInStack({
  identity,
  heading,
  headingAs: Heading = "h1",
  welcome = null,
  notice,
  footer,
  children,
}: SignInStackProps) {
  return (
    <div
      data-sign-in-stack=""
      className="flex w-full max-w-80 flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <TenantMark identity={identity} size="md" alt={identity.companyName} />
        <div className="flex flex-col gap-1">
          <Heading className="text-xl font-semibold text-balance text-foreground">
            {heading}
          </Heading>
          {welcome === null ? null : (
            <p
              data-testid="sign-in-welcome"
              className="text-sm text-muted-foreground"
            >
              {welcome}
            </p>
          )}
        </div>
      </div>
      {notice === undefined || notice === null ? null : (
        <div className="w-full">{notice}</div>
      )}
      <div className="flex w-full flex-col">{children}</div>
      {footer}
    </div>
  );
}
