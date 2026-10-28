import {
  Button,
  Field,
  FieldLabel,
  HelpDisclosure,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  focusRing,
} from "@genie/ui";
import { useRef, useState } from "react";
import type { JSX } from "react";

import {
  PASSWORD_MIN_LENGTH,
  passwordRuleRows,
} from "../../lib/password/rule.ts";
import type { BreakGlassStep } from "../../services/auth/limited.ts";
import type { ShellIdentity } from "../shell/types.ts";
import { SignInStack } from "../sign-in/sign-in-stack.tsx";

export { breakGlassSteps } from "../../services/auth/limited.ts";

export type { BreakGlassStep } from "../../services/auth/limited.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- dense presentational markup keeps related lines together. */

/**
 * The break-glass door at `/admin/login` (R-62 to R-65, design spec "sign-in and tenant pages").
 * It uses the sign-in stack of the sign-in page, with no card. One step at a time: credentials, the six-digit code for an enrolled account, the forced password
 * change with the shared R-64 meter, and authenticator enrollment with a QR placeholder, the
 * manual key and one confirming code. The host owns every request and decides the step; this
 * component owns only the form state and the copy.
 */

/** What the enrollment card renders once the host has started enrollment (R-63). */
export type BreakGlassEnrollment = {
  readonly otpauthUri: string;
  readonly manualKey: string;
  readonly issuer: string;
};

export type BreakGlassSignInProps = {
  /** The tenant mark and product name over the stack; the host passes the TOTP issuer itself. */
  readonly identity: ShellIdentity;
  /** The label of the help button on the setup steps, from the app catalogue. */
  readonly setupHelpLabel: string;
  /** Why the setup steps hold the account at the door (R-65), from the app catalogue. */
  readonly setupHelp: string;
  /** The account email the meter compares the new password against, when the host knows it. */
  readonly email?: string;
  /** Which card is shown; the host decides after each callback resolves. */
  readonly step: BreakGlassStep;
  /** The cards this account still has to pass, in order, for the "Step n of m" counter. */
  readonly steps: readonly BreakGlassStep[];
  /** Inline error for the current step, or null. A wrong code clears every box. */
  readonly error?: string | null;
  /** The per-deployment rate limit refused the last attempt (R-21): inputs disabled, no retry. */
  readonly tooManyAttempts?: boolean;
  /** Minutes until the rate-limit window ends, shown in the neutral notice (R-21). */
  readonly retryAfterMinutes?: number;
  /** The enrollment target once the host has started enrollment, else null. */
  readonly enrollment?: BreakGlassEnrollment | null;
  /** True while a request from the host is in flight. */
  readonly pending?: boolean;
  readonly onSubmitCredentials?: (email: string, password: string) => void;
  readonly onSubmitAuthenticatorCode?: (code: string) => void;
  readonly onChangePassword?: (
    currentPassword: string,
    newPassword: string
  ) => void;
  /** Enrollment: prove the app is set up with the first code it shows. */
  readonly onConfirmEnrollment?: (code: string) => void;
  /** Enrollment: the current password that starts (or restarts) enrollment. */
  readonly onStartEnrollment?: (password: string) => void;
  /** "Use a different account" from the code step returns to step one. */
  readonly onUseDifferentAccount?: () => void;
  /** "Member sign-in" link under the card. */
  readonly onGoToMemberSignIn?: () => void;
  /** The member sign-in route the link points at (S1). Defaults to `/sign-in`. */
  readonly memberSignInHref?: string;
};

/** The three finder squares of the placeholder pattern, at the fixed 21x21 positions. */
function isFinderCell(row: number, column: number): boolean {
  return (
    (row < 7 && column < 7) ||
    (row < 7 && column > 13) ||
    (row > 13 && column < 7)
  );
}

/** Deterministic placeholder pattern standing in for a scannable code (the design's stand-in). */
function EnrollmentCode({ seed }: { readonly seed: string }): JSX.Element {
  const cells: boolean[] = [];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  for (let index = 0; index < 21 * 21; index += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    cells.push(((hash >>> 16) & 1) === 1);
  }
  return (
    <svg
      viewBox="0 0 21 21"
      role="img"
      aria-label="QR code for the authenticator app"
      className="size-40 shrink-0 rounded-lg border border-border bg-card p-2 text-foreground"
    >
      {cells.map((on, index) => {
        const row = Math.floor(index / 21);
        const column = index % 21;
        const inFinder = isFinderCell(row, column);
        const finderRow = row < 7 ? row : row - 14;
        const finderColumn = column < 7 ? column : column - 14;
        const fill = inFinder
          ? finderRow === 0 ||
            finderRow === 6 ||
            finderColumn === 0 ||
            finderColumn === 6 ||
            (finderRow >= 2 &&
              finderRow <= 4 &&
              finderColumn >= 2 &&
              finderColumn <= 4)
          : on;
        return fill ? (
          <rect
            key={index}
            x={column}
            y={row}
            width={1}
            height={1}
            fill="currentColor"
          />
        ) : null;
      })}
    </svg>
  );
}

