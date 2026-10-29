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
    surface: "workspace",
    base: ["placeholder"],
    path,
  };
}

export async function generateMetadata(props: Props) {
  return moduleRouteMetadata(await routeOf(props));
}

/** The placeholder's workspace pages under `/placeholder`, the module's own route folder. */
export default async function PlaceholderPage(props: Props) {
  return <ModuleRoutePage {...await routeOf(props)} />;
}
