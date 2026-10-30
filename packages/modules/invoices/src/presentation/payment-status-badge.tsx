import { Badge } from "@genie/ui";

import type { PaymentStatus } from "./views.ts";

export type PaymentStatusBadgeProps = {
  readonly status: PaymentStatus;
};

const LABEL: Record<PaymentStatus, string> = {
  "allocated": "Allocated",
  "part-allocated": "Part allocated",
  "unallocated": "Unallocated",
};

const VARIANT: Record<PaymentStatus, "success" | "warning" | "neutral"> = {
  "allocated": "success",
  "part-allocated": "warning",
  "unallocated": "neutral",
};

/** R-31's three payment states, in the pill tones of `tokens.md` (P9). */
export function PaymentStatusBadge(props: PaymentStatusBadgeProps) {
  const { status } = props;

  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