function Icon({ path }: { readonly path: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

const CHECK_PATH = "M20 6 9 17l-5-5";
const COPY_PATH =
  "M9 9h10v10H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1";
const EYE_PATH =
  "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
const EYE_OFF_PATH =
  "m3 3 18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.4A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 4M6.3 6.3A17 17 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4.1-.8";
const SHIELD_PATH = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z";
const TIMER_PATH = "M12 8v4l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z";
const ALERT_PATH =
  "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z";
const LEFT_PATH = "m12 19-7-7 7-7M19 12H5";
const QR_PATH =
  "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 20h1v1h-1z";

function ErrorBlock({ message }: { readonly message: string }): JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm text-foreground [&_svg]:text-destructive dark:[&_svg]:text-destructive-on-dark"
    >
      <Icon path={ALERT_PATH} />
      <span>{message}</span>
    </div>
  );
}

/**
 * The neutral notice a rate-limited card shows, with the whole minutes left (R-19, R-21). It is
 * shared by the sign-in card and every password card (change, enroll, re-enroll).
 */
export function RateLimitNotice(props: {
  readonly retryAfterMinutes: number;
}): JSX.Element {
  return (
    <div
      role="status"
      data-testid="rate-limit-notice"
      className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-sm"
    >
      <Icon path={TIMER_PATH} />
      <span>
        Too many attempts. Try again in {props.retryAfterMinutes} minutes.
      </span>
    </div>
  );
}

function PasswordField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly autoComplete: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={props.id}
          size="lg"
          type={show ? "text" : "password"}
          autoComplete={props.autoComplete}
          value={props.value}
          disabled={props.disabled === true}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => setShow((value) => !value)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            disabled={props.disabled === true}
          >
            <Icon path={show ? EYE_OFF_PATH : EYE_PATH} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

/**
 * Six one-digit boxes in one labeled group: a visible legend, a per-box `aria-label`, auto
 * advance, Backspace steps back, the arrows move, and a pasted six-digit string fills every box.
 * The host remounts it (a new `key`) after a wrong code so focus returns to the first box.
 */
function CodeInput(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoFocus?: boolean;
}): JSX.Element {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from(
    { length: 6 },
    (_, index) => props.value[index] ?? ""
  );
  const focusAt = (index: number) =>
    refs.current[Math.max(0, Math.min(5, index))]?.focus();

  const setAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    props.onChange(next.join(""));
  };

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 block w-full text-center text-sm font-semibold text-foreground">
        Authentication code
      </legend>
      <div className="flex items-center justify-center gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            aria-label={`Digit ${index + 1} of 6`}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus={props.autoFocus === true && index === 0}
            maxLength={1}
            value={digit}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "");
              if (value === "") return setAt(index, "");
              if (value.length > 1) {
                const next = digits.slice();
                for (
                  let offset = 0;
                  offset < value.length && index + offset < 6;
                  offset += 1
                )
                  next[index + offset] = value[offset] ?? "";
                props.onChange(next.join(""));
                focusAt(index + value.length);
                return;
              }
              setAt(index, value);
              if (index < 5) focusAt(index + 1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && digit === "" && index > 0) {
                event.preventDefault();
                setAt(index - 1, "");
                focusAt(index - 1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusAt(index - 1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                focusAt(index + 1);
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, 6);
              if (text === "") return;
              event.preventDefault();
              props.onChange(text);
              focusAt(text.length);
            }}
            className={`h-11 w-10 rounded-lg border bg-background text-center font-mono text-xl font-semibold text-foreground ${focusRing} ${
              digit === "" ? "border-input" : "border-foreground/40"
            }`}
          />
        ))}
      </div>
    </fieldset>
  );
}

