#!/usr/bin/env bash
# The deadman's way out of Discord. Needed because the alert about Discord being
# broken cannot be delivered through Discord — see README, "Quando o próprio
# Discord é o problema".
#
# The topic is the same one `tools/triagem.mjs` publishes to, and it is a secret:
# whoever knows an ntfy topic can publish to it.
set -euo pipefail
exec "$(dirname "$0")/configure-segredo.sh" NTFY_TOPICO 20-ntfy.conf
