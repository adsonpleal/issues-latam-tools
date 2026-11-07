#!/usr/bin/env bash
#
# Activates this project's unit and timer: compares what the deploy just copied to
# /opt/issues-discord/infra with what is in /etc/systemd/system/ and, if it changed,
# installs it and reloads systemd.
#
# It exists because of the same trap as latam-market: the deploy only touches /opt. The
# unit lives in /etc/systemd/system/, so editing an `Environment=` changed a file that
# travelled to the machine and was never read -- the service kept running with the old
# environment.
#
# Called by the deploy, and safe to run by hand -- WITHOUT sudo, which it asks for where
# it needs it:
#
#   /opt/issues-discord/infra/apply-unit.sh
#
# Idempotent: with no change it reloads and restarts nothing.
#
# What it prints is read by whoever is deploying, so it stays in Portuguese.
set -euo pipefail

BASE=${1:-/opt/issues-discord/infra}
CHANGED=0

for file in issues-discord.service issues-discord.timer; do
  NEW="$BASE/$file"
  ACTIVE="/etc/systemd/system/$file"

  test -s "$NEW"

  if cmp -s "$NEW" "$ACTIVE" 2>/dev/null; then
    echo "$file inalterado"
    continue
  fi

  echo "$file mudou:"
  diff -u "$ACTIVE" "$NEW" 2>/dev/null || true
  sudo install -m 0644 "$NEW" "$ACTIVE"
  CHANGED=1
done

if [ "$CHANGED" -eq 0 ]; then
  echo "nada a aplicar"
  exit 0
fi

sudo systemctl daemon-reload

# Restart the TIMER, never the service: `systemctl restart issues-discord.service` would
# fire a run out of turn, and the service is oneshot -- it does not stay up to be
# restarted. What needs to re-read the unit is the clock.
if systemctl is-enabled --quiet issues-discord.timer 2>/dev/null; then
  sudo systemctl restart issues-discord.timer
  echo "unit aplicada, timer reiniciado"
else
  echo "unit aplicada; timer ainda não habilitado (rode o bootstrap primeiro)"
fi
