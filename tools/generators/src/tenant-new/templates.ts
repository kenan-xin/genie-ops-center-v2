import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { TenantRenderInput } from "./render.ts";

/** One variable as core emitted it to `deploy/schemas/environment.catalogue.json` (R-30). */
type EnvironmentVariable = {
  readonly name: string;
  readonly required: boolean;
  readonly default?: string | number | boolean;
  readonly secret: boolean;
};

const CATALOGUE_PATH = resolve(
  import.meta.dirname,
  "../../../../deploy/schemas/environment.catalogue.json"
);

/**
 * The variables core emitted from its environment schema. Reading the emitted file, rather than
 * importing the schema, keeps this build-time tool on the same bytes the environment contract is
 * checked against; `nx run core:schemas` is what writes it.
 */
function readEnvironmentCatalogue(): readonly EnvironmentVariable[] {
  // SAFETY: core emits this file as `{ variables: [...] }`, and core's
  // catalogue-emission test compares the committed bytes against the environment schema.
  const catalogue = JSON.parse(readFileSync(CATALOGUE_PATH, "utf8")) as {
    readonly variables: readonly EnvironmentVariable[];
  };

  return catalogue.variables;
}

/**
 * Every name the compose file refuses to start without (`${NAME:?message}`).
 * A `$${NAME:?message}` is the escaped form a container's shell evaluates at run
 * time, not a compose interpolation, so it is not one of these.
 */
function composeRequiredNames(compose: string): readonly string[] {
  return [
    ...new Set(
      [...compose.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*):\?[^}]*\}/g)].map(
        ([, name]) => name ?? ""
      )
    ),
  ];
}

/**
 * Every name the compose file reads with a fallback (`${NAME:-default}`), with
 * that fallback. The escaped `$${NAME:-default}` form is skipped for the same
 * reason as above.
 */
function composeOptionalNames(compose: string): ReadonlyMap<string, string> {
  return new Map(
    [...compose.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*):-([^}]*)\}/g)].map(
      ([, name, fallback]) => [name ?? "", fallback ?? ""]
    )
  );
}

/** True for a Keycloak setting, which `.env.example` groups under the bundled-keycloak note. */
const isBundledKeycloakSetting = (name: string) => name.startsWith("KC_");

/**
 * The deltas this customer applies to the shared realm template, merged by the `realm` step of
 * `genie-ops setup` (Spec 2 D2-3). The generator writes the empty document: a realm difference is
 * authored when the customer has one, and only the keys of the realm step's allow-list may appear
 * here. The realm name comes from `KEYCLOAK_REALM` (derived from the slug) and the display name
 * from `branding.seed.json`, so neither is a field here, and no credential is written in this
 * folder (DEC-35).
 */
export function realmOverrides(): string {
  return `${JSON.stringify({}, undefined, 2)}\n`;
}

/**
 * The customer's stack: the application, the worker from the same image, and Keycloak behind the
 * `bundled-keycloak` Compose profile. Postgres is supplied by the host and reached through
 * `DATABASE_URL`, so this file starts no database service (DEC-33). The application and Keycloak
 * join the external `proxy` network under `<slug>-app` and `<slug>-keycloak`, and the file
 * publishes no host port, so several stacks share one host and one reverse proxy (R-28).
 *
 * Whether Keycloak runs is a host fact in `.env`: `COMPOSE_PROFILES` enables the service, and the
 * file passes it to every Genie Ops Center service as `STACK_PROFILES` for the start-up guard
 * (R-54b). `IMAGE_TAG` selects the image for both the application and the worker; the image itself
 * never reads it (R-30). Every value that must stay out of the repository is a variable reference
 * read from the customer's own `.env`, so this file is committed and holds no secret.
 */
