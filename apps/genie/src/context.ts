// Type-only imports are erased under verbatimModuleSyntax, so this file pulls no
// core runtime and therefore no database driver into any bundle that imports it.
import type { TenantContext } from "@genie/core";
import type { FrameOriginProvider } from "@genie/core/security";

/**
 * The application-owned seam of R-19. Importing this file initializes nothing.
 *
 * The value lives under a process-global key rather than in a module variable.
 * The framework compiles one source file into several bundles, and each bundle
 * gets its own module instance, so a module variable would produce one context
 * per bundle. The process global is shared by all of them. Measured evidence is
 * in the native composition spike.
 */
export type AppContext = {
  readonly tenant: TenantContext;
  readonly startedAt: number;
  /** Identifies this context in every log line, so acceptance can count contexts. */
  readonly contextId: string;
  /**
   * The viewer providers, keyed by module id, already wrapped with the counter
   * and the failure reporter. The proxy reads these instead of importing the
   * registry, which would pull the module declarations, their routers and the
   * database driver into the proxy bundle.
   */
  readonly viewerProviders: ReadonlyMap<
    string,
    FrameOriginProvider<{ tenant: TenantContext }>
  >;
  /** Records a provider failure through the redacting logger (yt2). */
  readonly reportProviderFailure: (
    cause: unknown,
    meta: { readonly moduleId: string; readonly requestId: string }
  ) => void;
  /**
   * One line per request, carrying the request id, the tenant id and the user
   * id (R-44), plus the context id.
   *
   * The context id is what makes the single-context acceptance check real. An
   * earlier draft read context ids from the log and only the bootstrap line
   * carried one, so twenty-four requests served by two contexts would still
   * have shown a single id and passed.
   *
   * This lives on the slot rather than in the proxy so the proxy needs no
   * logger import, which would drag the core root and the database driver into
   * its bundle.
   */
  readonly logRequest: (meta: {
    readonly requestId: string;
    readonly path: string;
  }) => void;
  /** Records a caught error with its request id, so AC-15 can match the two. */
  readonly logError: (
    cause: unknown,
    meta: { readonly requestId: string }
  ) => void;
};

type Slot = { context: AppContext; constructions: number };

const KEY = Symbol.for("genie.app.context");

function slot(): Slot | undefined {
  // SAFETY: the seam stores its one slot on the process global under this exact
  // symbol, and `publishContext` is the only writer of that key. A global read
  // therefore answers either the slot this module wrote or nothing.
  return (globalThis as Record<symbol, Slot | undefined>)[KEY];
}

/** Publishes the one context. Called by the bootstrap only, after migrations succeed. */
export function publishContext(context: AppContext): void {
  if (slot() !== undefined) {
    throw new Error(
      "The application context is already published. One process owns one context."
    );
  }

  // SAFETY: the read above answered undefined, so no slot is stored under this
  // key and this write cannot overwrite a context another path published.
  (globalThis as Record<symbol, Slot>)[KEY] = { context, constructions: 1 };
}

export function readContext(): AppContext | undefined {
  return slot()?.context;
}

/** How many contexts this process built. Acceptance asserts that this is one. */
export function constructionCount(): number {
  return slot()?.constructions ?? 0;
}

/**
 * The accessor every request-bound path uses. It throws rather than building a
 * context on demand, because a lazily built context would be a second pool.
 */
export function requireContext(): AppContext {
  const current = readContext();

  if (current === undefined) {
    throw new Error(
      "The application context is not ready. The bootstrap has not completed."
    );
  }

  return current;
}
