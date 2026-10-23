# 04 · Environments, deployment and DNS

Ensemble Node has two environments, each tied to the matching Ensemble and never to the other one:

| | Testing | Production |
| --- | --- | --- |
| Branch | `testing`: where Node is developed | `main`: what people use |
| Website | `https://node-test.ensemblework.com`, Vercel project `ensemble-node-test`, marked **Testing** | `https://node.ensemblework.com`, Vercel project `ensemble-node` |
| Ensemble it uses | `api-test.ensemblework.com` and `test.ensemblework.com` (Ensemble's `testing` branch) | `api.ensemblework.com` and `app.ensemblework.com` (Ensemble's `main`) |
| CLI whose Node tab links here | `ensemble-test` | `ensemble` |
| Accounts, nodes, rooms, connections, computers, credits | Ensemble's testing database | Ensemble's production database |
| Workflow | `test-web.yml`: typecheck and unit tests, then publish (a few minutes) | `ci.yml` (typecheck, tests, build) then `deploy.yml` |
| Search engines | Not indexed | Indexed |

Nothing crosses over. An account, a session, a node or a paired computer of one environment does not exist in the other; the testing API's cookies have their own names (Ensemble's `ENSEMBLE_COOKIE_NAMESPACE=testing`). Each build checks its own settings: `next.config.ts` refuses a production build that names the testing API or Hub, and a testing build (`NEXT_PUBLIC_ENSEMBLE_NODE_ENV=testing`) that names anything else (`lib/environment.ts`). `/health` reports `environment`, and each workflow waits for its own.

```
 node-test.ensemblework.com ─► Vercel ensemble-node-test ─┐ browser calls, credentials: include
                                                          └► api-test.ensemblework.com ─► Ensemble's testing API (home server)
 node.ensemblework.com      ─► Vercel ensemble-node      ─┐
                                                          └► api.ensemblework.com      ─► Ensemble's production API (home server)
```

Each website has no server secrets and makes no server-side calls. Node keeps no files of its own: nodes, rooms and messages are rows in that Ensemble's Postgres. Node's backend is the `node` module of Ensemble's API, so each Node environment needs its Ensemble to have the matching module: Node `testing` follows Ensemble `testing`, and Node `main` follows Ensemble `main`.

## 1. Daily development (testing)

1. Branch from `testing`, open a pull request into `testing`: `test-web.yml` runs **Testing checks** (typecheck and unit tests). Or push to `testing` directly.
2. Every push to `testing` runs the checks, then builds that commit on Vercel (`vercel build` is a full production build of the site), publishes it to `ensemble-node-test`, waits until `https://node-test.ensemblework.com/health` reports the commit with `environment: testing`, and checks that Ensemble's testing API allows the site. Only the newest `testing` commit publishes.
3. Ensemble changes Node needs go to Ensemble's `testing` branch first (Ensemble's `docs/36_WEB_TESTING.md`); the testing API runs them within minutes.

Testing is shared integration work: a push can briefly interrupt the testing site. Sign in there with an account of `test.ensemblework.com`; the testing API offers email sign-up (Turnstile and a code by email) and no Google, Microsoft or GitHub sign-in.

## 2. Promotion to production

1. Promote Ensemble first: its `testing` → `main` pull request, merged and deployed, so the production API has every route the website needs.
2. Then open a pull request from Node's `testing` to `main`. It runs the full `ci.yml` (**Typecheck, tests and build**, required on `main`).
3. Merge. CI runs on `main`, then `deploy.yml` builds the commit, publishes it to `ensemble-node` (`vercel deploy --prebuilt --prod`, `.github/actions/vercel-deploy`), waits until `https://node.ensemblework.com/health` reports it with `environment: production` and `/`, `/login`, `/chat` and the manifest answer 200, and checks that the production API allows the site (a warning, never a failure). It skips a commit that is no longer the tip of `main`.
4. Merge `main` back into `testing`, so the next cycle starts from what was released. A production fix made on `main` is merged back into `testing` the same way.

