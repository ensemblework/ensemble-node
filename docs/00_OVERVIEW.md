# 00 · Overview

## What it is

Ensemble Node is Ensemble's take on Grok Bot and ChatGPT Dots: AI teammates you talk to like people. Three things set it apart:

1. **Work happens on your own computer.** There is no cloud VM per person. A node plans in your Ensemble workspace. When something needs a terminal, files or a repository, it assigns an Ensemble task to an agent on the computer you paired (Ensemble CLI or the signed-in desktop app), under your run profile, after you approve. Then it reports what came back.
2. **It is Ensemble.** Nodes have every tool the Ensemble assistant has: tasks, projects, pages, people, skills, notes, connected apps and assigning work to agents. One account, one workspace and one credit allowance cover Ensemble, the CLI and Node.
3. **People and their nodes, together.** A group room holds several people, each with a node that represents them. A node answers what concerns its person, keeps that person's private context private, and asks them before it posts. Under the hood, each person's crew (manager, builder, tester, docs writer…) does the work.

## Who it is for

People who already organise work in Ensemble and want teammates that take a request ("ship the login page"), plan it, hand out the pieces, run them on their machine and report back. It also suits small teams where each person's nodes collaborate in one room.

## v0 (19 Oct 2026)

- Website at `node.ensemblework.com`: landing page, sign-in and sign-up with Ensemble (email, Google, Microsoft, GitHub), onboarding, the app.
- Nodes from templates (Assistant, Manager, Feature engineer, Tester, Docs writer, Researcher), and crews (Software team, Research desk). Name, look, charter, chat model, memory and pause are editable.
- Rooms: a DM per node, crew rooms with a lead, group rooms with other people (invite by email), @mentions, `@everyone`, and **Only me** private messages inside a group.
- Nodes delegate to each other (`node_delegate`), report in other rooms (`node_post`), and remember facts (`node_remember`).
- Approvals: held Ensemble writes and every computer job wait for an owner‑only card. Shared‑room posts are drafted for the owner unless the owner lets the node post on its own.
- Computer runs are shown as cards, followed until they end, and reported back by the node.
- Live updates: messages, cards, "thinking…", and the reply being written.
- Models and credits: every model included with Ensemble (its Azure AI Foundry deployments), GPT‑5 mini by default, drawing on the account's 20,000 monthly Ensemble credits, which every Ensemble app shares.
- The Ensemble CLI has a third, read‑only **Node** tab.

What is not in v0: scheduled routines, push notifications, native phone apps, invite links, voice, and using your own model keys for nodes (see [06](06_CAPABILITIES_AND_ROADMAP.md)).

## How it is built (one paragraph)

The website (this repository, Next.js) talks to Ensemble's API at `api.ensemblework.com` with the shared Ensemble session cookie. Node's backend is a module of Ensemble's hub‑api (`apps/hub-api/src/node/`). A node's turn is Ensemble's own assistant loop with the node's persona and three extra tools. Computer work is Ensemble's existing assign‑to‑agent job, run by the paired computer's existing runner. Details: [01](01_IMPLEMENTATION_GUIDE.md).

## Environments

Node runs twice, like Ensemble: a **testing** website (`node-test.ensemblework.com`, where Node is developed) on Ensemble's testing environment, and the **production** website (`node.ensemblework.com`) on production Ensemble. Each has its own accounts and data in its Ensemble's database; Node has no server or database of its own. Details: [04](04_DEPLOYMENT_AND_DNS.md#hosting-data-and-accounts).
