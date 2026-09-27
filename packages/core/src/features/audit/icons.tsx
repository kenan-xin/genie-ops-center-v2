import type { JSX, ReactNode } from "react";

/**
 * The handful of line icons the Audit log screen uses, inline so the browser-safe feature folder
 * needs no icon dependency. Each draws on a 24-unit grid, strokes with `currentColor`, and is
 * `aria-hidden` because the nearby text always carries the name.
 */
type IconProps = {
  readonly className?: string | undefined;
};

function Icon(props: {
  readonly className?: string | undefined;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      {props.children}
    </svg>
  );
}

export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function FiltersIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function SystemIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ExternalLinkIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a1 1 0 0 1 1-1h9" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Icon className={props.className}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}