Data never moves: testing accounts stay in testing and production accounts in production. To roll production back at once: Vercel → `ensemble-node` → Deployments → an earlier production deployment → **Instant Rollback**, then revert the change on `main` with a pull request.

## 3. Vercel

Both projects live in the account that owns `ensemble-app`, `ensemble-landing` and the domain `ensemblework.com`.

| Setting | `ensemble-node-test` | `ensemble-node` |
| --- | --- | --- |
| Root Directory | `apps/node-web`, files outside it included (the pnpm workspace is at the repository root) | same |
| Framework, Node.js, functions region | Next.js, 22.x, `bom1` (only `/health` is a function) | same |
| `NEXT_PUBLIC_ENSEMBLE_NODE_ENV` | `testing` | unset |
| `NEXT_PUBLIC_ENSEMBLE_API` | `https://api-test.ensemblework.com` | `https://api.ensemblework.com` |
| `NEXT_PUBLIC_ENSEMBLE_APP` | `https://test.ensemblework.com` | `https://app.ensemblework.com` |
| Domain | `node-test.ensemblework.com` | `node.ensemblework.com` |
| Deployment protection | Vercel Authentication except the custom domain | same |
| Git integration | Not connected; GitHub Actions publishes prebuilt output | same |

The environment variables apply to Production and Preview, and are baked into the browser bundle at build time: after changing one, run the project's workflow again (Actions → test-web on `testing`, or deploy on `main`). Preview URLs (`*.vercel.app`) cannot sign in, because Ensemble's APIs allow only the two domains.

| GitHub setting | Value |
| --- | --- |
| Secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` | A Vercel access token of that account, and its team id |
| Secrets `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_ID_TEST` | The `ensemble-node` and `ensemble-node-test` project ids |
| Variables `DEPLOY_ENABLED`, `TEST_DEPLOY_ENABLED` | `true`; anything else and that workflow does not publish |
| Variables `ENSEMBLE_API_URL`, `ENSEMBLE_TEST_API_URL` | `https://api.ensemblework.com`, `https://api-test.ensemblework.com`: the APIs each workflow checks |
| Variables `ENSEMBLE_NODE_URL`, `ENSEMBLE_NODE_TEST_URL` | Optional; default `https://node.ensemblework.com`, `https://node-test.ensemblework.com` |
| Branch protection | `main`: **Typecheck, tests and build** required, no force push or deletion. `testing`: no force push or deletion, no required checks |

To replace the token: Vercel → Account Settings → **Tokens** → Create (scope: the account above), then `gh secret set VERCEL_TOKEN -R ensemblework/ensemble-node`. Vercel's CLI cannot create tokens.

## 4. Cloudflare

| Name | Type | Target | Proxy |
| --- | --- | --- | --- |
| `node` | CNAME | `41da7d0c36baf7e2.vercel-dns-017.com` (Vercel → `ensemble-node` → Settings → Domains) | **DNS only** |
| `node-test` | CNAME | `57f2e0da5403081e.vercel-dns-017.com` (Vercel → `ensemble-node-test` → Settings → Domains) | **DNS only** |
| `app`, `test`, `www`, apex | Vercel records | | DNS only (Ensemble) |
| `api`, `api-test` | Tunnels `ensemble-home`, `ensemble-test` | | Proxied (Ensemble) |

Keep both Node records **DNS only**: Vercel issues and renews each certificate itself, and Cloudflare's proxy in front of Vercel would add a second cache and break issuance.

**Turnstile:** both websites use Ensemble's widget **Ensemble signup** through the API they talk to (the site key comes from `/api/auth/status`; the API checks the answer). The widget's hostname `ensemblework.com` covers `node.` and `node-test.`, so nothing needs adding.

**Google, Microsoft, GitHub sign-in:** production's callbacks are on `api.ensemblework.com`; Node starts them with `?return=node` and the API sends the person back to Node. The testing API has no provider sign-in.

