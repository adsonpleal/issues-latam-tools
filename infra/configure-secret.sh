#!/usr/bin/env bash
# Install one secret as a root-only systemd drop-in for issues-discord.
#
#   ./configure-secret.sh DISCORD_BOT_TOKEN 10-token.conf
#   ./configure-secret.sh NTFY_TOPICO       20-ntfy.conf
#
# Run interactively on the host. The value is read from the terminal, never from
# a command argument, the shell history, or this repository — which is public.
#
# The variable names are a contract with the deployed unit, and what this prints
# is read by whoever is deploying, so both stay as they are.
set -euo pipefail

VAR=${1:?uso: configure-secret.sh <VARIAVEL> <arquivo.conf>}
FILE=${2:?uso: configure-secret.sh <VARIAVEL> <arquivo.conf>}
DIR=/etc/systemd/system/issues-discord.service.d

sudo -n install -d -m 0755 "$DIR"

IFS= read -r -s -p "$VAR: " VALUE </dev/tty
printf '\n' >/dev/tty
trap 'unset VALUE' EXIT
if [ -z "$VALUE" ]; then
  echo 'Valor vazio; nada foi alterado.' >&2
  exit 1
fi

printf '[Service]\nEnvironment=%s=%s\n' "$VAR" "$VALUE" | sudo -n tee "$DIR/$FILE" >/dev/null
sudo -n chmod 0600 "$DIR/$FILE"
unset VALUE
sudo -n systemctl daemon-reload
echo "$VAR instalado em $DIR/$FILE."
