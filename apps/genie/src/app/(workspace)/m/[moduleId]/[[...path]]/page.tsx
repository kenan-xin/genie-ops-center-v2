import {
  type ModuleRoute,
  moduleRouteMetadata,
  ModuleRoutePage,
} from "../../../../../module-page.tsx";

export const dynamic = "force-dynamic";

type Props = {
  readonly params: Promise<{
    readonly moduleId: string;
    readonly path?: string[];
  }>;
};

async function routeOf(props: Props): Promise<ModuleRoute> {
  const { moduleId, path = [] } = await props.params;

  return { moduleId, surface: "workspace", base: ["m", moduleId], path };
}

export async function generateMetadata(props: Props) {
  return moduleRouteMetadata(await routeOf(props));
}

/**
 * Any compiled module's workspace pages under `/m/<id>`, so a module a generator just wrote reaches
 * the browser without an edit to this application. The namespace mirrors `/api/m/<id>/...`.
 */
export default async function ModuleWorkspacePage(props: Props) {
  return <ModuleRoutePage {...await routeOf(props)} />;
}
