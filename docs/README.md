# Ensemble Node documentation

Ensemble Node is a website for persistent AI teammates ("nodes"). You talk to them alone, in a crew of your own nodes, or in rooms with other people and their nodes. Nodes act in your Ensemble workspace and run real work on your own paired computer. This repository holds the website. The backend is part of Ensemble's API.

| Guide | Contents |
| --- | --- |
| [00 · Overview](00_OVERVIEW.md) | What Node is, who it is for, what v0 does |
| [01 · Implementation guide](01_IMPLEMENTATION_GUIDE.md) | Architecture, what is reused from Ensemble, the main flows, safety rules, phases, risks |
| [02 · Tech stack and environment](02_TECH_STACK_AND_ENVIRONMENT.md) | Stack, env vars, local development with Ensemble, commands, CI |
| [03 · Repository structure](03_REPOSITORY_STRUCTURE.md) | Folders and where a change belongs |
| [04 · Environments, deployment and DNS](04_DEPLOYMENT_AND_DNS.md) | Testing (`node-test.`) and production (`node.`): branches, promotion, Vercel, CI and deploys, Cloudflare DNS, Turnstile, Ensemble's API settings, checks |
| [05 · UI and UX](05_UI_AND_UX.md) | Screens, cards, live updates, look and feel |
| [06 · Capabilities and roadmap](06_CAPABILITIES_AND_ROADMAP.md) | Grok Bot / ChatGPT Dots parity, where Node goes further, ideas backlog |

The backend's own guide is Ensemble's [`docs/35_ENSEMBLE_NODE.md`](https://github.com/ensemblework/ensemble/blob/main/docs/35_ENSEMBLE_NODE.md): routes, tables, routing, node turns, approvals, runs and tests.

- [`research/`](research/): Grok Bot, ChatGPT Dots, the 2026 landscape and Ensemble foundations, as studied on 19 Oct 2026.
- [`design/pre-v0/`](design/pre-v0/): the first plan, written for a separate Node API. Superseded by v0's architecture, but kept for its ideas (autonomy levels, plans, routines, skills, peer requests).
