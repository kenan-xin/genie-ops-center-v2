# One image builds every deployment. MODULE_INCLUDE is the only build argument,
# because a build argument stays readable in image history (DEC-33, R-32).
#
# The base image is pinned by digest, with the tag kept for readability, so a
# retagged `node:26-alpine` cannot change the build under a release
# (genie-ops-center-v2-sl1).
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS builder

# Every RUN step below reads the argument as an environment variable. There is
# deliberately no `ENV MODULE_INCLUDE=${MODULE_INCLUDE}` copy: it would turn an
# unset argument into an empty one, and the prune below must refuse unset while
# accepting an explicitly empty selection (Spec 0 AC-24, pg4).
ARG MODULE_INCLUDE
ENV NEXT_TELEMETRY_DISABLED=1

# Node 26 images no longer ship corepack, so pnpm is installed explicitly at the
# version the workspace pins in `packageManager`.
RUN npm install --global pnpm@12.4.2
WORKDIR /build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json nx.json tsconfig.base.json oxlint.config.ts oxfmt.config.ts ./
COPY packages ./packages
COPY tools ./tools
COPY apps/genie ./apps/genie

# Build-input exclusion (Spec 0 AC-5/AC-24, pg4): remove every packages/modules
# folder the selection does not name, fail unless the remaining folders equal
# the selection, and print both lists into the build log. Install and build then
# never see an excluded module, so importing one fails the build.
RUN node tools/generators/src/selection/prune.ts

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm exec nx run @genie/app:build

FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# The generated standalone entry reads `process.env.HOSTNAME || "0.0.0.0"`, and a container
# runtime sets HOSTNAME to the container id, so without this the server binds to that one name
# and refuses loopback. Published ports still work, which makes the mistake nearly invisible:
# health answers from outside while anything inside the container is refused. Next's own Docker
# example sets this for the same reason.
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Standalone output carries only the traced runtime files. No test-mode asset is
# required and no file tracing workaround is present.
COPY --from=builder /build/apps/genie/.next/standalone ./

# Static assets and the public folder must sit beside the server entry point,
# and its depth depends on the file tracing root the build chose. Copy them to a
# staging path, then place them relative to wherever the entry actually is.
# Hard-coding apps/genie/ here would leave every chunk and public asset
# unreachable in a flat layout, while health still answered, which is exactly
# the kind of green-but-broken result this plan is trying to avoid.
COPY --from=builder /build/apps/genie/.next/static /staging/static
COPY --from=builder /build/apps/genie/public /staging/public
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN set -eu; \
    matches=$(find /app -maxdepth 4 -name server.js -not -path '*/node_modules/*'); \
    count=$(echo "$matches" | grep -c . || true); \
    test "$count" -eq 1 || { echo "expected exactly one standalone server.js, found $count:" >&2; echo "$matches" >&2; exit 70; }; \
    server=$matches; \
    root=$(dirname "$server"); \
    echo "standalone root: $root"; \
    mkdir -p "$root/.next"; \
    cp -r /staging/static "$root/.next/static"; \
    cp -r /staging/public "$root/public"; \
    rm -rf /staging; \
    chmod +x /usr/local/bin/entrypoint.sh; \
    chown -R node:node "$root"

# The runtime runs as the base image's built-in `node` user, never root. The
# chown above lets the standalone server write its own `.next/cache`, which a
# root-owned tree could not (genie-ops-center-v2-sl1).
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["app"]
