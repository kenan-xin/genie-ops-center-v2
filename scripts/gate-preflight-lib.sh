# Functions of gate-preflight.sh, in POSIX sh, sourced so that tests can run
# them alone: sh -c '. scripts/gate-preflight-lib.sh; other_gate_runs'.

# Prints the pid of each real gate or e2e run, one per line, except this shell
# and its ancestors, whose launch command line can itself contain gate:merge.
# A process counts only when its arguments name a gate or e2e target (or the
# gate driver scripts/gate-merge.mjs, whose arguments name none), its
# executable is node or pnpm, and its first argument is an Nx, pnpm, gate or
# Playwright entry, so a polling shell or an agent CLI whose prompt names a
# target never counts. The executable is read from the arguments, because
# ps -o comm= prints node-MainThread for a node process.
other_gate_runs() {
  ancestors=" "
  pid=$$
  while [ "$pid" -gt 1 ] 2> /dev/null; do
    ancestors="$ancestors$pid "
    pid=$(ps -o ppid= -p "$pid" | tr -d ' ')
  done
  ps -eo pid=,args= | awk -v skip="$ancestors" '
    /gate:merge|gate-merge\.mjs|ci:develop|ci:pr|test:e2e/ {
      exe = $2
      sub(/.*\//, "", exe)
      if (exe != "node" && exe != "pnpm") next
      if ($3 !~ /(\/nx\.js|\/bin\/nx|\/pnpm\.cjs|\/pnpm|scripts\/gate-merge\.mjs)$/ && $3 !~ /\/playwright/) next
      if (index(skip, " " $1 " ")) next
      print $1
    }'
}

# The listening addresses, as host:port.
listeners() {
  if command -v ss > /dev/null 2>&1; then
    ss -Hltn | awk '{print $4}'
  else
    lsof -nP -iTCP -sTCP:LISTEN | awk 'NR > 1 {print $9}'
  fi
}

# Prints each busy port of the gate, one per line: the app port
# (GENIE_HOST_PORT, default 3000) and 5913, on 127.0.0.1 and [::1], also
# through a wildcard listener.
busy_ports() {
  for port in "${GENIE_HOST_PORT:-3000}" 5913; do
    if listeners | grep -Eq "^(127\.0\.0\.1|\[::1\]|0\.0\.0\.0|\[::\]|\*):$port\$"; then
      echo "$port"
    fi
  done
}
