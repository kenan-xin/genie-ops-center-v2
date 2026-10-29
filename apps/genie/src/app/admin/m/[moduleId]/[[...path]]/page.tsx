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

  return { moduleId, surface: "admin", base: ["admin", "m", moduleId], path };
}

export async function generateMetadata(props: Props) {
  return moduleRouteMetadata(await routeOf(props));
}

/**
 * Any compiled module's admin pages under `/admin/m/<id>`, behind the permission each page
 * declares.
 */
export default async function ModuleAdminPage(props: Props) {
  return <ModuleRoutePage {...await routeOf(props)} />;
}
