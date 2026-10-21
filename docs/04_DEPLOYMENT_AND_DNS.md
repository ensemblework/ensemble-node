# 04 · Deployment and DNS

Ensemble Node is two deploys. Both run on the home server that runs Ensemble's API (HP EliteDesk 800 G4, Ubuntu 26.04, user `akash`). The Hub and the landing page stay on Vercel.

| What | Repository | Ships through |
| --- | --- | --- |
| Node's backend, a module of Ensemble's API (`apps/hub-api/src/node`) | `ensemblework/ensemble` | Ensemble's pipeline: `main` → `production` → `ensemble-autodeploy.timer` → its `update.sh` (migrations included). No new service, port or database. |
| The website (`apps/node-web`) at `https://node.ensemblework.com` | this one | This repo's pipeline: `main` → CI → the `deploy` workflow moves `production` → `ensemble-node-autodeploy.timer` builds it and switches to it |

```
 browser ─► node.ensemblework.com ─► Cloudflare (proxied CNAME) ─► tunnel "ensemble-node" (dials out from the home server)
    │                                   └► cloudflared (Docker "ensemble-node-cloudflared", host network)
    │                                        └► ensemble-node-web.service: next start on 127.0.0.1:13300
    │                                             serves ~/ensemble-node-host/current → releases/<commit>-<build key>
    └───► api.ensemblework.com ─► Cloudflare ─► tunnel "ensemble-home" ─► hub-api 127.0.0.1:14000  (Ensemble's own install)
          sign-in and data; one session cookie on Domain=ensemblework.com
 app.ensemblework.com ─► Vercel (the Hub)
```

The website has no server secrets and makes no server-side calls. The browser loads it from `node.` and talks to `api.` directly.

## 1. Why this shape

- **Next to the API.** The website is no use without the API, so running it on the same machine adds no new way to be down, and it costs nothing.
- **Its own tunnel.** Ensemble's `setup.sh` rewrites the API tunnel's `config.yml` and sends every host on it to the API's port. A second tunnel (free) means neither project's scripts touch the other's config.
- **No open ports.** The tunnel dials out, so a new local or public IP, or a move from Wi‑Fi to Ethernet, needs no DNS or router change. `next start` listens on loopback only.
- **Release directories.** A deploy builds the new commit next to the one being served, switches a symlink and restarts (about two seconds). When the new release does not report its commit on `/health` within 90 seconds, or `/`, `/login`, `/chat` or the manifest does not answer 200, the previous release comes back by itself.

## 2. On the server