## 5. Ensemble's APIs

Each API's env file names its own website:

| API | Env file on the home server | Value |
| --- | --- | --- |
| Testing | `~/ensemble-test/ensemble.env` | `ENSEMBLE_NODE_WEB_ORIGIN="https://node-test.ensemblework.com"` |
| Production | `~/ensemble-host/ensemble.env` | `ENSEMBLE_NODE_WEB_ORIGIN=https://node.ensemblework.com` |

With it, the API allows that origin for CORS with credentials, sends a provider sign-in started on Node back to it, accepts a Turnstile answer solved there for email sign-up (still checked with Cloudflare: success, the `signup` action and the host), and links the verification email of an account created there to its `/welcome`. Production refuses to start when the value is not one https origin that shares the session cookie (`ENSEMBLE_COOKIE_DOMAIN=ensemblework.com`).

Models and credits come from that Ensemble, so its Hub, CLI and Node always agree: a node can use every model in its `ENSEMBLE_INCLUDED_MODELS` (default `gpt-5-mini`), and every call spends the account's monthly Ensemble credits (20,000 by default), shared by every app of that environment. Ensemble's `docs/33_INCLUDED_AI.md` owns the details.

Check (replace `-test` with nothing for production):

```bash
curl -si -X OPTIONS https://api-test.ensemblework.com/api/node/bootstrap \
  -H 'Origin: https://node-test.ensemblework.com' -H 'Access-Control-Request-Method: GET' \
  | grep -i 'access-control-allow-origin'
# → access-control-allow-origin: https://node-test.ensemblework.com
curl -s https://api-test.ensemblework.com/api/node/bootstrap   # → 401 {"error":"Sign in to Ensemble first."}
```

## 6. Everyday checks

```bash
curl -s https://node-test.ensemblework.com/health        # commit, environment: testing
curl -s https://node.ensemblework.com/health             # commit, environment: production
gh run list -R ensemblework/ensemble-node -L 5           # test-web, ci, deploy
vercel ls ensemble-node-test; vercel ls ensemble-node
```

## 7. When something is off

| Symptom | Cause |
| --- | --- |
| A workflow: "Set the VERCEL_TOKEN repository secret" | The secret is missing (§3) |
| Vercel build: "Ensemble Node build settings: A … build …" | The project's `NEXT_PUBLIC_*` values name the other environment's Ensemble (§3) |
| A workflow: "did not report <commit> (testing/production) within 5 minutes" | The Vercel build or publish failed, or that domain's record no longer points at Vercel (§4) |
| Certificate error on `node.` or `node-test.` | The record is proxied, or points somewhere other than Vercel's target |
| Browser console: CORS error on Ensemble's API | That API's `ENSEMBLE_NODE_WEB_ORIGIN` is missing, names the other website, or has a trailing slash; or the API was not restarted |
| Sign-in succeeds but Node shows the landing page again | The cookie is not shared: check `ENSEMBLE_COOKIE_DOMAIN=ensemblework.com` |
| Provider sign-in lands on the Hub, not Node | `ENSEMBLE_NODE_WEB_ORIGIN` unset on that API |
| "Signup verification failed" on Node | The API does not have `ENSEMBLE_NODE_WEB_ORIGIN` for this website, or the page was open too long (solve the check again) |
| A route answers 404 on one website only | Node and Ensemble of that environment are not at matching branches (§2: promote Ensemble first) |
| "Verify your email to talk to nodes" | The account has not entered its code yet (`/welcome`) |
| Nodes answer "You've used this month's Ensemble credits" | The account's credits are spent, or the operator's ceiling paused included AI |
| Nodes never answer | `ENSEMBLE_NODE=off` on the API, or included AI is off and the account has no model of its own; the owner sees an error notice in the room |
| Run cards stay "Queued" | The paired computer is offline or its runner is stopped (`ensemble` or `ensemble-test` → status) |
