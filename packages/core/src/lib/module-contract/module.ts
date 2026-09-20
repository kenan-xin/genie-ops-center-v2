import type { AnyTRPCRouter } from "@trpc/server";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ComponentType } from "react";
import type { ZodObject, ZodType } from "zod";

import type { RequestPrincipal } from "../../services/authorization/index.ts";
import type { FrameOriginProvider } from "../content-security-policy/index.ts";
import type { TenantContext } from "../tenant-context/index.ts";
import type { PermissionKey, Scope } from "./keys.ts";

/** 1. Identity. */
export type ModuleIdentity = {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
};

/** 2. Schema: one Drizzle schema and its own migration history. */
export type ModuleSchema = {
  readonly tables: Readonly<Record<string, PgTable>>;
  readonly migrationsFolder: string;
  readonly migrationsTable: string;
};

/** 4. Permission keys. */
export type PermissionDeclaration = {
  readonly key: PermissionKey;
  readonly label: string;
};

/** 5. Record types. `path` is optional; core renders a link only when it is present. */
export type RecordDescriptor = {
  readonly label: string;
  readonly path?: string;
  readonly parents?: readonly Scope[];
};

export type RecordTypeDeclaration = {
  readonly type: string;
  readonly parentTypes?: readonly string[];
  resolve(id: string): Promise<RecordDescriptor | undefined>;
};

/** 6. Default roles. Declared in Section 0, seeded in Section 2. */
export type DefaultRole = {
  readonly name: string;
  readonly permissions: readonly PermissionKey[];
};

/** 7. Navigation. At most one workspace entry carries the landing flag (DEC-49). */
export type NavigationEntry = {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly surface: "workspace" | "admin";
  readonly requiredPermission: PermissionKey;
  readonly categoryId?: string;
  readonly landing?: boolean;
};

export type ModuleNavigation = {
  /** Ordered, at most six entries (module contract, Navigation row). */
  readonly pinned: readonly NavigationEntry[];
  readonly entries: readonly NavigationEntry[];
};

/** 8. Pages. */
export type ModulePages = {
  readonly workspace: Readonly<Record<string, ComponentType>>;
  readonly admin: Readonly<Record<string, ComponentType>>;
};

/** 9. Category assignment, optional. Runtime arrives in Section 3. */
export type CategoryContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

export type AssignableRecord = {
  readonly id: string;
  readonly label: string;
  readonly categoryId?: string;
};

export type CategoryAssignment = {
  listAssignable(ctx: CategoryContext): Promise<readonly AssignableRecord[]>;
  assign(
    ctx: CategoryContext,
    recordId: string,
    categoryId: string
  ): Promise<void>;
  clear(ctx: CategoryContext, recordId: string): Promise<void>;
};

/** 10. Configuration schema, optional. Five field kinds only (DEC-28). */
export type ConfigFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "stringList";

export type ConfigFieldMetadata = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
};

export type ConfigSectionMetadata = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  /**
   * An AND restriction on top of `core:settings:manage`, never a substitute (module contract,
   * Settings discovery and authorization).
   */
  readonly additionalPermission?: PermissionKey;
};

export type ModuleConfiguration = {
  readonly schema: ZodObject;
  readonly section: ConfigSectionMetadata;
  readonly fields: Readonly<Record<string, ConfigFieldMetadata>>;
};

/** The core permission every central Settings read and write requires. */
export const SETTINGS_BASE_PERMISSION = "core:settings:manage";

/** 11. Events, declaration-site only in Section 0. */
export type EventDeclaration = {
  readonly name: string;
  readonly version: number;
  readonly payload: ZodType;
};

/** 12. Capabilities, declaration-site only. Named against packages/core/contracts. */
export type CapabilityProvision = { readonly name: string };

/** 13. Jobs, declaration-site only. Every handler receives the tenant context (DEC-34). */
export type JobContext = { readonly tenant: TenantContext };

export type JobDeclaration<TData = never> = {
  readonly name: string;
  readonly schedule?: string;
  handler(ctx: JobContext, data: TData): Promise<void>;
};

/** 14. Inbound endpoints under /api/m/<id>/..., declaration-site only. */
export type InboundEndpoint = {
  readonly path: string;
  handle(request: Request): Promise<Response>;
};

/** 16. Content security policy, optional. Server-only, origins only. */
export type ModuleFrameOriginProvider = FrameOriginProvider<{
  readonly tenant: TenantContext;
}>;

/** 17. Tests: the shared presets a module must use. */
export type ModuleTests = { readonly presets: readonly string[] };

/** Every point of the module contract. A module uses these and nothing else. */
export type Module = {
  readonly identity: ModuleIdentity;
  readonly schema: ModuleSchema;
  readonly router: AnyTRPCRouter;
  readonly permissions: readonly PermissionDeclaration[];
  readonly recordTypes: readonly RecordTypeDeclaration[];
  readonly defaultRoles: readonly DefaultRole[];
  readonly navigation: ModuleNavigation;
  readonly pages: ModulePages;
  readonly categoryAssignment?: CategoryAssignment;
  readonly configuration?: ModuleConfiguration;
  readonly events: readonly EventDeclaration[];
  readonly capabilities: readonly CapabilityProvision[];
  readonly jobs: readonly JobDeclaration[];
  readonly inboundEndpoints: readonly InboundEndpoint[];
  readonly integrationKinds: readonly string[];
  readonly contentSecurityPolicy?: ModuleFrameOriginProvider;
  readonly tests: ModuleTests;
};
