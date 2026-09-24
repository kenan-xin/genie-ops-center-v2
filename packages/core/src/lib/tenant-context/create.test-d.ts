import { silentLogger } from "../../services/logging/index.ts";
import { createTenantContext } from "./index.ts";

const source = {
  DATABASE_URL: "postgres://genie:secret@db.invalid:5432/genie",
  PUBLIC_URL: "https://genie.example.com",
};

// The entitlement reader and migrator share one caller-supplied compiled image list.
// @ts-expect-error compiledModuleIds is required
createTenantContext(source, silentLogger());

createTenantContext(source, silentLogger(), []);
