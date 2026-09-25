import type { TenantRenderInput } from "./render.ts";

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
 * The customer's stack: the application, the worker from the same image, and the
 * database. The identity provider arrives with Section 1, and this file gains its
 * service then.
 *
 * Every value that must stay out of the repository is a variable reference read
 * from the customer's own `.env`, so this file is committed and holds no secret.
 */
export function stackCompose(input: TenantRenderInput): string {
  return `# The deployment stack for ${input.slug}. Generated from the module include
# list in tenant.yaml; committed, and free of every secret (DEC-33, DEC-35).
# The identity provider service arrives with Section 1.
services:
  database:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: \${POSTGRES_USER:?set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: \${POSTGRES_DB:?set POSTGRES_DB in .env}
    volumes:
      - database:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER}"]
      interval: 2s
      timeout: 3s
      retries: 30
    restart: unless-stopped

  app:
    image: \${GENIE_IMAGE:?set GENIE_IMAGE to this customer's image}
    depends_on:
      database:
        condition: service_healthy
    environment:
      DATABASE_URL: \${DATABASE_URL:?set DATABASE_URL in .env}
      PUBLIC_URL: \${PUBLIC_URL:?set PUBLIC_URL in .env}
      PORT: "3000"
    ports:
      - "\${GENIE_HOST_PORT:-3000}:3000"
    restart: unless-stopped

  worker:
    image: \${GENIE_IMAGE:?set GENIE_IMAGE to this customer's image}
    command: ["worker"]
    depends_on:
      database:
        condition: service_healthy
    environment:
      DATABASE_URL: \${DATABASE_URL:?set DATABASE_URL in .env}
      PUBLIC_URL: \${PUBLIC_URL:?set PUBLIC_URL in .env}
      WORKER_HEARTBEAT_PATH: /tmp/genie-worker-heartbeat
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

volumes:
  database:
`;
}

/**
 * The variables the image reads, with no value filled in. The real `.env` is never
 * committed, so this file names each variable and its meaning and stops there
 * (`docs/architecture/environment-contract.md`).
 */
export function envExample(input: TenantRenderInput): string {
  return `# ${input.slug}: copy to .env and fill in. Never commit the filled file.
# The image reads every value at run time; it carries none of them (DEC-33).

# Required. Validated before any connection opens.
DATABASE_URL=
PUBLIC_URL=

# Required by the database service in compose.yaml.
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=

# The image built from this customer's modules.txt.
GENIE_IMAGE=

# Optional. Each one falls back to the default in the environment contract.
# FILE_STORAGE_ADAPTER=
# FILE_MAX_BYTES=
# GENIE_CHAT_API_ALLOWED_ORIGINS=
# AUTH_TRUSTED_PROXIES=
# LOCK_TIMEOUT_MS=
# LOG_LEVEL=
# WORKER_HEARTBEAT_PATH=
# PORT=
`;
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
