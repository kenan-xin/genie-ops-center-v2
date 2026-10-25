import { buttonVariants, EmptyState, focusRing } from "@genie/ui";

import { MailIcon } from "../admin/icons.tsx";

export type NoGrantsEmptyStateProps = {
  readonly title: string;
  readonly description: string;
  readonly contact?: { readonly href: string; readonly label: string };
};

/** The home page when the viewer holds no solution grant (R-34). Copy comes in as props. */
export function NoGrantsEmptyState(props: NoGrantsEmptyStateProps) {
  const { contact } = props;

  return (
    <EmptyState
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
