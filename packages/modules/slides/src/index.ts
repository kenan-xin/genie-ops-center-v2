/**
 * The module-facing declaration. The application imports this and nothing else: the registry
 * mounts the router, the navigation and the pages from the one object below.
 *
 * A client or a story imports `@genie/module-slides/presentation` instead, which carries the
 * components without the router, the schema or their server dependencies.
 */

export { slidesModule } from "./module.ts";

export { slidesContract, type SlidesContract } from "./contract.ts";

export { SLIDES_PERMISSIONS } from "./permissions.ts";

export { slidesRouter, type SlidesRouter } from "./router.ts";

export { deck, MIGRATIONS, MIGRATIONS_TABLE } from "./schema.ts";
