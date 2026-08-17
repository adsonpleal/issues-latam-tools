#!/usr/bin/env bash
#
# Ativa a unit e o timer deste projeto: compara o que o deploy acabou de copiar para
# /opt/issues-discord/infra com o que está em /etc/systemd/system/ e, se mudou, instala e
# recarrega o systemd.
#
# Existe pela mesma pegadinha do latam-market: o deploy só mexe em /opt. A unit mora em
# /etc/systemd/system/, então editar um `Environment=` mudava um arquivo que ia para a
# máquina e nunca era lido — o serviço seguia rodando com o ambiente antigo.
#
# Chamado pelo deploy, e seguro de rodar à mão — SEM sudo, que ele já pede onde precisa:
#
#   /opt/issues-discord/infra/apply-unit.sh
#
# Idempotente: sem mudança, não recarrega nem reinicia nada.
set -euo pipefail

BASE=${1:-/opt/issues-discord/infra}
MUDOU=0

for arquivo in issues-discord.service issues-discord.timer; do
  NOVO="$BASE/$arquivo"
  ATIVO="/etc/systemd/system/$arquivo"

  test -s "$NOVO"

  if cmp -s "$NOVO" "$ATIVO" 2>/dev/null; then
    echo "$arquivo inalterado"
    continue
  fi

  echo "$arquivo mudou:"
  diff -u "$ATIVO" "$NOVO" 2>/dev/null || true
  sudo install -m 0644 "$NOVO" "$ATIVO"
  MUDOU=1
done

if [ "$MUDOU" -eq 0 ]; then
  echo "nada a aplicar"
  exit 0
fi

sudo systemctl daemon-reload

# Reinicia o TIMER, nunca o serviço: `systemctl restart issues-discord.service` dispararia
# uma execução fora de hora, e o serviço é oneshot — ele não fica de pé para ser
# reiniciado. Quem precisa reler a unit é o relógio.
if systemctl is-enabled --quiet issues-discord.timer 2>/dev/null; then
  sudo systemctl restart issues-discord.timer
  echo "unit aplicada, timer reiniciado"
else
  echo "unit aplicada; timer ainda não habilitado (rode o bootstrap primeiro)"
fi
