"use client";

import type { DeploymentDiagnosticsProps } from "@genie/ui";
import * as nextDynamic from "next/dynamic.js";

/**
 * `next/dynamic`, reached through the module object.
 *
 * The package is CommonJS and this repository does not set `esModuleInterop`,
 * so a default import resolves to the module namespace rather than the
 * function. The namespace's own `default` is that same namespace, and the
 * function sits one level further in. No type assertion is involved: this
 * expression is typed as
 * `<P>(options, options?) => ComponentType<P>` on its own.
 */
const dynamic = nextDynamic.default.default;

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
 * `ssr: false` is required rather than cosmetic. The devtools core publishes a
 * `browser` and a `node` build through its exports map, and the node build's
 * mount cannot run in a browser: it swallows its own failure, so the panel
 * renders an empty container and reports nothing. Keeping the module out of the
 * server graph is what makes the browser resolve the browser build.
 */
const Panels =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("./devtools-panels.tsx"), { ssr: false })
    : () => null;

export function DevtoolsMount(props: DeploymentDiagnosticsProps) {
  return <Panels {...props} />;
}