/** The forced password change and the account page's Change password block share this form. */
export function BreakGlassPasswordForm(props: {
  readonly email: string;
  readonly pending: boolean;
  /** The per-account password window refused the last attempt (R-19, R-21). */
  readonly rateLimited?: boolean;
  readonly retryAfterMinutes?: number;
  readonly onChangePassword: (
    currentPassword: string,
    newPassword: string
  ) => void;
}): JSX.Element {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const rows = passwordRuleRows(next, props.email);
  // The fourth rule (`met: null`) is checked on save, so it does not hold the button.
  const rulesMet =
    next.length > 0 && rows.every((row) => row.met === null || row.met);
  const confirmOk = next.length > 0 && next === confirm;
  const disabled = props.rateLimited === true;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) props.onChangePassword(current, next);
      }}
    >
      {disabled ? (
        <RateLimitNotice retryAfterMinutes={props.retryAfterMinutes ?? 15} />
      ) : null}
      <PasswordField
        id="bg-current"
        label="Current password"
        value={current}
        autoComplete="current-password"
        disabled={disabled}
        onChange={setCurrent}
      />
      <div className="flex flex-col gap-2">
        <PasswordField
          id="bg-new"
          label="New password"
          value={next}
          autoComplete="new-password"
          disabled={disabled}
          onChange={setNext}
        />
        <ul className="flex flex-col gap-1 rounded-lg bg-muted px-3.5 py-3 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                  row.met === true
                    ? "bg-primary text-primary-foreground"
                    : row.key === "notProvisioning"
                      ? "bg-muted-foreground/30"
                      : "border border-input"
                }`}
              >
                {row.met === true ? (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    className="size-4"
                  >
                    <path d={CHECK_PATH} />
                  </svg>
                ) : null}
              </span>
              <span
                className={
                  row.key === "notProvisioning"
                    ? "text-muted-foreground"
                    : undefined
                }
              >
                {PASSWORD_RULE_LABELS[row.key]}
                {row.key === "notProvisioning" ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · Checked when you save
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <PasswordField
        id="bg-confirm"
        label="Confirm new password"
        value={confirm}
        autoComplete="new-password"
        disabled={disabled}
        onChange={setConfirm}
      />
      {confirm !== "" && !confirmOk ? (
        <p className="-mt-2 text-xs text-destructive dark:text-destructive-on-dark">
          Passwords do not match.
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={
          disabled || !current || !rulesMet || !confirmOk || props.pending
        }
      >
        Set password and continue
      </Button>
    </form>
  );
}

const PASSWORD_RULE_LABELS = {
  length: `At least ${PASSWORD_MIN_LENGTH} characters`,
  classes:
    "Three of four character classes (lower case, upper case, digit, symbol)",
  notEmail: "Not the account email",
  notProvisioning: "Not the temporary password you were given",
} as const;

export function BreakGlassSignIn(props: BreakGlassSignInProps): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollPassword, setEnrollPassword] = useState("");
  const [copied, setCopied] = useState(false);
  // A wrong code clears every box (R-62, design): reset during render on a changed error. The
  // compared value is the normalized one, or `undefined !== null` loops forever.
  const error = props.error ?? null;
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error !== null) {
      setCode("");
      setEnrollCode("");
    }
  }

  const stepIndex = Math.max(0, props.steps.indexOf(props.step)) + 1;
  const title =
    props.step === "credentials"
      ? "Administrator sign-in"
      : props.step === "authenticator-code"
        ? "Enter your code"
        : props.step === "change-password"
          ? "Set a new password"
          : "Add an authenticator app";
  const description =
    props.step === "credentials"
      ? "For the tenant break-glass account only. Members sign in with their company account."
      : props.step === "authenticator-code"
        ? "Open your authenticator app and enter the six-digit code for this account."
        : props.step === "change-password"
          ? "Your temporary password must be replaced before you continue."
          : "Scan the code with an authenticator app, then confirm with the code it shows. This account cannot be used without one.";

  const setupStep =
    props.step === "change-password" || props.step === "authenticator-enroll";

  return (
    <main
      data-testid="break-glass-sign-in"
      className="flex min-h-dvh flex-col items-center justify-center bg-sign-in-background px-4 py-12 text-foreground dark:bg-background"
    >
      <SignInStack
        identity={props.identity}
        heading={title}
        welcome={description}
        eyebrow={
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
              <Icon path={SHIELD_PATH} />
              Administrator
            </span>
            <span className="text-xs text-muted-foreground">
              Step {stepIndex} of {props.steps.length}
            </span>
          </div>
        }
        help={
          setupStep ? (
            <HelpDisclosure label={props.setupHelpLabel} align="start">
              <p>{props.setupHelp}</p>
            </HelpDisclosure>
          ) : null
        }
        notice={
          props.error === null || props.error === undefined ? null : (
            <ErrorBlock message={props.error} />
          )
        }
        footer={
          // A plain anchor, because core imports nothing from `next/*`. A host that passes
          // `onGoToMemberSignIn` (a story) observes the click instead.
          <a
            href={props.memberSignInHref ?? "/sign-in"}
            onClick={(event) => {
              if (props.onGoToMemberSignIn === undefined) return;
              event.preventDefault();
              props.onGoToMemberSignIn();
            }}
            className={`rounded-lg text-sm text-muted-foreground hover:text-foreground hover:underline ${focusRing}`}
          >
            Member sign-in
          </a>
        }
      >
        {props.step === "credentials" ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (props.tooManyAttempts !== true)
                props.onSubmitCredentials?.(email, password);
            }}
          >
            {props.tooManyAttempts === true ? (
              <div
                role="status"
                data-testid="rate-limit-notice"
                className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-sm"
              >
                <Icon path={TIMER_PATH} />
                <span>
                  Too many sign-in attempts. Try again in{" "}
                  {props.retryAfterMinutes ?? 15} minutes.
                </span>
              </div>
            ) : null}
            <fieldset
              disabled={props.tooManyAttempts === true}
              className="contents"
            >
              <Field>
                <FieldLabel htmlFor="bg-email">Email</FieldLabel>
                <Input
                  id="bg-email"
                  size="lg"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <PasswordField
                id="bg-password"
                label="Password"
                value={password}
                autoComplete="current-password"
                onChange={setPassword}
              />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={
                  email === "" || password === "" || props.pending === true
                }
              >
                Sign in
              </Button>
            </fieldset>
          </form>
        ) : null}

        {props.step === "authenticator-code" ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              props.onSubmitAuthenticatorCode?.(code);
            }}
          >
            <CodeInput
              key={props.error ?? ""}
              value={code}
              onChange={setCode}
              autoFocus
            />
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={code.length !== 6 || props.pending === true}
            >
              Verify
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => props.onUseDifferentAccount?.()}
            >
              <Icon path={LEFT_PATH} />
              Use a different account
            </Button>
          </form>
        ) : null}

        {props.step === "change-password" ? (
          <BreakGlassPasswordForm
            email={props.email ?? email}
            pending={props.pending === true}
            rateLimited={props.tooManyAttempts === true}
            retryAfterMinutes={props.retryAfterMinutes ?? 15}
            onChangePassword={(current, next) =>
              props.onChangePassword?.(current, next)
            }
          />
        ) : null}

        {props.step === "authenticator-enroll" ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (props.tooManyAttempts === true) return;
              if (props.enrollment === null || props.enrollment === undefined)
                props.onStartEnrollment?.(enrollPassword);
              else props.onConfirmEnrollment?.(enrollCode);
            }}
          >
            {props.tooManyAttempts === true ? (
              <RateLimitNotice
                retryAfterMinutes={props.retryAfterMinutes ?? 15}
              />
            ) : null}
            {props.enrollment === null || props.enrollment === undefined ? (
              <>
                <PasswordField
                  id="bg-enroll-password"
                  label="Confirm your password to add an authenticator"
                  value={enrollPassword}
                  autoComplete="current-password"
                  disabled={props.tooManyAttempts === true}
                  onChange={setEnrollPassword}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={
                    enrollPassword === "" ||
                    props.pending === true ||
                    props.tooManyAttempts === true
                  }
                >
                  Start enrollment
                </Button>
              </>
            ) : (
              <>
                {/* One column at every width: the 320 px stack has no room for the code beside the key. */}
                <div className="flex flex-col items-center gap-3">
                  <EnrollmentCode seed={props.enrollment.otpauthUri} />
                  <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <Icon path={QR_PATH} />
                      Scan with any authenticator app. Cannot scan? Enter this
                      key by hand.
                    </p>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                      <code
                        data-testid="enrollment-manual-key"
                        className="flex-1 font-mono text-sm tracking-wider"
                      >
                        {props.enrollment.manualKey}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={copied ? "Key copied" : "Copy key"}
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            props.enrollment?.manualKey.replace(/\s/g, "") ?? ""
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                      >
                        {copied ? (
                          <Icon path={CHECK_PATH} />
                        ) : (
                          <Icon path={COPY_PATH} />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Issuer {props.enrollment.issuer}
                    </p>
                  </div>
                </div>
                <CodeInput
                  key={props.error ?? ""}
                  value={enrollCode}
                  onChange={setEnrollCode}
                  autoFocus={Boolean(props.error)}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={enrollCode.length !== 6 || props.pending === true}
                >
                  Confirm and open the console
                </Button>
              </>
            )}
          </form>
        ) : null}
      </SignInStack>
    </main>
  );
}
