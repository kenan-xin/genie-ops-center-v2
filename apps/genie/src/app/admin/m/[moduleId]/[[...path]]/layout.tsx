import type { ReactNode } from "react";

import { ModuleRouteGate } from "../../../../../module-page.tsx";

export default async function ModuleAdminLayout(props: {
  readonly params: Promise<{
    readonly moduleId: string;
    readonly path?: string[];
  }>;
  readonly children: ReactNode;
}) {
  const { moduleId, path = [] } = await props.params;

  return (
    <ModuleRouteGate
      moduleId={moduleId}
      surface="admin"
      base={["admin", "m", moduleId]}
      path={path}
    >
      {props.children}
    </ModuleRouteGate>
  );
}
