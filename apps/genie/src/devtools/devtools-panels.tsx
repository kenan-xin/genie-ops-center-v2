"use client";

import {
  DeploymentDiagnostics,
  type DeploymentDiagnosticsProps,
} from "@genie/ui";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { FormDevtoolsPanel } from "@tanstack/react-form-devtools";
import { PacerDevtoolsPanel } from "@tanstack/react-pacer-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";

/**
 * The one devtools surface, with its four panels.
 *
 * This module is reached only through the dynamic import in `devtools-mount`,
 * which a production build never takes, so nothing here is in the image that
 * ships. The Form and Pacer panels are empty until application code uses those
 * libraries; an empty panel is the truthful state, not a defect.
 */
export default function DevtoolsPanels(props: DeploymentDiagnosticsProps) {
  return (
    <TanStackDevtools
      config={{ position: "bottom-right" }}
      plugins={[
        {
          name: "Genie Ops Center",
          render: <DeploymentDiagnostics {...props} />,
        },
        { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
        { name: "TanStack Form", render: <FormDevtoolsPanel /> },
        { name: "TanStack Pacer", render: <PacerDevtoolsPanel /> },
      ]}
    />
  );
}
