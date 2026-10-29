import { ModuleRoutePage } from "../../../../module-page.tsx";

export const dynamic = "force-dynamic";

/** The placeholder's workspace pages under `/placeholder`, the module's own route folder. */
export default async function PlaceholderPage(props: {
  readonly params: Promise<{ readonly path?: string[] }>;
}) {
  const { path = [] } = await props.params;

  return (
    <ModuleRoutePage
      moduleId="placeholder"
      surface="workspace"
      base={["placeholder"]}
      path={path}
    />
  );
}
