import type {
  Module,
  ModulePage,
  PageParams,
} from "../../lib/module-contract/module.ts";

/** What matching and the check read of a module, so a unit test builds no whole module. */
export type PageModule = Pick<Module, "identity" | "navigation" | "pages">;

export type ModulePageMatch = {
  readonly module: PageModule;
  readonly surface: "workspace" | "admin";
  readonly page: ModulePage;
  readonly params: PageParams;
};

const SURFACES = ["workspace", "admin"] as const;

/**
 * The parameters of one pattern over the segments, or `undefined` when it does not match. Equal
 * lengths only, so a page never matches a deeper path; a parameter takes its whole segment, so an
 * encoded slash in a value stays one value.
 */
function paramsOf(
  pattern: readonly string[],
  segments: readonly string[]
): Record<string, string> | undefined {
  if (pattern.length !== segments.length) return undefined;

  const params: Record<string, string> = {};

  for (const [index, part] of pattern.entries()) {
    const segment = segments[index] ?? "";

    // A parameter never takes an empty segment, so `/reports/` is `/reports`, not `/reports/:id`.
    if (part.startsWith(":") && segment !== "") params[part.slice(1)] = segment;
    else if (part !== segment) return undefined;
  }

  return params;
}

function literalCount(pattern: readonly string[]): number {
  return pattern.filter((part) => !part.startsWith(":")).length;
}

/** The one page of `module` on `surface` whose path matches these decoded segments. */
export function matchModulePage(
  module: PageModule,
  surface: "workspace" | "admin",
  segments: readonly string[]
): ModulePageMatch | undefined {
  let best: (ModulePageMatch & { readonly literals: number }) | undefined;

  for (const page of module.pages[surface]) {
    // The runtime half of the validator's key rule: a page under another module's key is no page
    // (DEC-23, DEC-50), so a declaration can never mount itself on a grant it did not issue.
    if (!page.permission.startsWith(`${module.identity.id}:`)) continue;

    const pattern = page.path.split("/").slice(1);
    const params = paramsOf(pattern, segments);

    if (params === undefined) continue;

    const literals = literalCount(pattern);

    if (best === undefined || literals > best.literals) {
      best = { module, surface, page, params, literals };
    }
  }

  if (best === undefined) return undefined;

  const { literals: _literals, ...match } = best;

  return match;
}

/** The module whose declared page matches a raw request path, for the proxy (R-8). */
export function moduleRouteOwner(
  modules: readonly PageModule[],
  pathname: string
): string | undefined {
  const raw = pathname.replace(/\/$/, "").split("/").slice(1);

  // Decoded per segment, as Next decodes a catch-all before the route sees it, so `%61rchive` is
  // `archive` and `a%2Fb` stays one value. A segment Next cannot decode answers 400 there and
  // never renders a page, so it has no owner here, and the proxy never throws on it.
  let segments: string[];

  try {
    segments = raw.map((segment) => decodeURIComponent(segment));
  } catch {
    return undefined;
  }

  return modules.find((module) =>
    SURFACES.some(
      (surface) => matchModulePage(module, surface, segments) !== undefined
    )
  )?.identity.id;
}
