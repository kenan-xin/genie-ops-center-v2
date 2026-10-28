import { buttonVariants, EmptyState, focusRing } from "@genie/ui";

import { MailIcon } from "../admin/icons.tsx";
import { TenantMark } from "./identity-block.tsx";
import type { ShellIdentity } from "./types.ts";

export type NoGrantsEmptyStateProps = {
  readonly identity: ShellIdentity;
  readonly title: string;
  readonly description: string;
  readonly contact?: { readonly href: string; readonly label: string };
};

/**
 * The home page when the viewer has no workspace entry (R-34): the framed empty state with the
 * company mark tile. Copy comes in as props.
 */
export function NoGrantsEmptyState(props: NoGrantsEmptyStateProps) {
  const { contact } = props;

  return (
    <EmptyState
      variant="framed"
      media={<TenantMark identity={props.identity} size="lg" />}
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
