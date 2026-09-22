/**
 * The `@genie/module:new <capability>` rendering contract (R-30).
 *
 * `generator.ts` beside this file is the Nx entry point that writes these bytes,
 * registered in `generators.json` as `nx g @genie/generators:module-new`.
 */

export {
  renderModule,
  type ModuleNames,
  type ModuleRenderInput,
} from "./render.ts";
