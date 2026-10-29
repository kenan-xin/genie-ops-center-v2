import type { ReactNode } from "react";

import { ModuleRouteGate } from "../../../../module-page.tsx";

export default async function PlaceholderAdminLayout(props: {
  readonly params: Promise<{ readonly path?: string[] }>;
  readonly children: ReactNode;
}) {
  const { path = [] } = await props.params;

  return (
    <ModuleRouteGate
      moduleId="placeholder"
      surface="admin"
      base={["admin", "placeholder"]}
      path={path}
    >
      {props.children}
    </ModuleRouteGate>
  );
}
