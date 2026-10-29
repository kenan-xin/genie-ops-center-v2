import type { ReactNode } from "react";

import { ShellLayout } from "../../shell-frame.tsx";

/**
 * The admin shell, mounted once across the admin pages (NAV-1). The break-glass door lives in
 * `(auth)`, outside it, so the account page reached from the door gets its shell.
 */
export default function AdminLayout(props: { readonly children: ReactNode }) {
  return <ShellLayout chrome="admin">{props.children}</ShellLayout>;
}