export function stackCompose(input: TenantRenderInput): string {
  return `# The deployment stack for ${input.slug}. Generated from the module include
# list in tenant.yaml; committed, and free of every secret (DEC-33, DEC-35).
# The host supplies Postgres through DATABASE_URL, so no database service is
# started here. No port is published: the reverse proxy reaches the aliases
# below on the external proxy network (R-28).
services:
  app:
    image: \${IMAGE_TAG:?set IMAGE_TAG in .env}
    environment:
      DATABASE_URL: \${DATABASE_URL:?set DATABASE_URL in .env}
      PUBLIC_URL: \${PUBLIC_URL:?set PUBLIC_URL in .env}
      PORT: "3000"
      # The Section 2 application profile requires the authentication values. KEYCLOAK_URL must be
      # the one address that both the browser and this container use for Keycloak, and it is the
      # address setup recorded (Specification 02 R-4, R-54c).
      BETTER_AUTH_SECRET: \${BETTER_AUTH_SECRET:?set BETTER_AUTH_SECRET in .env}
      KEYCLOAK_URL: \${KEYCLOAK_URL:?set KEYCLOAK_URL in .env}
      KEYCLOAK_REALM: \${KEYCLOAK_REALM:?set KEYCLOAK_REALM in .env}
      KEYCLOAK_CLIENT_ID: \${KEYCLOAK_CLIENT_ID:?set KEYCLOAK_CLIENT_ID in .env}
      KEYCLOAK_CLIENT_SECRET: \${KEYCLOAK_CLIENT_SECRET:?set KEYCLOAK_CLIENT_SECRET in .env}
      # The Compose profiles this stack was started with. The start-up guard reads it
      # to refuse an impossible realm-mode combination (Specification 02 R-54c).
      STACK_PROFILES: \${COMPOSE_PROFILES:-}
    networks:
      proxy:
        aliases:
          - ${input.slug}-app
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\\""]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s

  worker:
    image: \${IMAGE_TAG:?set IMAGE_TAG in .env}
    command: ["worker"]
    environment:
      DATABASE_URL: \${DATABASE_URL:?set DATABASE_URL in .env}
      PUBLIC_URL: \${PUBLIC_URL:?set PUBLIC_URL in .env}
      WORKER_HEARTBEAT_PATH: /tmp/genie-worker-heartbeat
      # The Compose profiles this stack was started with, as passed to the application.
      STACK_PROFILES: \${COMPOSE_PROFILES:-}
    networks:
      proxy:
    restart: unless-stopped
    # The worker serves no HTTP. Its core heartbeat job rewrites the file every minute
    # after a database round trip (D-10), so the check fails once the file is stale.
    healthcheck:
      # The test refuses a file older than 180 s (three missed minutes). start_period covers the migrator lock wait, LOCK_TIMEOUT_MS (120 s by default),
      # plus one heartbeat interval.
      test: ["CMD-SHELL", "test $$(( $$(date +%s) - $$(stat -c %Y \\"$$WORKER_HEARTBEAT_PATH\\") )) -lt 180"]
      interval: 30s
      timeout: 5s
      retries: 1
      start_period: 240s

  keycloak:
    # Production mode. The reverse proxy terminates HTTPS and reaches this
    # service over plain HTTP on 8080 at the ${input.slug}-keycloak alias, so
    # Keycloak trusts the proxy's X-Forwarded headers and takes its public
    # address from KEYCLOAK_URL (runbooks/reverse-proxy.md). Its database lives
    # on the host-supplied Postgres beside the application database. The server
    # administrator is created once with "docker compose run --rm keycloak
    # bootstrap-admin user" and is never written to .env (runbooks/deployment.md).
    #
    # This service starts only while COMPOSE_PROFILES holds bundled-keycloak,
    # which .env sets by default. A customer who runs their own Keycloak removes
    # the profile and points KEYCLOAK_URL at that server (Specification 02 R-54b).
    # Enable profiles through COMPOSE_PROFILES only, never with --profile, and
    # never start this service by name, because the start-up guard reads only
    # STACK_PROFILES and cannot see either.
    profiles: ["bundled-keycloak"]
    image: quay.io/keycloak/keycloak:26.7.4
    # The refusal checks name the missing connection value, so a stack with the
    # profile on fails with a cause instead of restart-looping on an empty
    # variable; a blank KC_PROXY_TRUSTED_ADDRESSES is unset because Keycloak
    # rejects the empty string for that one.
    entrypoint: ["/bin/bash", "-c", ": \\"$\${KC_DB_URL_HOST:?set KC_DB_URL_HOST in .env}\\"; : \\"$\${KC_DB_USERNAME:?set KC_DB_USERNAME in .env}\\"; : \\"$\${KC_DB_PASSWORD:?set KC_DB_PASSWORD in .env}\\"; : \\"$\${KC_HOSTNAME:?set KEYCLOAK_URL in .env}\\"; [ -n \\"$\${KC_PROXY_TRUSTED_ADDRESSES:-}\\" ] || unset KC_PROXY_TRUSTED_ADDRESSES; [ -n \\"$\${KC_BOOTSTRAP_ADMIN_USERNAME:-}\\" ] || unset KC_BOOTSTRAP_ADMIN_USERNAME; [ -n \\"$\${KC_BOOTSTRAP_ADMIN_PASSWORD:-}\\" ] || unset KC_BOOTSTRAP_ADMIN_PASSWORD; exec /opt/keycloak/bin/kc.sh \\"$$@\\"", "kc.sh"]
    command: ["start", "--http-enabled=true", "--http-port=8080"]
    # Every KC_ value is defaulted rather than required, because compose
    # interpolates this service even when the profile is off. The entrypoint
    # refuses a blank connection value while the profile is on, naming the
    # variable, so a stack without the profile starts without them and a stack
    # with it fails with a cause (Specification 02 R-54b).
    environment:
      KC_DB: \${KC_DB:-postgres}
      KC_DB_URL_HOST: \${KC_DB_URL_HOST:-}
      KC_DB_URL_PORT: \${KC_DB_URL_PORT:-5432}
      KC_DB_URL_DATABASE: \${KC_DB_URL_DATABASE:-keycloak}
      KC_DB_USERNAME: \${KC_DB_USERNAME:-}
      KC_DB_PASSWORD: \${KC_DB_PASSWORD:-}
      KC_PROXY_HEADERS: \${KC_PROXY_HEADERS:-xforwarded}
      # The reverse proxy's address on the proxy network. Blank trusts forwarded
      # headers from every peer on that network (runbooks/reverse-proxy.md).
      KC_PROXY_TRUSTED_ADDRESSES: \${KC_PROXY_TRUSTED_ADDRESSES:-}
      KC_HOSTNAME: \${KEYCLOAK_URL:-}
      # The temporary master-realm administrator the setup realm step signs in
      # with, blank by default. The operator creates the administrator with
      # "bootstrap-admin user" and these stay blank (runbooks/keycloak-realm.md);
      # the smoke test sets them in its own transient .env.
      KC_BOOTSTRAP_ADMIN_USERNAME: \${KC_BOOTSTRAP_ADMIN_USERNAME:-}
      KC_BOOTSTRAP_ADMIN_PASSWORD: \${KC_BOOTSTRAP_ADMIN_PASSWORD:-}
      # Opens /health/ready on the management port 9000, which is never published.
      KC_HEALTH_ENABLED: "true"
    networks:
      proxy:
        aliases:
          - ${input.slug}-keycloak
    restart: unless-stopped
    # The image has no curl, so the check is Keycloak's documented bash /dev/tcp
    # request (keycloak.org/observability/health). No service depends on it: the
    # application reaches Keycloak only at sign-in and setup, and a customer who
    # runs their own Keycloak removes the profile instead of listing this
    # service (Specification 02 R-54b).
    healthcheck:
      test: ["CMD", "bash", "-c", "{ printf 'HEAD /health/ready HTTP/1.0\\\\r\\\\n\\\\r\\\\n' >&0; grep 'HTTP/1.0 200'; } 0<>/dev/tcp/localhost/9000"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 120s

networks:
  proxy:
    external: true
    name: proxy
`;
}

