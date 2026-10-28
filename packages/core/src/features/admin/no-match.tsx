import { Button, EmptyState } from "@genie/ui";

/** The copy of a list that matches nothing, from the host catalogue (DEC-13). */
export type NoMatchCopy = {
  readonly title: string;
  readonly description: string;
  readonly clearLabel: string;
};

/**
 * A list whose search and filters match nothing: the compact empty state, so People, Groups, Roles
 * and the audit log say "no match" the same way, with one outline button that clears both.
 */
export function NoMatch(props: {
  readonly copy: NoMatchCopy;
  readonly onClear: () => void;
}) {
  return (
    <EmptyState
      title={props.copy.title}
      description={props.copy.description}
      action={
        <Button variant="secondary" onClick={props.onClear}>
          {props.copy.clearLabel}
        </Button>
      }
    />
  );
}
