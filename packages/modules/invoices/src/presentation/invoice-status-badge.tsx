import { Badge } from "@genie/ui";

import type { InvoiceStatus } from "./views.ts";

export type InvoiceStatusBadgeProps = {
  readonly status: InvoiceStatus;
};

/** The three invoice states of Spec 7, in the pill tones of `tokens.md` (P9). No due date is Open (czjw.191). */
export function InvoiceStatusBadge(props: InvoiceStatusBadgeProps) {
  const { status } = props;

  if (status.kind === "overdue") {
    const days =
      status.daysOverdue === 1 ? "1 day" : `${status.daysOverdue} days`;

    return <Badge variant="danger">{`Overdue · ${days}`}</Badge>;
  }

  if (status.kind === "paid") return <Badge variant="success">Paid</Badge>;

  return <Badge variant="neutral">Open</Badge>;
}
