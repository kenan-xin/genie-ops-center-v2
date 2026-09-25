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
export type SetupGate = {
  /**
   * Whether every known setup step is `done` (R-15). It reads `setup_step` on each call and latches
   * open the first time the answer is true; once open it never closes for the life of the process
   * (D-2). A read that fails before the gate ever opened throws, which the proxy answers with a
   * generic 503; a read that fails after it opened is swallowed.
   */
  readonly isSatisfied: () => Promise<boolean>;
};

export type AppContext = {
  readonly tenant: TenantContext;
  readonly startedAt: number;
  /** Identifies this context in every log line, so acceptance can count contexts. */
  readonly contextId: string;
  /**
   * The module that owns each declared navigation path, so the proxy can refuse a disabled
   * module's route before a page renders (R-8). It is a flat map rather than the registry,
   * because the proxy bundle must not reach the module declarations and the database driver.
   */
  readonly moduleRoutes: ReadonlyMap<string, string>;
  /** The process-global setup gate of D-2, read by the proxy on every request. */
  readonly setupGate: SetupGate;
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

type Slot = { context: AppContext };

/**
 * The name of the response header a route handler writes from the context it
 * read, so AC-26 can be observed per bundle rather than only in the proxy's log.
 *
 * The proxy deliberately does not set this header. A response header the proxy
 * wrote would prove only what the proxy bundle saw, which is exactly the
 * weakness the log-line reading had. Each handler sets it itself, so a second
 * context in that handler's bundle is visible as a different value.
 */
export const CONTEXT_HEADER = "x-genie-context-id";

const KEY = Symbol.for("genie.app.context");

function slot(): Slot | undefined {
  // SAFETY: the seam stores its one slot on the process global under this exact
  // symbol, so a global read answers either a slot stored under this key or
  // nothing. The symbol is process-global, so this module cannot promise it is
  // the only writer; `publishContext` below is this module's only writer.
  return (globalThis as Record<symbol, Slot | undefined>)[KEY];
}

/** Publishes the one context. Called by the bootstrap only, after migrations succeed. */
export function publishContext(context: AppContext): void {
  if (slot() !== undefined) {
    throw new Error(
      "The application context is already published. One process owns one context."
    );
  }

  // SAFETY: the read above answered undefined at this moment, so this module has
  // not published a slot under this key.
  (globalThis as Record<symbol, Slot>)[KEY] = { context };
}

export function readContext(): AppContext | undefined {
  return slot()?.context;
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
