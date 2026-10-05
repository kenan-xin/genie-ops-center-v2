#!/bin/sh
# One image runs the application, the worker and the operator command through
# flags (R-35). The worker and the genie-ops command load from one bundle, and
# `docker exec` also reaches genie-ops directly on PATH without this script (D-10).
set -eu

# The standalone entry point's depth depends on where the framework decides the
# file tracing root is, which differs between a standalone project and a
# workspace member. Locate it rather than hard-coding a path that reviews have
# already disagreed about. Failing loudly beats starting nothing.
find_server() {
  found=$(find /app -maxdepth 4 -name server.js -not -path '*/node_modules/*')
  count=$(echo "$found" | grep -c . || true)

  # Exactly one, not the first of several. An ambiguous tree would otherwise
  # start an arbitrary root whose assets sit somewhere else.
  if [ "$count" -ne 1 ]; then
    echo "Expected exactly one standalone server.js under /app, found $count." >&2
    echo "$found" >&2
    exit 70
  fi

  echo "$found"
}

case "${1:-app}" in
  app)
    # The preloads make the framework's own console lines JSON with the tenant id (R-75), and
    # let X-Forwarded-For through only from a trusted proxy (Spec 2 R-16).
    exec node --import /usr/local/lib/genie/json-console.mjs \
      --import /usr/local/lib/genie/client-address.mjs "$(find_server)"
    ;;
  worker)
    # The worker loads from the same bundle as genie-ops (D-10); the launcher picks the worker
    # export when GENIE_ENTRY says so.
    GENIE_ENTRY=worker exec genie-ops
    ;;
  genie-ops)
    shift
    exec genie-ops "$@"
    ;;
  *)
    echo "Unknown entrypoint: $1. Use app, worker or genie-ops." >&2
    exit 64
    ;;
esac
