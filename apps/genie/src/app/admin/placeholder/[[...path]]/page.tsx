import {
  type ModuleRoute,
  moduleRouteMetadata,
  ModuleRoutePage,
} from "../../../../module-page.tsx";

export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly path?: string[] }> };

async function routeOf(props: Props): Promise<ModuleRoute> {
  const { path = [] } = await props.params;

  return {
    moduleId: "placeholder",
    surface: "admin",
    base: ["admin", "placeholder"],
    path,
  };
}

export async function generateMetadata(props: Props) {
  return moduleRouteMetadata(await routeOf(props));
}

/** The placeholder's admin pages under `/admin/placeholder`, the module's own route folder. */
export default async function PlaceholderAdminPage(props: Props) {
  return <ModuleRoutePage {...await routeOf(props)} />;
}
