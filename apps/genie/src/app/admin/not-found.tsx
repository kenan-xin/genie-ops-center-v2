import { NotFoundMain } from "../../page-access.tsx";

/** A missing page inside the admin portal, in its shell when signed in (6wz1.129). */
export default async function NotFound() {
  return <NotFoundMain home="/admin" />;
}
