/**
 * The framework compiles this file for the edge runtime as well as the Node
 * runtime. The Node-only bootstrap, which imports the database driver, stays
 * behind the guard and behind a dynamic import so it never enters the edge
 * bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runBootstrap } = await import("./bootstrap.ts");

  await runBootstrap();
}

/**
 * The `genie-ops` command entry (D-10). It is reached only by the launcher on `PATH`, never by
 * the server, and the dynamic import keeps the database driver out of any runtime that is not
 * Node exactly as `register` does. Bundling it through this entry is what gives the command the
 * same traced migration SQL the application server reads.
 */
export async function runOps(argv: readonly string[]): Promise<number> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return 1;

  const { runGenieOpsEntry } = await import("./ops/entry.ts");

  return runGenieOpsEntry(argv);
}
