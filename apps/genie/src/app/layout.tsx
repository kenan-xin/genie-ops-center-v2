import type { ReactNode } from "react";

import "../styles/globals.css";

export const metadata = { title: "Genie Ops Center" };

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
