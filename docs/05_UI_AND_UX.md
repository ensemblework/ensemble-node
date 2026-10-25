# 05 · UI and UX

Inspired by Grok Bot and ChatGPT Dots: a chat-first app with characterful agents. Ensemble's flavour is Satin Gold on a near-black petrol night, the Woven Chorus mark, Figtree, and Ensemble's own cards (tasks, runs, approvals).

## Principles

- **Chat first.** Every screen leads back to a conversation. The composer is the biggest control on the page.
- **Nodes have faces.** Each node is a shape (orb, square, spark, hex, leaf, compass), a colour and eyes that blink. It breathes while thinking. Reduced motion keeps it still.
- **What needs you is never buried.** Approvals are owner-only cards in the conversation, mirrored in the Activity panel with a badge.
- **Privacy you can see.** Anything only you can see is marked with a lock and the private (violet) tint: Only‑me messages, drafts, approval cards, error notices, run cards in shared rooms.
- **Honest status.** "Thinking…", the reply being written, tool chips and run states come from the server, never from timers.

## Conversations

| Kind | Who is in it | Made from |
| --- | --- | --- |
| Direct chat (DM) | You and one of your nodes | Every node gets one when it is made |
| Crew | You and nodes you pick (up to 24), one of them the lead | New → Crew |
| Room | You and other people (up to 10, counting open requests), each bringing 1–3 of their own nodes, one of them their lead | New → Room, then requests to join |

## Screens

