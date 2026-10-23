# 04 · Deployment and DNS

Ensemble Node is two deploys, in the same shape as Ensemble itself: the API on the home server, the Next.js website on Vercel.

There is one Node website. While Node's features settle it uses Ensemble's **test** environment: accounts, data, connections and computers of `test.ensemblework.com`, through `api-test.ensemblework.com`. Moving it to production is §7.

| What | Repository | Runs on | Ships through |
| --- | --- | --- | --- |
| Node's backend, a module of Ensemble's API (`apps/hub-api/src/node`) | `ensemblework/ensemble` | Ensemble's home server, as part of Ensemble's **test** API `api-test.ensemblework.com` (and of `api.ensemblework.com` once promoted) | Ensemble's test pipeline (`testing` branch, its `docs/36_WEB_TESTING.md`), then its production pipeline. No new service, port or database. |
| The website (`apps/node-web`) at `https://node.ensemblework.com` | this one | Vercel project `ensemble-node`, next to Ensemble's `ensemble-app` (the Hub) and `ensemble-landing` | This repo's `deploy` workflow, after CI passes on `main` |

```
 browser ─► node.ensemblework.com ─► Vercel (project ensemble-node; pages, and /health in bom1)
    │
    └───► api-test.ensemblework.com ─► Cloudflare Tunnel ─► Ensemble's test API on the home server
          sign-in and all data; one session cookie on Domain=ensemblework.com
```

The website has no server secrets and makes no server-side calls. The browser loads it from `node.` and talks to `api.` directly. Node keeps no files of its own: nodes, rooms and messages are rows in Ensemble's Postgres.

## 1. Vercel

| Setting | Value |
| --- | --- |
| Account | The one that owns `ensemble-app`, `ensemble-landing` and the domain `ensemblework.com` |
| Project | `ensemble-node` |
| Root Directory | `apps/node-web`, with files outside it included (the pnpm workspace is at the repository root) |
| Framework, Node.js | Next.js, 22.x |
| Functions region | `bom1` (Mumbai), the same as the Hub. Only `/health` runs as a function; every other page is static. |
| Environment variables (Production and Preview) | `NEXT_PUBLIC_ENSEMBLE_API=https://api-test.ensemblework.com`, `NEXT_PUBLIC_ENSEMBLE_APP=https://test.ensemblework.com` |
| Deployment protection | Vercel Authentication on every URL except the custom domain |
| Domain | `node.ensemblework.com` |
| Git integration | Not connected. GitHub Actions publishes prebuilt output, as for the Hub. |

The `NEXT_PUBLIC_*` values are baked into the browser bundle at build time: after changing them in the Vercel project, run the `deploy` workflow (Actions → deploy → Run workflow on `main`).

Preview URLs (`*.vercel.app`) cannot sign in: the session cookie belongs to `ensemblework.com`, and Ensemble's API allows only `node.ensemblework.com`. Test sign-in on the real domain or locally.

## 2. How a deploy happens

1. A pull request runs CI: **Typecheck, tests and build**. It is required on `main`.
2. Merge. CI runs again on `main`; when it passes, the `deploy` workflow builds that commit with `vercel build`, publishes it with `vercel deploy --prebuilt --prod` (`.github/actions/vercel-deploy`), and waits until `https://node.ensemblework.com/health` reports the commit and `/`, `/login`, `/chat` and the manifest answer 200. It skips a commit that is no longer the tip of `main`, so an older run never rolls the site back.
3. It then checks that Ensemble's API allows this site (CORS). That is a warning, never a failure.

Each deploy appears under the repository's **production** environment and in Vercel. To roll back at once: Vercel → `ensemble-node` → Deployments → an earlier production deployment → **Instant Rollback**. Then revert the change on `main` with a pull request, so the next deploy does not bring it back.

| GitHub setting | Value |
| --- | --- |
| Secret `VERCEL_TOKEN` | A Vercel access token of the account above |
| Secrets `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | The account's team id and the `ensemble-node` project id |
| Variable `DEPLOY_ENABLED` | `true`; anything else and the `deploy` workflow does nothing |
| Variables `ENSEMBLE_NODE_URL`, `ENSEMBLE_API_URL` | `ENSEMBLE_API_URL=https://api-test.ensemblework.com` (the API the CORS check asks); `ENSEMBLE_NODE_URL` unset (default `https://node.ensemblework.com`) |
| Branch protection on `main` | **Typecheck, tests and build** required; no force push or deletion |

To replace the token: Vercel → Account Settings → **Tokens** → Create (scope: the account above), then `gh secret set VERCEL_TOKEN -R ensemblework/ensemble-node` and paste it. Vercel's CLI cannot create tokens.

## 3. Cloudflare

| Name | Type | Target | Proxy |
| --- | --- | --- | --- |
| `node` | CNAME | `41da7d0c36baf7e2.vercel-dns-017.com` (from Vercel → `ensemble-node` → Settings → Domains) | **DNS only** |
| `app`, `www`, apex | Vercel records | | DNS only (Ensemble) |
| `api` | Tunnel `ensemble-home` | | Proxied (Ensemble) |

