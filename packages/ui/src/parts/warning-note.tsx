import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert } from "../components/alert.tsx";

export type WarningNoteProps = {
  readonly children: ReactNode;
  /** `md` is the block at the top of a card or a sheet, `sm` the inline note under a control. */
  readonly size?: "sm" | "md";
  /** `status` when the note explains a state, `alert` for a refusal; none for static prose. */
  readonly role?: "status" | "alert";
};

function Note(
  props: WarningNoteProps & {
    readonly variant: "warning" | "info";
    readonly icon: ReactNode;
  }
) {
  // `role` always passes, so a note without one drops the primitive's role="alert".
  return (
    <Alert
      variant={props.variant}
      size={props.size ?? "sm"}
      role={props.role}
      className="flex items-start"
    >
      {props.icon}
      <div className="min-w-0 flex-1">{props.children}</div>
    </Alert>
  );
}

/** tokens.md, "Warning note": the one amber block. */
export function WarningNote(props: WarningNoteProps) {
  return (
    <Note
      {...props}
      variant="warning"
      icon={<TriangleAlertIcon aria-hidden />}
    />
  );
}

/** tokens.md: the informational callout, the warning note's blue sibling. */
export function InfoNote(props: WarningNoteProps) {
  return <Note {...props} variant="info" icon={<InfoIcon aria-hidden />} />;
}
