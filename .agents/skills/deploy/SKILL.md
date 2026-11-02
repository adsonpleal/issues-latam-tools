---
name: deploy
description: Deploy the Discord announcer (issues-discord) to the ragassets production instance. Use when the user says "deploy", "sobe o anunciador", "ship it", or asks to update the announcer on the server.
---

# Deploy the Discord announcer

<!-- The trigger phrases in `description` stay in Portuguese ("sobe o anunciador"):
     they are what Adson actually types, so translating them would stop the skill
     from being found. Everything below is prose, so it is English. -->

The site itself (`issues.latam-tools.com.br`) **does not go through here** — it is
Firebase Hosting, shipped by GitHub Actions on every push to `main`
(`.github/workflows/firebase-hosting-merge.yml`). This skill is only for
`issues-discord`, the service that announces new public cards in Discord.

What it is: a one-shot Node script fired by a systemd timer every 2 min. It
**listens on no port** — no Caddy, domain, DNS or CORS is involved. Outbound only,
to `firestore.googleapis.com` and `discord.com`.

## Connection

- Host: `ubuntu@129.159.50.6` (`ragassets`, Oracle Cloud ARM)
- Key: `C:\Users\adson\.ssh\ragassets-oracle`
- Code: `/opt/issues-discord`
- State (the watermark): `/var/lib/issues-discord/estado.json` — **outside /opt**,
  because the deploy deletes whatever is not in the tarball and would take the
  watermark with it, making the service re-announce everything on every deploy
- Shared machine: nothing here may take down its neighbours —
  `ragassets-gateway`, `ragassets-patch`, `caddy`. That is what the unit's
  `MemoryMax=128M`, `CPUWeight`, `IOWeight` and `Nice` are for; do not raise them

File and path names stay as they are on the machine, Portuguese included
(`estado.json`), and so do the unit names `issues-discord.service` and
`issues-discord.timer` — they are identifiers systemd resolves, not words.

**Always through the Bash tool (Git Bash), never PowerShell**: `tar` and `scp` need
MSYS paths (`/c/Users/...`); given `C:\...`, `tar` reads `C` as a remote host. And
any `ssh` carrying `$( )` gets mangled by PowerShell.

## 1. Before shipping

```bash
npm test
node tools/anunciar-discord.mjs --dry-run --desde 2020-01-01T00:00:00Z --max 100 --limite 100
```

The flags `--desde` and `--limite` are the script's own option names, so they stay
Portuguese — renaming them here would just produce commands that fail.

The dry run renders the existing public cards as embeds without posting anything.
It is where you check truncation, markdown escaping, colours and footer against
real user-written text.

## 2. Ship

```bash
tar -czf /tmp/issues-discord.tgz -C /c/Users/adson/dev/issues-latam-tools tools/anunciar-discord.mjs infra
scp -i /c/Users/adson/.ssh/ragassets-oracle /tmp/issues-discord.tgz ubuntu@129.159.50.6:/tmp/
ssh -i /c/Users/adson/.ssh/ragassets-oracle ubuntu@129.159.50.6 'set -e; sudo install -d -o ubuntu -g ubuntu /opt/issues-discord /var/lib/issues-discord; tar -xzf /tmp/issues-discord.tgz -C /opt/issues-discord; rm -f /tmp/issues-discord.tgz; chmod +x /opt/issues-discord/infra/*.sh; /opt/issues-discord/infra/apply-unit.sh'
rm -f /tmp/issues-discord.tgz
```

`apply-unit.sh` compares the unit and the timer against what is in
`/etc/systemd/system/`, installs them if they changed, and restarts **the timer** —
never the service. The service is `Type=oneshot`, so a restart would fire an
off-schedule run, and there is no resident process to restart anyway. It is
idempotent: with nothing changed it reloads nothing.

## 3. Verify

```bash
ssh -i /c/Users/adson/.ssh/ragassets-oracle ubuntu@129.159.50.6 'systemctl is-enabled issues-discord.timer; systemctl is-active issues-discord.timer; systemctl list-timers issues-discord.timer --all; systemctl show issues-discord.service -p Result -p ExecMainStatus; journalctl -u issues-discord.service -n 30 --no-pager; cat /var/lib/issues-discord/estado.json; systemctl is-active ragassets-gateway ragassets-patch caddy'
```

The happy path is **silent**: apart from systemd's own `Starting`/`Finished`, a line
shows up only when it announces or when it fails.

## First installation and token rotation

Have Adson connect in his own terminal and run
`/opt/issues-discord/infra/configure-token.sh`. Its hidden prompt keeps the token
out of chat, out of `ps` and out of shell history. It is the same
`DISCORD_BOT_TOKEN` the five sibling projects use (it is in their GitHub secrets).

⚠️ **On a first installation the order matters.** Enabling the timer first means the
clock starts before anyone has looked at the watermark:

```bash
# First run BY HAND: records the watermark and announces nothing.
sudo systemctl start issues-discord.service
cat /var/lib/issues-discord/estado.json     # check the watermark and the five ids

# Only after checking, start the clock.
sudo systemctl enable --now issues-discord.timer
```

Prerequisite from outside this repo: the bot must be in the guild that hosts the
reports channel, with **View Channel + Send Messages + Embed Links** on the channel
in `DISCORD_CHANNEL_ID` (set in `infra/issues-discord.service`). Also take away its
Mention Everyone permission there — the text it relays is anonymous public writing.

## When something goes wrong

| Symptom | What it is |
|---|---|
| `fluxo saturado` in the journal | 25 cards in one 2-min interval. Either spam or a backlog. Both want a human, not 25 embeds in the channel. Investigate the board, then unblock with `--desde <ts>` |
| `Firestore 403` | Someone tightened `firestore.rules`, or the web key picked up a referrer restriction in GCP. The query needs `arquivado == false` **and** `limit <= 500` |
| `Discord 401/403` | Token revoked, or the bot lost permission on the channel |
| ⚠️ showed up in the channel | That is the deadman: ~20 min of consecutive failure. It warns once and goes quiet until things work again |
| Announced the same card twice | A crash between Discord's `2xx` and the `fsync` of the state. It is the safe side of that trade (losing an announcement would be silent); delete the duplicate message by hand |

`fluxo saturado` is quoted as it appears: the script writes that string to the
journal, so it is what you grep for. The ⚠️ warning is quoted for the same reason —
it is the message that reaches the Discord channel, written for the people reading
it, so it stays Portuguese on purpose.

To re-announce something deliberately: remove the id from `anunciados` in
`estado.json` and move the `watermark` back (both are keys inside that file). For a
deliberate backlog catch-up, get Adson's cutoff and his consent to the number of
posts first. Never delete the whole `estado.json` while the timer is enabled — the
service re-bootstraps, the watermark jumps to the present, and whatever was queued
is swallowed.

## What NOT to do

- **Do not** swap the anonymous query for `firebase-admin` or a service account.
  Today the service is physically incapable of reading `issues/{id}/privado/contato`
  — the rules deny it. With admin credentials that guarantee degrades into "the
  script is careful", which is far worse. The `FIREBASE_API_KEY` in the unit is the
  public web key and is not a secret; the Firestore rules are what control access.
- **Do not** delete `/var/lib/issues-discord/estado.json` — it is the only copy of
  the watermark.
- **Do not** enable `issues-discord.service`; the `.timer` is what gets enabled. The
  service has no `[Install]` section, so there is nothing to enable.
- **Do not** restart `issues-discord.service` as a routine deploy step.
- **Do not** touch `/etc/caddy/` on account of this service: it has no port.
