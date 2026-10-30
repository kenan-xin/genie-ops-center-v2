import { Badge } from "@genie/ui";

import type { InboxStatus } from "./views.ts";

export type DocumentStatusBadgeProps = {
  readonly status: InboxStatus | "duplicate";
};

/** R-37's status words, exactly. `duplicate` is the upload answer, not a stored status. */
const LABEL: Record<DocumentStatusBadgeProps["status"], string> = {
  "reading": "Reading",
  "could-not-read": "Could not read",
  "needs-input": "Needs your input",
  "linked-automatically": "Linked automatically",
  "confirm-split": "Confirm the split",
  "possible-duplicate": "Possible duplicate",
  "duplicate": "Duplicate (nothing added)",
  "no-match": "No matching invoice",
  "kept-as-reference": "Kept as a reference",
  "saved": "Saved",
};

const VARIANT: Record<
  DocumentStatusBadgeProps["status"],
  "success" | "warning" | "danger" | "neutral"
> = {
  "reading": "neutral",
  "could-not-read": "danger",
  "needs-input": "warning",
  "linked-automatically": "success",
  "confirm-split": "warning",
  "possible-duplicate": "warning",
  "duplicate": "neutral",
  "no-match": "warning",
  "kept-as-reference": "neutral",
  "saved": "success",
};

/** One inbox status in the pill tones of `tokens.md` (R-37). */
export function DocumentStatusBadge(props: DocumentStatusBadgeProps) {
  const { status } = props;

  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
