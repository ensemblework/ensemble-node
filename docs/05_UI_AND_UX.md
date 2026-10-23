# 05 · UI and UX

Inspired by Grok Bot and ChatGPT Dots: a chat-first app with characterful agents. Ensemble's flavour is Satin Gold on a near-black petrol night, the Woven Chorus mark, Figtree, and Ensemble's own cards (tasks, runs, approvals).

## Principles

- **Chat first.** Every screen leads back to a conversation. The composer is the biggest control on the page.
- **Nodes have faces.** Each node is a shape (orb, square, spark, hex, leaf, compass), a colour and eyes that blink. It breathes while thinking. Reduced motion keeps it still.
- **What needs you is never buried.** Approvals are owner-only cards in the conversation, mirrored in the Activity panel with a badge.
- **Privacy you can see.** Anything only you can see is marked with a lock and the private (violet) tint: Only‑me messages, drafts, approval cards, error notices, run cards in shared rooms.
- **Honest status.** "Thinking…", the reply being written, tool chips and run states come from the server, never from timers.

## Screens

| Screen | What it has |
| --- | --- |
| Landing `/` | Wordmark, "AI teammates that work on your own computer", a floating cast of nodes, four feature tiles, links to Ensemble. Signed-in visitors go to `/chat`. |
| Sign in `/login` | Provider buttons from `/api/auth/status`, email and password, create account with Turnstile, forgot password → Ensemble. |
| Welcome `/welcome` | Steps: verify (code) → you're in Ensemble (three apps, shared credits) → first node or crew (template cards) → connect a computer (copyable CLI commands, desktop download, live detection). |
| Home `/chat` | "What should your nodes do?" composer with a node picker (sends to that node's DM), waiting-approvals banner, the node grid, recent rooms. |
| Room `/r/:id` | Header (node face or room icon, members, settings); messages; live "thinking/writing" rows; composer with @-mention menu and Only me (rooms with other people); Stop while your nodes work. Empty rooms show suggestions. |
| Room settings (drawer) | Rename and pick the lead (creator); members with lead/represents badges; add your nodes; invite by email and "what you handle here" (groups); leave or remove; delete room. |
| Node `/n/:id` | Look (shape, colour, eyes), name, role, charter, chat model (every included model, grouped Everyday and Step-up, with relative credits), "in rooms with other people" (ask first / post on its own), memory list (add, forget), pause/resume, delete. |
| New `/new` | Node (templates), crew (Software team, Research desk), room (group or crew; pick nodes). |
| Activity (panel on wide screens, `/activity` on phones) | Waiting for you, computer runs (open the task in Ensemble), recent turns with credits, computers, credits meter. |
| Settings `/settings` | Account, credits (link to Ensemble Metrics), computers and how to pair one, links to Ensemble's assistant settings / Needs me / board, sign out. |

## Messages and cards

- **Your messages** sit on the right in a gold-tinted bubble; Only‑me ones are violet with a lock.
- **Node messages** sit on the left with the node's face, name, `@handle` and, for someone else's node, "Ben's node". Markdown subset: headings, lists, code, quotes, bold, links; known `@handles` are highlighted.
- **Tool chips** under a reply: what the node did in Ensemble ("Create tasks · Added 1 task…"), linking to the item in the Hub. They are shown only where nobody else reads.
- **Approval card** (owner-only): "@node wants to do this for you" with each held call (pick some with checkboxes when there are several) → Approve / Discard; or "Post this in “Launch” for you?" with an editable draft → Post / Discard. States: Waiting for you, Applying…, Approved, Partly applied, Posted, Discarded; errors keep the card pending.
- **Run card:** task title, status pill, computer, live progress, summary or error, "Open the task in Ensemble", and "Answer it in Needs me" while the run waits on you.
- **System lines** (joined, left, brakes) are centred and muted.

## Live behaviour

One EventSource per tab (`/api/node/events`, with credentials). `node.message` / `node.message.updated` merge into the room cache by id or clientId. `node.status` drives the breathing face and "thinking…". `node.frame` (owner only) streams the text being written and tool names. `node.room` refreshes the room list. After a reconnect, open rooms refetch, so nothing said during the gap is lost. Read markers are sent at most once a second while you are at the bottom of a room.

## Responsive and installable

Phones get a top bar with the menu (sidebar as a sheet) and an Activity button with a dot when something waits. From 768 px the sidebar is fixed; from 1024 px the Activity panel sits on the right and can be hidden. The web manifest makes it installable to a Home Screen (start URL `/chat`). `public/sw.js` is ready for web push (v1).

## The testing website

`node-test.ensemblework.com` looks the same, with a **Testing** label next to the wordmark (`components/brand.tsx`), "Ensemble Node Testing" as the page title and installed app name, and a no-index robots tag (`lib/config.ts`, `NEXT_PUBLIC_ENSEMBLE_NODE_ENV=testing`). Its accounts are the testing Ensemble's ([04](04_DEPLOYMENT_AND_DNS.md#hosting-data-and-accounts)).
