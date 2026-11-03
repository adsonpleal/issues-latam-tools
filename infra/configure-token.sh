#!/usr/bin/env bash
# The Discord bot token. Kept as its own entry point because it is the name every
# instruction and the deploy skill already refer to; the work is in
# configure-segredo.sh, which the ntfy topic uses as well.
set -euo pipefail
exec "$(dirname "$0")/configure-segredo.sh" DISCORD_BOT_TOKEN 10-token.conf
