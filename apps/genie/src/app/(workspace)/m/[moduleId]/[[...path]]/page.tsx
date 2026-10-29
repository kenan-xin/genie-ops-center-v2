import { ModuleRoutePage } from "../../../../../module-page.tsx";

export const dynamic = "force-dynamic";

/**
 * Any compiled module's workspace pages under `/m/<id>`, so a module a generator just wrote reaches
 * the browser without an edit to this application. The namespace mirrors `/api/m/<id>/...`.
 */
export default async function ModuleWorkspacePage(props: {
  readonly params: Promise<{
    readonly moduleId: string;
    readonly path?: string[];
  }>;
}) {
  const { moduleId, path = [] } = await props.params;

  return (
    <ModuleRoutePage
      moduleId={moduleId}
      surface="workspace"
      base={["m", moduleId]}
      path={path}
    />
  );
}
