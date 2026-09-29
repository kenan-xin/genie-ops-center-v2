import type { JSX } from "react";
/* oxlint-disable anti-slop/require-readable-spacing -- dense presentational markup keeps related lines together. */

/**
 * The limited-session page (R-30, R-65, design spec "limited-session page"): a standalone
 * neutral surface shown while the break-glass account still has to change its password or enroll
 * an authenticator. Its one action returns to the break-glass flow at the first unmet step.
 */
export type LimitedSessionPageProps = {
  readonly productName: string;
  /** True once the forced password change has completed. */
  readonly passwordChanged: boolean;
  /** True once the authenticator is enrolled. */
  readonly authenticatorEnrolled: boolean;
  readonly onContinueSetup?: () => void;
};

function CheckIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function LimitedSessionPage(
  props: LimitedSessionPageProps
): JSX.Element {
  const items = [
    { label: "Change your temporary password", done: props.passwordChanged },
    { label: "Enroll an authenticator app", done: props.authenticatorEnrolled },
  ];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="flex w-full max-w-110 flex-col items-center">
        <span className="mb-6 text-sm font-semibold tracking-tight text-muted-foreground">
          {props.productName}
        </span>
        <div
          data-testid="limited-session-page"
          className="w-full rounded-xl border border-border bg-card p-7 sm:p-8"
        >
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-bold leading-tight tracking-tight">
                Finish setting up your account
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                Other pages open after the password change and the authenticator
                enrollment.
              </p>
            </header>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                      item.done
                        ? "bg-primary text-primary-foreground"
                        : "border border-input"
                    }`}
                  >
                    {item.done ? <CheckIcon /> : null}
                  </span>
                  <span className="sr-only">
                    {item.done ? "Done:" : "To do:"}
                  </span>
                  <span
                    className={
                      item.done
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => props.onContinueSetup?.()}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground motion-safe:transition-colors hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Continue setup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
