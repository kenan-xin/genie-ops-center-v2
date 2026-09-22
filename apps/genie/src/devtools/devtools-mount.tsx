"use client";

import type { DeploymentDiagnosticsProps } from "@genie/ui";
import { Suspense, lazy } from "react";

/**
 * The development-only boundary.
 *
 * `process.env.NODE_ENV` is replaced by a literal at build time, so a
 * production build evaluates this ternary to the component that renders
 * nothing, and the `import()` on the other branch is unreachable and dropped.
 * That is what keeps every devtools package out of the image, and
 * `testing/devtools-exclusion.test.ts` is what proves it rather than assuming
 * it.
 *
 * `React.lazy` rather than `next/dynamic`, which the plan named. `next/dynamic`
 * is CommonJS, this repository does not set `esModuleInterop`, and reaching its
 * default would need the chained type assertion the lint rules ban. `lazy` is
 * what `next/dynamic` wraps, so the boundary and the split chunk are the same;
 * only the spelling differs. The `ssr: false` behaviour comes from this file
 * being a client component whose panels mount after hydration.
 */
const Panels =
  process.env.NODE_ENV === "development"
    ? lazy(() => import("./devtools-panels.tsx"))
    : () => null;

export function DevtoolsMount(props: DeploymentDiagnosticsProps) {
  return (
    <Suspense fallback={null}>
      <Panels {...props} />
    </Suspense>
  );
}
