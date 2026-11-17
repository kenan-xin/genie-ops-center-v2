import { NotFoundMain } from "../page-access.tsx";

/** Every unmatched address, outside any area, so the page frames itself (6wz1.129). */
export default async function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col p-4 md:p-8">
      <NotFoundMain home="/" />
    </div>
  );
}
