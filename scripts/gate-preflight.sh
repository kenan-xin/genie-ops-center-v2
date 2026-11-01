#!/usr/bin/env sh
# Refuses to start a gate when the environment would make it fail for a reason
# that is not the code: the Docker context or configuration, a full build
# cache, another gate or e2e run, a busy port, or no push access. Run it in the
# foreground before every `pnpm gate:merge` launch, and start the gate only when
# it exits 0.
#
# Usage, from the repository root or any worktree:
#   sh scripts/gate-preflight.sh
#
# DOCKER_CONFIG names the Docker configuration folder that the gate uses
# (default /tmp/genie-gate-docker-config). Its config.json must hold
# currentContext and no credsStore or credHelpers, so that no credential prompt
# blocks the gate. The folder also needs links to the contexts, cli-plugins and
# buildx folders of ~/.docker, or Docker cannot resolve the context.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
expected_context=desktop-linux
max_cache_bytes=20000000000
ports="3000 5913"

fail() {
  echo "gate-preflight: $1: $2"
  exit 1
}

# 1. Docker context and configuration.
config_dir=${DOCKER_CONFIG:-/tmp/genie-gate-docker-config}
config_file="$config_dir/config.json"
[ -f "$config_file" ] ||
  fail "no $config_file" "create it with {\"currentContext\":\"$expected_context\"}"
if grep -Eq '"(credsStore|credHelpers)"' "$config_file"; then
  fail "$config_file holds credsStore or credHelpers" "remove them, so that no credential prompt blocks the gate"
fi
file_context=$(sed -n 's/.*"currentContext"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$config_file")
export DOCKER_CONFIG="$config_dir"
context=$(docker context show 2>/dev/null) ||
  fail "docker context show failed" "start Docker Desktop"
[ "$context" = "$expected_context" ] ||
  fail "Docker context is '$context'" "run docker context use $expected_context"
[ "$file_context" = "$context" ] ||
  fail "$config_file has currentContext '$file_context'" "set it to \"$context\""
docker info > /dev/null 2>&1 ||
  fail "docker info does not answer" "start Docker Desktop, and link the contexts, cli-plugins and buildx folders of ~/.docker into $config_dir"

# 2. Build cache at most 20 GB. Docker prints decimal units (1 GB = 1e9 bytes).
cache_bytes() {
  docker system df --format '{{.Type}}\t{{.Size}}' |
    awk -F '\t' '$1 == "Build Cache" {
      n = $2; sub(/[A-Za-z]+$/, "", n); u = substr($2, length(n) + 1)
      m = 1
      if (u == "kB" || u == "KB") m = 1e3
      else if (u == "MB") m = 1e6
      else if (u == "GB") m = 1e9
      else if (u == "TB") m = 1e12
      printf "%.0f\n", n * m
    }'
}
size=$(cache_bytes)
if [ "${size:-0}" -gt "$max_cache_bytes" ]; then
  echo "gate-preflight: build cache is $size bytes, running docker builder prune -f"
  docker builder prune -f > /dev/null
  size=$(cache_bytes)
  [ "${size:-0}" -le "$max_cache_bytes" ] ||
    fail "build cache is still $size bytes after a prune" "free Docker disk space by hand"
fi

# 3. No other gate or Nx e2e run. The launch command line of this script can
# itself contain gate:merge, so this process and its ancestors do not count.
ancestors=" "
pid=$$
while [ "$pid" -gt 1 ] 2> /dev/null; do
  ancestors="$ancestors$pid "
  pid=$(ps -o ppid= -p "$pid" | tr -d ' ')
done
others=$(pgrep -f 'gate:merge|ci:develop|ci:pr|test:e2e' || true)
for other in $others; do
  case "$ancestors" in
    *" $other "*) ;;
    *) fail "another gate or e2e run is active (pid $other)" "wait until it ends" ;;
  esac
done

# 4. Ports free on 127.0.0.1 and [::1], also through a wildcard listener.
listeners() {
  if command -v ss > /dev/null 2>&1; then
    ss -Hltn | awk '{print $4}'
  else
    lsof -nP -iTCP -sTCP:LISTEN | awk 'NR > 1 {print $9}'
  fi
}
for port in $ports; do
  if listeners | grep -Eq "^(127\.0\.0\.1|\[::1\]|0\.0\.0\.0|\[::\]|\*):$port\$"; then
    fail "port $port is in use" "stop the server on it, or wait for the run that owns it"
  fi
done

# 5. Push access, so that a passed gate can be pushed.
git -C "$root" push --dry-run origin develop > /dev/null 2>&1 ||
  fail "git push --dry-run origin develop failed" "unlock 1Password (SSH agent), then run this again"

echo "gate-preflight: ok"