| What | Where |
| --- | --- |
| Settings (mode 0600, no secrets) | `~/ensemble-node-host/node-web.env`, from [`infra/deploy/home/node-web.env.example`](../infra/deploy/home/node-web.env.example) |
| Clone the deploys fetch | `~/ensemble-node-host/repo` (branch `production`) |
| Builds | `~/ensemble-node-host/releases/<commit>-<build key>/` (three kept); `current` points at the one served |
| Node 22 and pnpm for the website | `~/ensemble-node-host/node` (apart from Ensemble's and from any development Node) |
| Tunnel config and credentials | `~/ensemble-node-host/cloudflared/` (`config.yml` is written by `update.sh`) |
| Scripts the timer and cron run | `~/ensemble-node-host/bin/`, copied from the served release |
| Failed-deploy marker, watchdog log | `~/ensemble-node-host/state/autodeploy.failed`, `~/ensemble-node-host/logs/watchdog.log` |

| Layer | What keeps it running |
| --- | --- |
| Website | User unit `ensemble-node-web.service`: `Restart=always`, at most 1 GB of memory so it never starves the API. Lingering starts it at boot without a login. |
| Tunnel | Docker container, `restart: unless-stopped` |
| Deploys | `ensemble-node-autodeploy.timer`, every minute: when `origin/production` moved, `update.sh` |
| Watchdog | Cron at minutes 7, 22, 37 and 52 (Ensemble's runs at 0, 15, 30 and 45) and after boot: starts whatever stopped, restarts the website when `/health` is silent for a minute, restarts the tunnel when only the public URL fails |

Ports, all on 127.0.0.1: 13300 (website) and 20251 (tunnel metrics and `/ready`). Ensemble's home install uses 14000, 15055, 15432 and 16379; development uses 3000, 3300, 4000, 5055, 5432 and 6379.

## 3. How a deploy reaches the server

1. A pull request runs CI: **Typecheck, tests and build** and **Home server scripts** (ShellCheck and the compose file). Both are required on `main`.
2. Merge. CI runs again on `main`; when it passes, the `deploy` workflow fast-forwards `production` to that commit. It never forces, and skips a commit that is no longer the tip of `main`.
3. Within a minute the server's timer sees the new commit and runs `update.sh`: fast-forward the clone, `git archive` the commit into a new release, `pnpm install --frozen-lockfile` and `next build` (both at `nice 10`, so the API stays responsive), install that release's units and scripts, switch `current`, restart and wait for `/health`. About one to two minutes.
4. The workflow waits until `https://node.ensemblework.com/health` reports the commit, checks the pages, then checks that Ensemble's API allows this site (a warning, never a failure). Each deploy appears under the repository's **production** environment.

A failed deploy is written to `state/autodeploy.failed` and not retried until a newer commit lands. Pull requests and other branches never reach the server.

- **Pause deploys:** `ENSEMBLE_NODE_AUTODEPLOY=off` in `node-web.env` (applies on the next minute).
- **Deploy now, by hand:** `bash ~/ensemble-node-host/bin/update.sh`.
- **Roll back:** revert the change on `main` (a pull request); it ships the same way. To go back at once: `ENSEMBLE_NODE_AUTODEPLOY=off`, then `bash ~/ensemble-node-host/bin/update.sh <commit>` (the last three builds switch without a rebuild).
- **Change a `NEXT_PUBLIC_*` value:** edit `node-web.env`, then run `update.sh`. The values are part of the build key, so it builds a new release.

GitHub settings: the repository variable `DEPLOY_ENABLED=true` (anything else and the `deploy` workflow does nothing), and optionally `ENSEMBLE_NODE_URL` and `ENSEMBLE_API_URL`. There are no deploy secrets: the server pulls, and nothing connects in. Branch protection: `main` requires both CI checks and allows no force push or deletion; `production` allows no force push or deletion.

## 4. Cloudflare

| Name | Type | Target | Proxy | Made by |
| --- | --- | --- | --- | --- |
| `node` | CNAME | `<ensemble-node tunnel id>.cfargotunnel.com` | **Proxied** | `cloudflared tunnel route dns ensemble-node node.ensemblework.com` |
| `api` | CNAME | the `ensemble-home` tunnel | Proxied | Ensemble |
| apex, `www`, `app` | Vercel records | | DNS only | Ensemble |

- Keep `node` **proxied**: a tunnel record works only through Cloudflare's proxy. Cloudflare's Universal SSL certificate covers `node.ensemblework.com`, so there is no certificate on the server.
- **Turnstile:** Cloudflare → Turnstile → the Ensemble widget → **Hostname management** → add `node.ensemblework.com`. Without it the human check on Node's email sign-up fails. The site key is the same; Node reads it from `/api/auth/status`.
- **Google, Microsoft, GitHub sign-in:** nothing to change. Their callbacks are on `api.ensemblework.com`; Node starts them with `?return=node`.
- **Email (Resend):** nothing to change.

## 5. Ensemble's API

`~/ensemble-host/ensemble.env` has:

```bash
ENSEMBLE_NODE_WEB_ORIGIN=https://node.ensemblework.com
```

The API ignores it until it has the Node module (Ensemble branch `feat/ensemble-node-v0`, still to be rebased on Ensemble's `main` and merged). From then on it is the CORS allowlist entry and the return address after a provider sign-in, and production refuses to start when it is not one https origin that shares the session cookie. `ENSEMBLE_COOKIE_DOMAIN=ensemblework.com` and `HUB_API_PUBLIC_URL=https://api.ensemblework.com` stay as they are. Included AI (`ENSEMBLE_INCLUDED_MODELS`, `ENSEMBLE_INCLUDED_MONTHLY_CREDITS=20000`, `ENSEMBLE_INCLUDED_TOTAL_MONTHLY_USD`) belongs to Ensemble and is shared by all three apps.

Check, once the API has Node:

```bash
curl -si -X OPTIONS https://api.ensemblework.com/api/node/bootstrap \
  -H 'Origin: https://node.ensemblework.com' -H 'Access-Control-Request-Method: GET' \
  | grep -i 'access-control-allow-origin'
# → access-control-allow-origin: https://node.ensemblework.com
curl -s https://api.ensemblework.com/api/node/bootstrap   # → 401 {"error":"Sign in to Ensemble first."}
```

Until then, `node.ensemblework.com` loads but cannot sign in, and the `deploy` workflow says so in a warning.

## 6. A new machine

1. Docker usable by the user (`docker` group), `sudo loginctl enable-linger $USER`, `git`, `curl`, `python3`. A machine that runs Ensemble's API has all of these.
2. The tunnel's credentials: copy `~/.cloudflared/<id>.json` from the old machine, or `cloudflared tunnel login`, then `cloudflared tunnel create ensemble-node` and `cloudflared tunnel route dns --overwrite-dns ensemble-node node.ensemblework.com`. Put the json in `~/ensemble-node-host/cloudflared/` (mode 0600).
3. `~/ensemble-node-host/node-web.env` from the example, with `ENSEMBLE_NODE_TUNNEL_ID`.
4. `git clone https://github.com/ensemblework/ensemble-node.git /tmp/ensemble-node && bash /tmp/ensemble-node/infra/deploy/home/setup.sh`. It clones `production` into `~/ensemble-node-host/repo`, builds, starts everything and installs the cron lines. Safe to run again.
5. Stop the old machine's `ensemble-node-cloudflared`: two connectors would share the tunnel's traffic.

## 7. Everyday commands

```bash
curl -s https://node.ensemblework.com/health                      # public: commit and version
curl -s http://127.0.0.1:13300/health                              # loopback
systemctl --user status ensemble-node-web
journalctl --user -u ensemble-node-web -f                          # website logs
journalctl --user -u ensemble-node-autodeploy -n 100 --no-pager    # deploys
systemctl --user list-timers 'ensemble-node-*'
docker logs --tail 50 ensemble-node-cloudflared
curl -s http://127.0.0.1:20251/ready                               # tunnel: readyConnections
tail -50 ~/ensemble-node-host/logs/watchdog.log
bash ~/ensemble-node-host/bin/update.sh                            # deploy origin/production now
bash ~/ensemble-node-host/bin/watchdog.sh                          # the 15-minute check, now
```

## 8. Going live

- [x] Tunnel `ensemble-node` and the proxied `node` record.
- [x] The website on the home server, deployed from `production` by the timer.
- [x] CI, the `deploy` workflow, `DEPLOY_ENABLED=true` and branch protection.
- [x] `ENSEMBLE_NODE_WEB_ORIGIN` in `~/ensemble-host/ensemble.env`.
- [ ] Turnstile hostname `node.ensemblework.com` (Cloudflare dashboard, §4).
- [ ] Ensemble's Node module merged and deployed; the check in §5 passes and the `deploy` workflow stops warning.
- [ ] Create an account on Node, verify the code, make a node, ask it to add a task; the task shows on `app.ensemblework.com`.
- [ ] Sign in on the Hub in the same browser: same account, no second sign-in.
- [ ] `ensemble login` on a laptop; Node's welcome page shows the computer online; ask a node to do something there and approve it; the run card follows the job and the node reports when it ends.
- [ ] Credits: Hub → Metrics shows the purpose "Ensemble Node".

## 9. When something is off

| Symptom | Cause |
| --- | --- |
| `deploy` workflow: "did not report <commit> within 20 minutes" | The server's deploy failed: `journalctl --user -u ensemble-node-autodeploy -n 200 --no-pager` and `cat ~/ensemble-node-host/state/autodeploy.failed`. Push a fix, or run `update.sh` by hand. |
| `node.ensemblework.com` shows Cloudflare error 1033 | The tunnel is down: `docker ps --filter name=ensemble-node`, `docker logs ensemble-node-cloudflared`. The watchdog restarts it within 15 minutes. |
| Cloudflare 502 | The tunnel is up but the website is not: `systemctl --user status ensemble-node-web` |
| Browser console: CORS error on `api.ensemblework.com` | The API does not have the Node module yet, or `ENSEMBLE_NODE_WEB_ORIGIN` is missing, has a trailing slash, or the API was not restarted |
| Sign-in succeeds but Node shows the landing page again | The cookie is not shared: check `ENSEMBLE_COOKIE_DOMAIN=ensemblework.com` |
| Provider sign-in lands on the Hub, not Node | `ENSEMBLE_NODE_WEB_ORIGIN` unset on the API |
| The human check fails on Node's sign-up | `node.ensemblework.com` is missing from the Turnstile widget's hostnames |
| "Verify your email to talk to nodes" | The account has not entered its code yet (`/welcome`) |
| Nodes answer "You've used this month's Ensemble credits" | The account's 20,000 are spent, or the global ceiling paused included AI |
| Nodes never answer | `ENSEMBLE_NODE=off`, or included AI not configured and no personal model; the owner sees an error notice in the room |
| Run cards stay "Queued" | The paired computer is offline or its runner is stopped (`ensemble` → status) |
