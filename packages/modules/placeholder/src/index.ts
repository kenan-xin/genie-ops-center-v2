/**
 * The module-facing declaration. The application imports this and nothing else: the registry
 * mounts the router, the navigation and the pages from the one object below.
 *
 * A client or a story imports `@genie/module-placeholder/presentation` instead, which carries
 * the components without the router, the schema or their server dependencies.
 */

export { placeholderModule } from "./module.ts";

export { placeholderRouter, type PlaceholderRouter } from "./router.ts";

export { MIGRATIONS, MIGRATIONS_TABLE, placeholderRecord } from "./schema.ts";
