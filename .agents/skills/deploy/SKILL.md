---
name: deploy
description: Deploy the Discord issue announcer to the ragassets Oracle instance.
---

# Deploy the Discord issue announcer

Production is `ubuntu@129.159.50.6` (`ragassets`, Oracle Cloud ARM), reached with
`C:\Users\adson\.ssh\ragassets-oracle`. The one-shot service runs every two
minutes through `issues-discord.timer` and has no listening port. It must not
restart ragassets-gateway, ragassets-patch, or Caddy.

- Code: `/opt/issues-discord`
- State: `/var/lib/issues-discord/estado.json` (preserve across deploys)
- Token: `/etc/systemd/system/issues-discord.service.d/10-token.conf` (root 0600)

Use Git Bash for `tar` and `scp` so Windows paths are interpreted correctly.

## Deploy

Run `npm test` and a public Firestore dry run first:

```bash
node tools/anunciar-discord.mjs --dry-run --desde 2020-01-01T00:00:00Z --max 100 --limite 100
```

From Git Bash:

```bash
tar -czf /tmp/issues-discord.tgz -C /c/Users/adson/dev/issues-latam-tools tools/anunciar-discord.mjs infra
scp -i /c/Users/adson/.ssh/ragassets-oracle /tmp/issues-discord.tgz ubuntu@129.159.50.6:/tmp/
ssh -i /c/Users/adson/.ssh/ragassets-oracle ubuntu@129.159.50.6 'set -e; sudo install -d -o ubuntu -g ubuntu /opt/issues-discord /var/lib/issues-discord; tar -xzf /tmp/issues-discord.tgz -C /opt/issues-discord; rm -f /tmp/issues-discord.tgz; chmod +x /opt/issues-discord/infra/*.sh; /opt/issues-discord/infra/apply-unit.sh'
rm -f /tmp/issues-discord.tgz
```

`apply-unit.sh` updates only changed units and restarts an already-enabled
timer. Never restart the one-shot service as a routine deploy step.

## First installation or token rotation

Have the owner connect in their own terminal and run
`/opt/issues-discord/infra/configure-token.sh`. Its hidden prompt keeps the
token out of chat and shell history. On first installation, before enabling the
timer, run `sudo systemctl start issues-discord.service`; this creates the
watermark without posting old reports. Then run
`sudo systemctl enable --now issues-discord.timer`.

For a deliberate backlog catch-up, get the owner's cutoff and consent to the
number of posts. A backlog of at least 25 blocks automatic runs by design.
Never delete `/var/lib/issues-discord/estado.json` while the timer is active.

## Verify

```bash
systemctl is-enabled issues-discord.timer
systemctl is-active issues-discord.timer
systemctl list-timers issues-discord.timer --all
systemctl show issues-discord.service -p Result -p ExecMainStatus
journalctl -u issues-discord.service -n 30 --no-pager
systemctl is-active ragassets-gateway
```

Successful idle checks are silent apart from systemd Starting/Finished lines.
Discord 401/403 indicates a bad token or missing channel permission;
Firestore 403 indicates the public query is no longer allowed.
