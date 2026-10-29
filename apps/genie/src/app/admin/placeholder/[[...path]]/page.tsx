import { ModuleRoutePage } from "../../../../module-page.tsx";

export const dynamic = "force-dynamic";

/** The placeholder's admin pages under `/admin/placeholder`, the module's own route folder. */
export default async function PlaceholderAdminPage(props: {
  readonly params: Promise<{ readonly path?: string[] }>;
}) {
  const { path = [] } = await props.params;

  return (
    <ModuleRoutePage
      moduleId="placeholder"
      surface="admin"
      base={["admin", "placeholder"]}
      path={path}
    />
  );
}
