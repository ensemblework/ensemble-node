# 04 · Deployment and DNS

Ensemble Node is two deploys:

1. **Ensemble's API** gets the Node module. Merge the Ensemble branch `feat/ensemble-node-v0` to `main`; the existing pipeline promotes it to `production`, the VM's autodeploy runs `update.sh` (migrations included) and the API restarts. No new service, port or database on the VM.
2. **The website** (`apps/node-web` from this repo) goes to Vercel at `node.ensemblework.com`.

Nothing needs your current IP to reach the VM: the VM pulls its own updates, and the browser reaches the API through the existing `api.ensemblework.com`.

## 1. Ensemble API (the VM)

Add to `/etc/ensemble.env`:

```bash
ENSEMBLE_NODE_WEB_ORIGIN=https://node.ensemblework.com
# The Azure resource has quota for these two only; Node defaults to gpt-5-mini.
ENSEMBLE_INCLUDED_MODELS=gpt-5-mini,gpt-4.1-mini
# Per account per month, shared by Ensemble, the CLI and Node (default 20000).
ENSEMBLE_INCLUDED_MONTHLY_CREDITS=20000
# Global ceiling across all accounts, USD per month: size it to your test budget (for example 20 per tester).
ENSEMBLE_INCLUDED_TOTAL_MONTHLY_USD=<testers × 20>
```

Leave `ENSEMBLE_COOKIE_DOMAIN=ensemblework.com` and `HUB_API_PUBLIC_URL=https://api.ensemblework.com` as they are. Production refuses to start if `ENSEMBLE_NODE_WEB_ORIGIN` is not one https origin, or cannot share the session cookie with the API. A typo fails loudly at start, not silently at sign-in.

Then deploy the branch (pull request → `main` → `deploy` workflow), or, if the env change lands after the deploy: `sudo systemctl restart ensemble-api`.

Check:

```bash
curl -si -X OPTIONS https://api.ensemblework.com/api/node/bootstrap \
  -H 'Origin: https://node.ensemblework.com' -H 'Access-Control-Request-Method: GET' \
  | grep -i 'access-control-allow-origin'
# → access-control-allow-origin: https://node.ensemblework.com
curl -s https://api.ensemblework.com/api/node/bootstrap   # → 401 {"error":"Sign in to Ensemble first."}
```

## 2. Vercel (the website)

1. Vercel → **Add New… → Project** → import `ensemblework/ensemble-node`.
2. **Root Directory:** `apps/node-web`. Framework: Next.js (detected). Vercel finds the pnpm workspace at the repo root; keep the default install and build commands.
3. **Environment variables** (Production and Preview):
   - `NEXT_PUBLIC_ENSEMBLE_API` = `https://api.ensemblework.com`
   - `NEXT_PUBLIC_ENSEMBLE_APP` = `https://app.ensemblework.com`
4. Deploy. Then **Settings → Domains → Add** `node.ensemblework.com`. Vercel shows the DNS record it expects (next section).

Pushes to `main` deploy production; pull requests get preview URLs. Preview URLs (`*.vercel.app`) cannot sign in, because the session cookie belongs to `ensemblework.com` and CORS allows only `node.ensemblework.com`. Test sign-in on the real domain or locally.

## 3. Cloudflare DNS

In Cloudflare → `ensemblework.com` → **DNS → Records → Add record**:

| Type | Name | Target | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| CNAME | `node` | `cname.vercel-dns.com` | **DNS only** (grey cloud) | Auto |

Keep it **DNS only**: Vercel issues and renews the certificate itself, and Cloudflare's proxy in front of Vercel breaks certificate issuance and adds a second cache. If Vercel shows a different target for your project (for example `<hash>.vercel-dns-017.com`), use what it shows. Wait for Vercel's domain check to turn green, usually within minutes.

`api.ensemblework.com` and `app.ensemblework.com` stay as they are.

Name choice: `node.ensemblework.com` reads as "Ensemble Node", sits beside `app.` and `api.` under the cookie domain, and needs no new certificate on the VM. Alternatives with the same properties: `nodes.ensemblework.com` or `crew.ensemblework.com`.

## 4. Turnstile and sign-in providers

- **Turnstile** (email sign-up): Cloudflare → Turnstile → the Ensemble widget → **Hostname management** → add `node.ensemblework.com`. The site key is the same; Node reads it from `/api/auth/status`.
- **Google, Microsoft, GitHub:** nothing to change. Their callbacks are on `api.ensemblework.com`; Node starts them with `?return=node` and the API sends the person back to Node.
- **Email (Resend):** nothing to change; verification codes are the same.

## 5. The CLI's Node tab

The tab ships with the next CLI release from the Ensemble branch. It reads `https://api.ensemblework.com/api/bridge/node` with the key from `ensemble login`. If the server does not have Node yet, the tab says so.

## 6. Going live checklist

- [ ] Ensemble branch merged and deployed; `GET /health` shows the new commit.
- [ ] `/etc/ensemble.env` has `ENSEMBLE_NODE_WEB_ORIGIN` and the included-model lines; the CORS check above passes.
- [ ] Vercel project with root `apps/node-web` and both `NEXT_PUBLIC_*` values; domain added.
- [ ] Cloudflare CNAME `node` → Vercel, DNS only; Vercel shows the domain as valid.
- [ ] Turnstile hostname added.
- [ ] Create an account on Node, verify the code, make a node, ask it to add a task; the task shows on `app.ensemblework.com`.
- [ ] Sign in on the Hub in the same browser: same account, no second sign-in.
- [ ] `ensemble login` on a laptop; Node's welcome page shows the computer online; ask a node to do something there and approve it; the run card follows the job; the node reports when it ends.
- [ ] Credits: Hub → Metrics shows purpose "Ensemble Node".

## 7. When something is off

| Symptom | Cause |
| --- | --- |
| Browser console: CORS error on `api.ensemblework.com` | `ENSEMBLE_NODE_WEB_ORIGIN` missing, has a trailing slash, or the API was not restarted |
| Sign-in succeeds but Node shows the landing page again | The cookie is not shared: check `ENSEMBLE_COOKIE_DOMAIN=ensemblework.com`; the site must be under `ensemblework.com` |
| Provider sign-in lands on the Hub, not Node | `ENSEMBLE_NODE_WEB_ORIGIN` unset on the API |
| "Verify your email to talk to nodes" | The account has not entered its code yet (`/welcome`) |
| Nodes answer "You've used this month's Ensemble credits" | The account's 20,000 are spent, or the global ceiling paused included AI |
| Nodes never answer | `ENSEMBLE_NODE=off`, or included AI not configured and no personal model; the owner sees an error notice in the room |
| Run cards stay "Queued" | The paired computer is offline or its runner is stopped (`ensemble` → status) |
