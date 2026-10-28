import { buttonVariants, EmptyState, focusRing } from "@genie/ui";
import { LockIcon } from "lucide-react";

export type NoAccessStateProps = {
  readonly title: string;
  readonly description: string;
  readonly home: { readonly href: string; readonly label: string };
};

/**
 * A page the viewer may not open (Spec 3 R-35, DEC-39). The neutral lock reads as a refusal, not as
 * "nothing yet", and it says nothing about what the page would have shown. Copy comes in as props.
 */
export function NoAccessState(props: NoAccessStateProps) {
  return (
    <EmptyState
      variant="framed"
      headingLevel="h1"
      icon={<LockIcon />}
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
