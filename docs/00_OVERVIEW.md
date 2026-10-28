# 00 · Overview

## What it is

Ensemble Node is Ensemble's take on Grok Bot and ChatGPT Dots: AI teammates you talk to like people. Three things set it apart:

1. **Work happens on your own computer.** There is no cloud VM per person. A node plans in your Ensemble workspace. When something needs a terminal, files or a repository, it assigns an Ensemble task to an agent on the computer you paired (Ensemble CLI or the signed-in desktop app), under your run profile, after you approve. Then it reports what came back.
2. **It is Ensemble.** Nodes have every tool the Ensemble assistant has: tasks, projects, pages, people, skills, notes, connected apps and assigning work to agents. One account, one workspace and one credit allowance cover Ensemble, the CLI and Node.
3. **People and their nodes, together.** A room holds up to 10 people, each bringing 1–3 of their own nodes, one of them their lead. A lead answers what concerns its person, keeps that person's private context private, and asks them before it posts. Under the hood, each person's crew (manager, builder, tester, docs writer…) does the work.

## Who it is for

People who already organise work in Ensemble and want teammates that take a request ("ship the login page"), plan it, hand out the pieces, run them on their machine and report back. It also suits small teams where each person's nodes collaborate in one room.

## v0 (19 Oct 2026)

- Website at `node.ensemblework.com`: landing page, sign-in and sign-up with Ensemble (email, Google, Microsoft, GitHub), onboarding, the app. It runs on the Ensemble account as it is: its connected apps, paired computers, trusted folders and credits. Signing up on Node creates the Ensemble account.
- Nodes from templates (Assistant, Manager, Feature engineer, Tester, Docs writer, Researcher). One settings place per node, opened from its chat: name (unique per account), handle, role, signature avatar (shape, colour and eyes), chat model, instructions, permissions, memory, pause, export and delete. The chat model shows only there. Pausing stops everything the node is doing, its computer runs included, and it says what it stopped; its owner's next message to it, or Resume, wakes it. Nodes keep their own signature faces; model pickers and agent runs use vendor marks. A node may read files in the folders its owner's paired computer shares with Ensemble, read-only and only when the owner turns it on.
- Three kinds of conversation: a **DM** per node; a **crew** (you and nodes you pick, with a lead; suggestions such as Software team fill in new nodes you can rename, drop or add to); a **room** with other people, who answer a request to join and bring 1–3 of their own nodes, one of them their lead. @mentions, `@everyone`, and **Only me** private messages in rooms.
- Chat tools: search in one conversation or all of them (⌘K), people only / nodes only / mentions of me, pins, reactions, replies, deleting your own messages, copy, export as Markdown, and retrying or editing a message that was not sent.
- Files on messages: up to 8 per message, uploaded from the computer (drop, paste or pick) into the person's Ensemble Files or chosen from them. A node reads the files on its owner's messages, pictures too when its model sees images; other people's files are only names to it.
- Nodes delegate to each other (`node_delegate`), report in other rooms (`node_post`), and remember facts (`node_remember`).
- Who does the work: the node you talk to does quick work itself (look-ups, searches, short reports), sends coding and long work to an agent session on your computer, and brings in a **temporary helper** for a side task that should be independent of it (an audit, a second opinion). A helper works in its own read-only room (you read along; it talks only to the node that made it, which tells you), only reads, and goes after 3 quiet days. Asked to, a node also makes you a lasting node (with its own chat in your sidebar) or a crew.
- Secrets: when work needs an API key or token, the node asks for it by name in a **secure box** on a card (in the chat or Needs me). What you type goes straight to your computer, which keeps it encrypted and gives it to its agent runs as `$NAME`; no node, model or Ensemble server ever sees or keeps the value.
- Work on your computer: a node is a controller of your own coding agents (Claude Code, Codex, Cursor, GitHub Copilot and the rest) on your paired computer and your own subscription. It starts an agent session, sends it the next message (after the current work, as a change to it, or instead of it), stops it, and tells you what each of its sessions did. It picks the session itself, keeping one line of work in one session so the agent remembers it and its provider's cache saves cost. A node only ever uses its own sessions. This work stays off your Ensemble board unless you ask for a task there.
- Approvals: held Ensemble writes wait for an owner‑only card. Work on your computer starts when you ask, or waits for a card when you set the node to Ask me first; requests from other people always wait. Shared‑room posts are drafted for the owner unless the owner lets the node post on its own.
- Computer runs are shown as live cards with the engine's work log (commands, edits, output), a Stop button, the run's questions answered in place, and whether it is queued, updated or replaced; they are followed until they end and reported back by the node.
- Live updates: messages, cards, "thinking…", and the reply being written.
- Chat navigation: one latest-message list across DMs, crews and rooms, All/Unread/Groups filters, a collapsible desktop rail and phone chat sheet. Incoming messages do not interrupt reading older work; text drafts keep their private state while switching chats. Details: [05](05_UI_AND_UX.md).
- Models and credits: every model a node can use, in one picker: those included with Ensemble (its Azure AI Foundry deployments, drawing on the account's 20,000 monthly credits, which every Ensemble app shares), models on the account's own API keys, and AI plans on a paired computer. A fast model by default (GPT‑6 Luna, else GPT‑5 mini) at low thinking, which each node's settings can turn up.
- Needs me: the same list as in Ensemble and the CLI: your nodes' requests, run approvals, agents' questions and board tasks waiting for you, answered in place.
- Ensemble from Node: paired computers with their shared folders (in Settings) and connected apps. Pairing a computer and connecting an app open Ensemble in a new tab.
- The Ensemble CLI has a third, read‑only **Node** tab.

What is not in v0: scheduled routines, push notifications, native phone apps, invite links, threads and voice (see [06](06_CAPABILITIES_AND_ROADMAP.md)).

## How it is built (one paragraph)

The website (this repository, Next.js) talks to Ensemble's API at `api.ensemblework.com` with the shared Ensemble session cookie. Node's backend is a module of Ensemble's hub‑api (`apps/hub-api/src/node/`). A node's turn is Ensemble's own assistant loop with the node's persona and Node's own tools (delegate, post, remember, read shared files). Computer work is Ensemble's existing assign‑to‑agent job, run by the paired computer's existing runner. Details: [01](01_IMPLEMENTATION_GUIDE.md).

## Environments

Node runs twice, like Ensemble: a **testing** website (`node-test.ensemblework.com`, where Node is developed) on Ensemble's testing environment, and the **production** website (`node.ensemblework.com`) on production Ensemble. Each has its own accounts and data in its Ensemble's database; Node has no server or database of its own. Details: [04](04_DEPLOYMENT_AND_DNS.md#hosting-data-and-accounts).
