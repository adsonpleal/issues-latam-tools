#!/usr/bin/env bash
# Install one secret as a root-only systemd drop-in for issues-discord.
#
#   ./configure-segredo.sh DISCORD_BOT_TOKEN 10-token.conf
#   ./configure-segredo.sh NTFY_TOPICO       20-ntfy.conf
#
# Run interactively on the host. The value is read from the terminal, never from
# a command argument, the shell history, or this repository — which is public.
set -euo pipefail

VAR=${1:?uso: configure-segredo.sh <VARIAVEL> <arquivo.conf>}
ARQ=${2:?uso: configure-segredo.sh <VARIAVEL> <arquivo.conf>}
DIR=/etc/systemd/system/issues-discord.service.d

sudo -n install -d -m 0755 "$DIR"

IFS= read -r -s -p "$VAR: " VALOR </dev/tty
printf '\n' >/dev/tty
trap 'unset VALOR' EXIT
if [ -z "$VALOR" ]; then
  echo 'Valor vazio; nada foi alterado.' >&2
  exit 1
fi

printf '[Service]\nEnvironment=%s=%s\n' "$VAR" "$VALOR" | sudo -n tee "$DIR/$ARQ" >/dev/null
sudo -n chmod 0600 "$DIR/$ARQ"
unset VALOR
sudo -n systemctl daemon-reload
echo "$VAR instalado em $DIR/$ARQ."
