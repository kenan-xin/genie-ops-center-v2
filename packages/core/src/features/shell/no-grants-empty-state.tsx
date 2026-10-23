import { buttonVariants, EmptyState, focusRing } from "@genie/ui";

import { MailIcon } from "../admin/icons.tsx";

export type NoGrantsEmptyStateProps = {
  readonly companyName: string;
  readonly title: string;
  readonly description: string;
  readonly contact?: { readonly href: string; readonly label: string };
};

/** The home page when the viewer holds no solution grant (R-34). Copy comes in as props. */
export function NoGrantsEmptyState(props: NoGrantsEmptyStateProps) {
  const { contact } = props;
  // The tenant letter tile (tokens.md, letter tile medium); no letter, no tile.
  const letter = Array.from(props.companyName.trim())[0]?.toLocaleUpperCase();

  return (
    <EmptyState
      media={
        letter === undefined ? undefined : (
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-lg border bg-card text-xl font-semibold text-primary dark:text-brand-on-dark"
          >
            {letter}
          </span>
        )
      }
      title={props.title}
      description={props.description}
      action={
        contact ? (
          <a
            href={contact.href}
            className={`${buttonVariants({ variant: "secondary" })} ${focusRing}`}
          >
            <MailIcon />
            {contact.label}
          </a>
        ) : undefined
      }
    />
  );
}
