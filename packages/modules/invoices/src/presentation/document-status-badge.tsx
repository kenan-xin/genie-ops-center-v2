import { Badge } from "@genie/ui";
import { Loader2Icon } from "lucide-react";

import type { InboxStatus } from "./views.ts";

export type DocumentStatusBadgeProps = {
  readonly status: InboxStatus | "duplicate";
  /** False draws the pill alone, where the reason sits on its own line (the phone card, P07-75). */
  readonly withReason?: boolean;
};

type Status = "Processing" | "To review" | "Processed" | "Failed";

/**
 * The four statuses of the glossary (G22), each reading state's reason under it (P05-14).
 * `duplicate` is the upload answer, not a stored status.
 */
const WORDS: Record<
  DocumentStatusBadgeProps["status"],
  readonly [Status, string | null]
> = {
  "reading": ["Processing", null],
  "could-not-read": ["Failed", "Could not read"],
  "needs-input": ["To review", null],
  "confirm-split": ["To review", "Confirm the split"],
  "possible-duplicate": ["To review", "Possible duplicate"],
  "no-match": ["To review", "No matching invoice"],
  "linked-automatically": ["Processed", "Allocated automatically"],
  "saved": ["Processed", null],
  "kept-as-reference": ["Processed", "Kept as a reference"],
  "duplicate": ["Processed", "Duplicate, nothing added"],
};

const VARIANT = {
  "Processing": "neutral",
  "Failed": "danger",
  "To review": "warning",
  "Processed": "success",
} as const satisfies Record<Status, string>;

/** The muted reason under a status pill, or null. */
export const documentStatusReason = (
  status: DocumentStatusBadgeProps["status"]
): string | null => WORDS[status][1];

/** One inbox status in the pill tones of `tokens.md`, with its reason as a muted line (R-37). */
export function DocumentStatusBadge(props: DocumentStatusBadgeProps) {
  const { status } = props;
  const [word, reason] = WORDS[status];

  // A turning icon, so a Processing row does not look stuck (design review 3.3). `Spinner` would
  // add a second status word for a screen reader; the pill's word is the status.
  const pill = (
    <Badge variant={VARIANT[word]}>
      {status === "reading" ? (
        <Loader2Icon
          aria-hidden="true"
          strokeWidth={1.75}
          className="motion-safe:animate-spin"
        />
      ) : null}
      {word}
    </Badge>
  );

  return reason === null || props.withReason === false ? (
    pill
  ) : (
    <span className="inline-flex flex-col items-start gap-0.5">
      {pill}
      <span className="text-xs text-muted-foreground">{reason}</span>
    </span>
  );
}
