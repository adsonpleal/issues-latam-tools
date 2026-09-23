#!/usr/bin/env bash
# Run interactively on the host. The token is read from the terminal, never from
# a command argument, shell history, or this repository.
set -euo pipefail

sudo -n install -d -m 0755 /etc/systemd/system/issues-discord.service.d

IFS= read -r -s -p 'DISCORD_BOT_TOKEN: ' TOK </dev/tty
printf '\n' >/dev/tty
trap 'unset TOK' EXIT
if [ -z "$TOK" ]; then
  echo 'Token vazio; nada foi alterado.' >&2
  exit 1
fi

printf '[Service]\nEnvironment=DISCORD_BOT_TOKEN=%s\n' "$TOK" |
  sudo -n tee /etc/systemd/system/issues-discord.service.d/10-token.conf >/dev/null
sudo -n chmod 0600 /etc/systemd/system/issues-discord.service.d/10-token.conf
unset TOK
sudo -n systemctl daemon-reload
echo 'Token instalado. Avise para concluir o bootstrap e ligar o timer.'