Keep `node` **DNS only**, like `app`: Vercel issues and renews the certificate itself (Let's Encrypt), and Cloudflare's proxy in front of Vercel would add a second cache and break issuance.

**Turnstile:** Node's sign-up uses Ensemble's existing widget, **Ensemble signup**. Node has no Turnstile keys of its own: it shows the widget with the site key from `/api/auth/status`, and Ensemble's API checks the answer with that widget's secret. The widget's hostname `ensemblework.com` covers `node.ensemblework.com` (a hostname covers its subdomains), so nothing needs adding there.

**Google, Microsoft, GitHub sign-in:** Node shows the buttons the API offers. The test API has none configured, so Node on test signs in with email and password; production's callbacks are on `api.ensemblework.com`, Node starts them with `?return=node`, and the API sends the person back to Node.

## 4. Ensemble's API

The env file of the API Node uses (`~/ensemble-test/ensemble.env` for the test API; production's has the same line) has:

```bash
ENSEMBLE_NODE_WEB_ORIGIN=https://node.ensemblework.com
```

With it, the API:

- allows `https://node.ensemblework.com` for CORS with credentials;
- sends a provider sign-in started on Node back to Node;
- accepts a Turnstile answer solved on `node.ensemblework.com` for email sign-up (still checked with Cloudflare: success, the `signup` action and the host);
- links the verification email of an account created on Node to Node's `/welcome`.

Production refuses to start when the value is not one https origin that shares the session cookie (`ENSEMBLE_COOKIE_DOMAIN=ensemblework.com`).

Models and credits come from Ensemble, so the Hub, the desktop app, the CLI and Node always agree:

- A node can use every model in `ENSEMBLE_INCLUDED_MODELS`, Ensemble's list of Azure AI Foundry deployments, by its name and version. A model added to or removed from that list shows on Node at once. A node's default is `gpt-5-mini`.
- Every call spends the account's monthly Ensemble credits (20,000 by default, `ENSEMBLE_INCLUDED_MONTHLY_CREDITS`), shared by every Ensemble app, under the operator's ceiling (`ENSEMBLE_INCLUDED_TOTAL_MONTHLY_USD`). Ensemble's `docs/33_INCLUDED_AI.md` owns the details.

Check:

```bash
curl -si -X OPTIONS https://api-test.ensemblework.com/api/node/bootstrap \
  -H 'Origin: https://node.ensemblework.com' -H 'Access-Control-Request-Method: GET' \
  | grep -i 'access-control-allow-origin'
# → access-control-allow-origin: https://node.ensemblework.com
curl -s https://api-test.ensemblework.com/api/node/bootstrap   # → 401 {"error":"Sign in to Ensemble first."}
```

## 5. Everyday checks

```bash
curl -s https://node.ensemblework.com/health            # the commit being served
vercel ls ensemble-node                                  # recent deployments
gh run list -R ensemblework/ensemble-node -w deploy -L 5
```

## 6. When something is off

| Symptom | Cause |
| --- | --- |
| `deploy` workflow: "Set the VERCEL_TOKEN repository secret" | The secret is missing (§2) |
| `deploy` workflow: "did not report <commit> within 5 minutes" | The Vercel build or publish failed (Vercel → `ensemble-node` → Deployments), or the `node` record no longer points at Vercel (§3) |
| Certificate error on `node.ensemblework.com` | The `node` record is proxied, or points somewhere other than Vercel's target |
| Browser console: CORS error on Ensemble's API | `ENSEMBLE_NODE_WEB_ORIGIN` missing or with a trailing slash on the API, or the API was not restarted |
| Sign-in succeeds but Node shows the landing page again | The cookie is not shared: check `ENSEMBLE_COOKIE_DOMAIN=ensemblework.com` |
| Provider sign-in lands on the Hub, not Node | `ENSEMBLE_NODE_WEB_ORIGIN` unset on the API |
| "Signup verification failed" on Node | The API does not have `ENSEMBLE_NODE_WEB_ORIGIN`, or the page was open too long (solve the check again) |
| "Verify your email to talk to nodes" | The account has not entered its code yet (`/welcome`) |
| Nodes answer "You've used this month's Ensemble credits" | The account's credits are spent, or the operator's ceiling paused included AI |
| Nodes never answer | `ENSEMBLE_NODE=off` on the API, or included AI is off and the account has no model of its own; the owner sees an error notice in the room |
| Run cards stay "Queued" | The paired computer is offline or its runner is stopped (`ensemble` → status) |

## 7. Moving Node to production

When Node's Ensemble changes are promoted from `testing` to `main` (Ensemble's `docs/36_WEB_TESTING.md`) and production runs them:

1. Vercel → `ensemble-node` → Settings → Environment Variables: `NEXT_PUBLIC_ENSEMBLE_API=https://api.ensemblework.com`, `NEXT_PUBLIC_ENSEMBLE_APP=https://app.ensemblework.com` (Production and Preview).
2. `gh variable set ENSEMBLE_API_URL -R ensemblework/ensemble-node --body https://api.ensemblework.com`.
3. Actions → deploy → Run workflow on `main`, so the build bakes in the new values.

Accounts and data stay where they are: test accounts do not move to production.
