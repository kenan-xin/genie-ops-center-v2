import type { AnyTRPCRouter } from "@trpc/server";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ComponentType } from "react";
import type { ZodObject, ZodType } from "zod";

import type {
  CapabilityName,
  EventContract,
  EventEnvelope,
} from "../../../contracts/index.ts";
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
  /**
   * The module's migration history, read on demand, built by core's `migrationsFromJournal` from
   * the module's own drizzle-kit journal and one `new URL` per SQL file. A thunk, not an array,
   * because the read is deferred: an SSR compilation resolves the same SQL URL to a public asset
   * path `readFileSync` cannot open, so a page must never read at module scope. The `new URL`
   * declarations stay at the module's own scope, because that spelling is what the bundler traces
   * to copy the SQL into the image. Invoked once per history at bootstrap planning.
   */
  readonly migrations: () => readonly MigrationMeta[];
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
  /**
   * The permission `path` requires, checked against the record itself before core renders a link
   * (module contract, Record types; R-69). A resolver that returns a path without naming one
   * defaults to the owning module's `<id>:use`. A workspace record is use-gated; an admin route
   * names its own admin key.
   */
  readonly permission?: PermissionKey;
  readonly parents?: readonly Scope[];
};

export type RecordTypeDeclaration = {
  readonly type: string;
  readonly parentTypes?: readonly string[];
  /**
   * Reads one record through the caller's tenant context, never a connection of its own (DEC-34).
   * Core keeps only the returned parents whose type is in `parentTypes`.
   */
  resolve(
    ctx: { readonly tenant: TenantContext },
    id: string
  ): Promise<RecordDescriptor | undefined>;
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

/**
 * What every module procedure reads: the one tenant context and the request's own principal.
 * A module builds its router against this type, so no procedure can reach a connection of its
 * own and every check goes through `can()` (DEC-34, DEC-39).
 */
export type ModuleRequestContext = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
};

/** 9. Category assignment, optional. Runtime arrives in Section 3. */
export type CategoryContext = ModuleRequestContext;

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

/**
 * 12. Capabilities, declaration-site only. The name is a key of the
 * `CapabilityInterfaces` registry in `packages/core/contracts`, so a module
 * cannot provide a capability that does not exist. The implementation is the
 * provider registered under that name; a consumer gets it or nothing (R-58).
 * Section 0 registers none, so `capabilities` is the empty list until a real
 * module needs one and the same change adds it to the registry and to the
 * module contract document.
 */
export type CapabilityProvision = {
  readonly name: CapabilityName;
  readonly implementation: unknown;
};

/**
 * 15. Subscriptions: the events a module handles. A subscription with no option is fast: it runs
 * in process after the emitting transaction commits, at most once and best effort. `durable`
 * runs it as a pg-boss job enqueued inside the emitting transaction, so it commits or rolls back
 * with the data and is delivered at least once. `serializeBy` implies durable and runs the jobs
 * for one key one at a time in emission order (R-53 to R-57).
 *
 * A durable or serialized subscription carries a required `name`, unique within its module and
 * enforced by `validateModule`. Its pg-boss queue is named from the module id, the event
 * name/version, the mode and that name, never from the declaration index, so reordering same-mode
 * subscriptions between releases never reroutes an in-flight job. A fast subscription may omit it.
 */
export type Subscription<TPayload> = {
  readonly event: EventContract<string, TPayload>;
  readonly handler: (
    event: EventEnvelope<TPayload>,
    context: TenantContext
  ) => Promise<void>;
  readonly name?: string;
  readonly durable?: boolean;
  readonly serializeBy?: (payload: TPayload) => string;
};

/**
 * The subscription point as the `Module` type stores it. The payload appears in one covariant
 * place, the contract's schema, and two contravariant places, the handler's envelope and
 * `serializeBy`'s argument, so no single type parameter accepts every authored subscription.
 * `unknown` accepts any schema and `never` accepts any handler, which is what a module list
 * holds. Authored code uses `Subscription<TPayload>`.
 */
export type AnySubscription = {
  readonly event: EventContract<string, unknown>;
  readonly handler: (
    event: EventEnvelope<never>,
    context: TenantContext
  ) => Promise<void>;
  readonly name?: string;
  readonly durable?: boolean;
  readonly serializeBy?: (payload: never) => string;
};

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

/**
 * 18. Permission transformations, optional (R-33c). An explicit, versioned change to the module's
 * own keys inside stored roles: a semantics-preserving rename, or an audited security revocation.
 * Core's migrator run applies each one once, in one transaction under its lock, and records it
 * as an `audit_event` row. A module never writes core tables itself.
 */
export type PermissionChange =
  | {
      readonly kind: "rename";
      readonly from: PermissionKey;
      readonly to: PermissionKey;
    }
  | { readonly kind: "revoke"; readonly key: PermissionKey }
  /** A display rename of one of the owner's own system roles, keeping its id and assignments. */
  | {
      readonly kind: "rename-role";
      readonly from: string;
      readonly to: string;
    };

export type PermissionTransformation = {
  /** Stable within the module, never reused, for example `0001-rename-view`. */
  readonly id: string;
  /** The release that ships it, named in the audit row and the release note. */
  readonly release: string;
  readonly description: string;
  readonly change: PermissionChange;
};

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
  readonly subscriptions?: readonly AnySubscription[];
  readonly jobs: readonly JobDeclaration[];
  readonly inboundEndpoints: readonly InboundEndpoint[];
  readonly integrationKinds: readonly string[];
  readonly contentSecurityPolicy?: ModuleFrameOriginProvider;
  readonly permissionTransformations?: readonly PermissionTransformation[];
  readonly tests: ModuleTests;
};
