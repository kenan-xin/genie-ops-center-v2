import type { ReactNode } from "react";

import { ShellLayout } from "../../shell-frame.tsx";

/** The workspace shell, mounted once across the account page and the module routes (NAV-1). */
export default function WorkspaceLayout(props: {
  readonly children: ReactNode;
}) {
  return <ShellLayout chrome="workspace">{props.children}</ShellLayout>;
}
