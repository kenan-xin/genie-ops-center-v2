import type { ShellIdentity } from "@genie/core/features/shell";
import { SignInStack } from "@genie/core/features/sign-in";
import { InfoNote, WarningNote } from "@genie/ui";

import { SignInAction, type SignInActionProps } from "./sign-in-action.tsx";
import { SignInFooter, type SignInFooterProps } from "./sign-in-footer.tsx";

export type SignInViewProps = {
  readonly identity: ShellIdentity;
  readonly heading: string;
  readonly welcome: string | null;
  /** A refusal is an amber alert; an expired or signed-out session is a blue status. */
  readonly notice: {
    readonly tone: "info" | "warning";
    readonly text: string;
  } | null;
  readonly action: SignInActionProps;
  readonly footer: SignInFooterProps;
  readonly contextId: string;
  readonly state: string;
};

/** The sign-in page as the page resolved it: the full-height background around the stack. */
export function SignInView({
  identity,
  heading,
  welcome,
  notice,
  action,
  footer,
  contextId,
  state,
}: SignInViewProps) {
  return (
    <main
      // AC-26: the anonymous page bundle stamps the context id it read (the home page redirects here).
      data-context-id={contextId}
      data-sign-in-state={state}
      className="flex min-h-dvh flex-col items-center justify-center bg-sign-in-background px-4 py-12 dark:bg-background"
    >
      <SignInStack
        identity={identity}
        heading={heading}
        welcome={welcome}
        notice={
          notice === null ? null : (
            <div data-testid="sign-in-banner">
              {notice.tone === "warning" ? (
                <WarningNote size="md" role="alert">
                  {notice.text}
                </WarningNote>
              ) : (
                <InfoNote size="md" role="status">
                  {notice.text}
                </InfoNote>
              )}
            </div>
          )
        }
        footer={<SignInFooter {...footer} />}
      >
        <SignInAction {...action} />
      </SignInStack>
    </main>
  );
}
