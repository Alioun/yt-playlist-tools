#!/bin/sh
# THROWAWAY PROTOTYPE helper: runs the checksum-verified Bun 1.4.3 that the ticket 04 agent left on this machine,
# or the Bun on PATH if there is one. Usage: ./bun.sh install | ./bun.sh run build
T=${BUN:-$(command -v bun)}
if command -v bun >/dev/null 2>&1; then exec bun "$@"; fi
BUNV=1.4.3 exec "$T" "$@"
