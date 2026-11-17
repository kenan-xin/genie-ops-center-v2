import { buttonVariants, EmptyState, focusRing } from "@genie/ui";
import { CompassIcon } from "lucide-react";

export type NotFoundStateProps = {
  readonly title: string;
  readonly description: string;
  readonly home: { readonly href: string; readonly label: string };
};

/**
 * A page that does not exist: an unknown address or a missing record (6wz1.129). It says what
 * happened in one line and links home. Copy comes in as props.
 */
export function NotFoundState(props: NotFoundStateProps) {
  return (
    <EmptyState
      variant="framed"
      headingLevel="h1"
      icon={<CompassIcon />}
      title={props.title}
      description={props.description}
      action={
        <a
          href={props.home.href}
          className={`${buttonVariants({ variant: "secondary" })} ${focusRing}`}
        >
          {props.home.label}
        </a>
      }
    />
  );
}