/**
 * The variables the stack needs, rendered from two sources so they cannot drift: the catalogue
 * core emits for the image's variables (`docs/architecture/environment-contract.md`) and every
 * name the compose template reads, required (`${NAME:?}`) or defaulted (`${NAME:-}`). A secret or
 * a variable with no default is left blank for the operator to fill in; every other value is the
 * fallback the compose file carries. The build-only `MODULE_INCLUDE` and the setup-only
 * `KEYCLOAK_BOOTSTRAP_*` are not runtime values, so they are not listed. The real `.env` is never
 * committed.
 *
 * `COMPOSE_PROFILES` is the one value the example overrides: its fallback keeps the bundled
 * Keycloak on, which is what an operator runs unless the realm lives on another server (R-54b).
 * The `KC_*` settings are grouped under one note, because they are read only while that profile
 * is enabled.
 */
export function envExample(input: TenantRenderInput): string {
  const catalogue = readEnvironmentCatalogue();

  const byName = new Map(
    catalogue.map((variable) => [variable.name, variable])
  );

  const names = new Set<string>();

  for (const { name } of catalogue) {
    if (!name.startsWith("KEYCLOAK_BOOTSTRAP_")) names.add(name);
  }

  const compose = stackCompose(input);

  for (const name of composeRequiredNames(compose)) names.add(name);

  const optional = composeOptionalNames(compose);

  for (const name of optional.keys()) names.add(name);

  const line = (name: string): string => {
    const variable = byName.get(name);

    if (variable !== undefined) {
      const blank = variable.secret || variable.default === undefined;

      return `${name}=${blank ? "" : String(variable.default)}`;
    }

    // Keep the bundled Keycloak on by default; the compose fallback is empty.
    if (name === "COMPOSE_PROFILES") return `${name}=bundled-keycloak`;

    return `${name}=${optional.get(name) ?? ""}`;
  };

  const settings = [...names]
    .toSorted()
    .filter(
      (name) => name !== "COMPOSE_PROFILES" && !isBundledKeycloakSetting(name)
    );

  const bundledKeycloakSettings = [...names]
    .toSorted()
    .filter(isBundledKeycloakSetting);

  return [
    `# ${input.slug}: copy to .env and fill in. Never commit the filled file.`,
    `# Every value is read at run time; the image carries none of them (DEC-33).`,
    `# A value after a name is that variable's default and may be overridden.`,
    "",
    "# COMPOSE_PROFILES selects the Compose profiles to start. Keep bundled-keycloak",
    "# to run this stack's own Keycloak. Remove it, and point KEYCLOAK_URL at the",
    "# server that holds the realm, when the realm lives elsewhere (Specification 02 R-54b).",
    "# Enable profiles here only, never with --profile on a command line.",
    line("COMPOSE_PROFILES"),
    "",
    ...settings.map(line),
    "",
    "# The KC_ settings below are read only while COMPOSE_PROFILES holds",
    "# bundled-keycloak. Leave them blank on a stack that points at another",
    "# Keycloak server; with the profile on, the keycloak entrypoint refuses a",
    "# blank connection value with a message naming it.",
    ...bundledKeycloakSettings.map(line),
    "",
  ].join("\n");
}

/**
 * Helm values, used only when this customer runs Kubernetes. The same rule as the
 * compose file: the image and the replica count are configuration, and every
 * deployment value arrives from a secret the cluster owns, named here and never
 * defined here.
 */
export function helmValues(input: TenantRenderInput): string {
  return `# Helm values for ${input.slug}. Used only when this customer runs
# Kubernetes; the compose file serves every other deployment.
nameOverride: ${JSON.stringify(input.slug)}
replicaCount: 1

image:
  repository: ""
  tag: ""
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 3000

ingress:
  enabled: false
  host: ""

# The name of the cluster secret holding DATABASE_URL and the other run-time
# values. This file names it and never carries its contents.
envFromSecretName: ""

resources: {}
`;
}
