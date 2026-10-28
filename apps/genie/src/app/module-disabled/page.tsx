import { forbidden } from "next/navigation.js";

export const dynamic = "force-dynamic";

/**
 * The document the proxy rewrites a switched-off module's route to (R-8, 6wz1.85). It answers 403
 * through `forbidden()`, and `forbidden.tsx` beside it renders the no-access state, so a refused
 * module page is never the raw refusal body. A direct visit gets the same refusal.
 */
export default function ModuleDisabledPage(): never {
  forbidden();
}
