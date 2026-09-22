/**
 * The `@genie/module:new <capability>` rendering contract (R-30).
 *
 * The Nx generator entry point that writes these bytes and registers the package in
 * the workspace is not here yet; it arrives with workspace registration.
 */

export {
  renderModule,
  type ModuleNames,
  type ModuleRenderInput,
} from "./render.ts";
