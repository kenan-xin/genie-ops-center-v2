import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert } from "../components/alert.tsx";

export type WarningNoteProps = {
  readonly children: ReactNode;
  /** `md` is the block at the top of a card or a sheet, `sm` the inline note under a control. */
  readonly size?: "sm" | "md";
  /** `status` when the note explains a state; none for static prose. */
  readonly role?: "status";
};

/** tokens.md, "Warning note": the one amber block. */
export function WarningNote({ children, size = "sm", role }: WarningNoteProps) {
  // `role` always passes, so a note without one drops the primitive's role="alert".
  return (
    <Alert
      variant="warning"
      size={size}
      role={role}
      className="flex items-start"
    >
      <TriangleAlertIcon aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </Alert>
  );
}
