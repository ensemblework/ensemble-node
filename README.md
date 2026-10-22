# Ensemble Node

AI teammates that work on your own computer. Talk to your nodes alone, in a crew, or in rooms with your people and their nodes. They plan in your [Ensemble](https://app.ensemblework.com) workspace and run real work on the computer you pair, through the Ensemble CLI or desktop app.

This repository is the website, served at `node.ensemblework.com` from Vercel: merge to `main`, CI passes, and the `deploy` workflow publishes it ([deployment](docs/04_DEPLOYMENT_AND_DNS.md)). Node's backend is a module of Ensemble's API (`ensemblework/ensemble`, `apps/hub-api/src/node`), so Node shares Ensemble's sign-in, workspace, tools, computer jobs and credits.

## Quick start

```bash
pnpm install
pnpm dev                 # http://localhost:3300, talks to Ensemble's API at http://localhost:4000
```

Run Ensemble locally with `ENSEMBLE_NODE_WEB_ORIGIN=http://localhost:3300` in its `.env` ([docs/02](docs/02_TECH_STACK_AND_ENVIRONMENT.md#local-development)).

| Command | What |
| --- | --- |
| `pnpm dev` | Website on :3300 |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Unit tests |
| `pnpm build` / `pnpm start` | Production build / serve it |

Environment: `NEXT_PUBLIC_ENSEMBLE_API` (default `http://localhost:4000`) and `NEXT_PUBLIC_ENSEMBLE_APP` (default `http://localhost:3000`). See `.env.example`.

## Docs

Start at [docs/README.md](docs/README.md): overview, implementation guide, environment, structure, [deployment and DNS](docs/04_DEPLOYMENT_AND_DNS.md), UI, capabilities and roadmap.
