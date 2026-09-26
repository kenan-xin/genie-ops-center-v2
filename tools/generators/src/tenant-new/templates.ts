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
 * The deltas this customer applies to the shared realm template. The generator
 * writes the empty document: a realm difference is authored when the customer has
 * one, and Section 2 owns the template it applies to. No credential is written
 * here or anywhere else in the folder (DEC-35).
 */
export function realmOverrides(input: TenantRenderInput): string {
  return `${JSON.stringify(
    {
      realm: input.slug,
      displayName: input.productName,
      overrides: {},
    },
    undefined,
    2
  )}\n`;
}

/**
 * The customer's stack: the application, the worker from the same image, and Keycloak. Postgres
 * is supplied by the host and reached through `DATABASE_URL`, so this file starts no database
 * service (DEC-33). The application and Keycloak join the external `proxy` network under
 * `<slug>-app` and `<slug>-keycloak`, and the file publishes no host port, so several stacks
 * share one host and one reverse proxy (R-28).
 *
 * `IMAGE_TAG` selects the image for both the application and the worker; the image itself never
 * reads it (R-30). Every value that must stay out of the repository is a variable reference read
 * from the customer's own `.env`, so this file is committed and holds no secret.
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
    # The identity provider runs beside the stack and is reached at the
    # ${input.slug}-keycloak alias. The two bootstrap values create its temporary
    # administrator at first start; they belong to the Keycloak server and are
    # replaced after setup (runbooks/keycloak-realm.md).
    image: quay.io/keycloak/keycloak:26.4
    command: ["start-dev", "--http-port=8080", "--proxy-headers=xforwarded"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: \${KC_BOOTSTRAP_ADMIN_USERNAME:?set KC_BOOTSTRAP_ADMIN_USERNAME in .env}
      KC_BOOTSTRAP_ADMIN_PASSWORD: \${KC_BOOTSTRAP_ADMIN_PASSWORD:?set KC_BOOTSTRAP_ADMIN_PASSWORD in .env}
    networks:
      proxy:
        aliases:
          - ${input.slug}-keycloak
    restart: unless-stopped

networks:
  proxy:
    external: true
    name: proxy
`;
}

/**
 * The variables the image reads, rendered from the catalogue core emits
 * (`docs/architecture/environment-contract.md`). A secret or a variable with no default is left
 * blank for the operator to fill in; every other value is the schema's default. The build-only
 * `MODULE_INCLUDE` and the setup-only `KEYCLOAK_BOOTSTRAP_*` are not runtime values, so they are
 * not listed. The real `.env` is never committed.
 */
export function envExample(input: TenantRenderInput): string {
  const lines = readEnvironmentCatalogue()
    .filter(({ name }) => !name.startsWith("KEYCLOAK_BOOTSTRAP_"))
    .map(
      ({ name, secret, default: fallback }) =>
        `${name}=${secret || fallback === undefined ? "" : String(fallback)}`
    );

  lines.push("IMAGE_TAG=");

  return [
    `# ${input.slug}: copy to .env and fill in. Never commit the filled file.`,
    `# The image reads every value at run time; it carries none of them (DEC-33).`,
    `# A value below a name is that variable's default and may be overridden.`,
    "",
    ...lines,
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
