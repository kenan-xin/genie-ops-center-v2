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
