import { ModuleRoutePage } from "../../../../../module-page.tsx";

export const dynamic = "force-dynamic";

/** Any compiled module's admin pages under `/admin/m/<id>`, behind its own `<id>:admin` key. */
export default async function ModuleAdminPage(props: {
  readonly params: Promise<{
    readonly moduleId: string;
    readonly path?: string[];
  }>;
}) {
  const { moduleId, path = [] } = await props.params;

  return (
    <ModuleRoutePage
      moduleId={moduleId}
      surface="admin"
      base={["admin", "m", moduleId]}
      path={path}
    />
  );
}
