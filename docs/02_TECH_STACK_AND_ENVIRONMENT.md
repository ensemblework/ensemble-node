# 02 · Tech stack and environment

## Stack

| Part | Choice |
| --- | --- |
| Website | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS 3, TanStack Query 5, lucide-react. The same majors as Ensemble's Hub. |
| Fonts and brand | Figtree and JetBrains Mono. Ensemble's Woven Chorus mark (`public/brand/`, copied from Ensemble's `packages/brand/assets`). Satin Gold `#D7B56F` on a near-black petrol night; Ensemble's warm paper in light mode. |
| Backend | Ensemble hub-api (Fastify 5, Prisma 6, PostgreSQL, Redis) — module `src/node/` in the Ensemble repository |
| Live updates | Server-sent events from `GET /api/node/events` (EventSource with credentials) |
| Models | Ensemble's included AI (Azure AI Foundry): gpt-5-mini by default |
| Package manager / runtime | pnpm 12, Node 22 |

The website has no server logic beyond `/health` (the commit it serves): every page is a client of Ensemble's API. Production runs `next start` on the home server ([04](04_DEPLOYMENT_AND_DNS.md)).

## Environment

The website needs two public values, baked in at build time:

| Variable | Production | Local |
| --- | --- | --- |
| `NEXT_PUBLIC_ENSEMBLE_API` | `https://api.ensemblework.com` | `http://localhost:4000` (default) |
| `NEXT_PUBLIC_ENSEMBLE_APP` | `https://app.ensemblework.com` | `http://localhost:3000` (default) |

On the home server they live in `~/ensemble-node-host/node-web.env` with the website's other settings ([04 §2](04_DEPLOYMENT_AND_DNS.md#2-on-the-server)).

Ensemble's API needs (in `~/ensemble-host/ensemble.env` on the home server, or `.env` locally):

| Variable | Value | Why |
| --- | --- | --- |
| `ENSEMBLE_NODE_WEB_ORIGIN` | `https://node.ensemblework.com` (local: `http://localhost:3300`) | CORS allowlist and the return after a provider sign-in. Production refuses a value that is not https or cannot share the cookie. |
| `ENSEMBLE_COOKIE_DOMAIN` | `ensemblework.com` (already set) | One session for app., node. and api. |
| `ENSEMBLE_INCLUDED_MODELS` | Ensemble's list (includes `gpt-5-mini`) | The Azure AI Foundry deployments Ensemble offers; Node defaults to gpt-5-mini |
| `ENSEMBLE_INCLUDED_MONTHLY_CREDITS` | `20000` (default) | Per account per month, shared by all three apps |
| `ENSEMBLE_NODE` | unset (on) | `off` stops node turns and run reports |
| `ENSEMBLE_NODE_PARALLEL` | `4` (default) | Node turns at once per API process |

## Local development

Use `localhost` everywhere (not `127.0.0.1`): the browser keeps one host-only session cookie for `localhost` across ports.

1. In the Ensemble checkout, on a branch with the Node module (`feat/ensemble-node-v0` until merged):
   ```bash
   # ../ensemble/.env
   ENSEMBLE_NODE_WEB_ORIGIN=http://localhost:3300
   pnpm install && pnpm db:migrate && pnpm dev      # API on :4000, Hub on :3000
   ```
   With no included AI configured locally, nodes use your own model key's medium tier (Ensemble → Settings → Models). Sign-up locally needs no email or Turnstile.
2. Here:
   ```bash
   pnpm install
   pnpm dev            # http://localhost:3300
   ```
3. Open `http://localhost:3300`, create an account, make a node.

To try computer work, pair your machine against the local API (`ensemble login` with `ENSEMBLE_API_URL=http://localhost:4000`) and give the node a task to assign.

## Commands

```bash
pnpm dev          # website on :3300
pnpm typecheck
pnpm test         # node --test via tsx: lib/*.test.ts (text, markdown helpers)
pnpm build        # next build
pnpm start        # serve the build on :3300
```

Backend checks live in Ensemble: `pnpm --filter @ensemble/hub-api test:public` (includes `src/node/*.test.ts`), `pnpm --filter ensemblework test` (CLI, Node tab).

## CI and deploys

`.github/workflows/ci.yml` runs on every pull request and push to `main`: **Typecheck, tests and build** (install, typecheck, unit tests, `next build`) and **Home server scripts** (ShellCheck on `infra/deploy/home/*.sh` and the compose file). Both are required on `main`.

`.github/workflows/deploy.yml` runs when CI passes on `main`: it fast-forwards `production`, the home server builds and serves it within a couple of minutes, and the workflow waits until `https://node.ensemblework.com/health` reports the commit ([04 §3](04_DEPLOYMENT_AND_DNS.md#3-how-a-deploy-reaches-the-server)).