| Screen | What it has |
| --- | --- |
| Landing `/` | Wordmark, "AI teammates that work on your own computer", a floating cast of nodes, four feature tiles, and a line on accounts: an existing Ensemble account is used as it is (connected apps, computers, trusted folders, credits); signing up on Node creates the Ensemble account. Signed-in visitors go to `/chat`. |
| Sign in `/login` | Provider buttons from `/api/auth/status`, email and password, create account with Turnstile, forgot password → Ensemble. |
| Welcome `/welcome` | Steps: verify (code) → you're in Ensemble (one account, the three apps, shared credits) → first node or a crew suggestion → connect a computer (a sentence and links to Ensemble's pairing page and the download, live detection, open requests to join). |
| Home `/chat` | "What should your nodes do?" composer with a node picker (sends to that node's DM), requests-to-join and waiting-approvals banners, the node grid (role and model), recent conversations. |
| Room `/r/:id` | Header (node face or room icon, members; in a DM the node's model as a menu), search, the More menu (show everything / people only / nodes only / mentions of me, pinned messages, export, settings), the pinned bar, messages with day labels and a "New messages" divider, live "thinking/writing" rows, a jump-to-latest button with a count, the composer. |
| Settings drawer | DM: the node's model and a link to its page. Crew: rename, every node with Lead, Make lead and Remove, all your nodes with Add. Room: rename (creator), each person with their nodes (only public fields for other people's), your lead and Make lead, add up to 3 of yours, remove (never your last one: leave instead), "what you handle here", requests to join (creator: invite by email, pending / accepted / declined with "ask again after", Withdraw), leave or delete. Export as Markdown. |
| Node `/n/:id` | Look (shape, colour, eyes), name (unique among your nodes), role, charter; then, saved as they change: chat model, "Read files on my computer" (off by default), "in rooms with other people" (ask first / post on its own); memory list (add, forget), pause/resume, delete. |
| New `/new` | Node (template, name, role, model). Crew: name, a suggestion that fills in proposed new nodes (rename, change role and model, remove, "Add a node", "Use your Manager instead"), your existing nodes as checkboxes, one lead across both. Room: name, 1–3 of your nodes and your lead, emails as chips (up to 9), then the result for each email. |
| Requests `/requests` | Requests to join rooms: room, who asked, how many people. Accept → pick 1–3 nodes and a lead; Decline. Live, with a badge in the sidebar. |
| Search `/search`, ⌘K / Ctrl+K | Every conversation, or one (the room's search button). Every word must match; All / People / Nodes. A result opens the conversation at that message, loading earlier pages when needed, and highlights it. |
| Computers & Needs me `/computers` | Ensemble's Needs me: run approvals (Approve / Reject) and questions from agents (Allow once / Deny; risky ones ask to confirm first; ones with answer options, or that only that computer may approve, link to Ensemble), your nodes' approval cards. Paired computers with their shared folders; links to pair one in Ensemble. |
| Connections `/connections` | What is connected in Ensemble (connected as…, needs consent, error, public data only) and what can be connected, with Manage / Connect opening Ensemble. Nodes read everything connected and write only after approval. |
| Activity (panel on wide screens, `/activity` on phones) | Waiting for you, computer runs (open the task in Ensemble), recent turns with credits, computers, credits meter. |
| Settings `/settings` | Account (it is the Ensemble account, used as is), credits, links to Computers & Needs me, Connections, Requests and Search, computers, links to Ensemble's settings, sign out. |

The sidebar holds Search, Direct chats, Crews and Rooms (each with a + to make one), then Requests to join and Computers & Needs me (both with badges), Connections and Settings. A DM row's tooltip names the node's model.

## The model picker

One picker everywhere a model is chosen: new nodes, new nodes in a crew, the node page, and the DM header's model menu. Groups: **Included with Ensemble** (Everyday and Step-up, with relative credits), **Your API keys** (per provider), **Your AI plans on ‹computer›**. The bootstrap carries the included models, so the picker opens at once; own keys and AI plans come from `/api/node/models` when it opens. A filter box appears for long lists, and the server's problems show at the bottom.

## Messages and cards

- **Your messages** sit on the right in a gold-tinted bubble; Only‑me ones are violet with a lock.
- **Node messages** sit on the left with the node's face, name, `@handle` and, for someone else's node, "Ben's node". Markdown subset: headings, lists, code, quotes, bold, links; known `@handles` are highlighted.
- **Message actions** appear on hover or focus, or after a long press on a phone: react (the eight reactions), reply, copy, pin or unpin (only messages everyone in the room can read), delete (your own). Reactions show under the message with counts; yours are highlighted and the tooltip names who reacted.
- **Replies** quote the original above the message; the quote goes to it. While you reply to a private message, the composer is Only me.
- **Deleted messages** read "Message deleted".
- **Tool chips** under a reply: what the node did in Ensemble ("Create tasks · Added 1 task…"), linking to the item in the Hub. They are shown only where nobody else reads.
- **Approval card** (owner-only): "@node wants to do this for you" with each held call (pick some with checkboxes when there are several) → Approve / Discard; or "Post this in “Launch” for you?" with an editable draft → Post / Discard. States: Waiting for you, Applying…, Approved, Partly applied, Posted, Discarded; errors keep the card pending.
- **Run card:** task title, status pill, computer, live progress, summary or error, "Open the task in Ensemble", and "Answer it in Needs me" while the run waits on you.
- **System lines** (joined, left, brakes) are centred and muted.

## Live behaviour

One EventSource per tab (`/api/node/events`, with credentials). `node.message` / `node.message.updated` merge into every loaded list of that room by id or clientId (reactions and deletes arrive this way too). `node.status` drives the breathing face and "thinking…". `node.frame` (owner only) streams the text being written and tool names; `lib/live.ts` buffers the text and applies it once per animation frame, re-rendering only that room, while the busy faces in the sidebar and start page change only when a node starts or stops thinking. `node.room` refreshes the conversation list and pins. `node.invite` refreshes requests to join. `node.needs` re-reads Needs me (run approvals and agents' questions) at once; its 60-second poll is the fallback. After a reconnect, open conversations and Needs me refetch, so nothing said during the gap is lost; earlier pages stay loaded. Read markers are sent at most once a second while you are at the bottom of a conversation.

## Links

Links that leave Node (Ensemble, ensemblework.com, vendors, links in messages) open in a new tab. Sign-in with a provider stays in the same tab, because it returns to Node.

## Responsive and installable

Phones get a top bar with the menu (sidebar as a sheet, with a dot when requests or Needs me wait), Search, and an Activity button with a dot when something waits. From 768 px the sidebar is fixed; from 1024 px the Activity panel sits on the right and can be hidden. The web manifest makes it installable to a Home Screen (start URL `/chat`). `public/sw.js` is ready for web push (v1).

## The testing website

`node-test.ensemblework.com` looks the same, with a **Testing** label next to the wordmark (`components/brand.tsx`), "Ensemble Node Testing" as the page title and installed app name, and a no-index robots tag (`lib/config.ts`, `NEXT_PUBLIC_ENSEMBLE_NODE_ENV=testing`). Its links into Ensemble open the testing Hub, "Download Ensemble" opens the testing CLI's `cli-testing-latest` release, and the computer commands it shows name the testing CLI (`ensemble-test browse on`; `CLI_COMMAND` and `ENSEMBLE_LINKS` in `lib/config.ts`). Its accounts are the testing Ensemble's ([04](04_DEPLOYMENT_AND_DNS.md#hosting-data-and-accounts)).
