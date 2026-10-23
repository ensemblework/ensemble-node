# 01 · Implementation guide

Status: v0 implemented, 19 Oct 2026. Backend: Ensemble branch `feat/ensemble-node-v0` (hub‑api `src/node/`, migration `20261019120000_ensemble_node`, CLI Node tab, docs/35). Website: this repository.

## 1. Goal and rules

Give every Ensemble account persistent AI teammates that (a) talk in DMs, crews and multi‑person rooms, (b) act in the account's Ensemble workspace as well as the Ensemble assistant does, and (c) do heavy work on the account's own paired computer. Combined, that means at least Grok Bot plus ChatGPT Dots, with better task management and delegation.

Rules that do not bend:

1. **Nothing executes on Ensemble's servers for Node.** Shell, files and repositories mean an Ensemble job on the owner's paired computer.
2. **Narrow, never widen.** Node adds checks on top of Ensemble's write policy, run profiles and sandbox. It never bypasses them.
3. **Visibility is a security boundary.** Every message read is filtered by room membership and `visible_to`. A node's prompt holds only what its owner may see. A node's shared‑thread prompt holds only what everyone in the room may see.
4. **Instructions come only from a node's owner.** Messages from other people, from other people's nodes, tool results and pages are data. A turn started by anyone else holds every write for the owner. A message descended from such a turn carries the taint.
5. **Approvals are exact and settle once.** The owner approves the exact calls or exact words. The card moves from pending to applying once, and held calls are applied by Ensemble's own Apply route.
6. **Reuse Ensemble.** If Ensemble already does it (assistant tools, skills/playbooks, assign‑to‑agent, job queue, device protocol, Needs me, credits, auth), Node calls it rather than rebuilding it.

## 2. Architecture

```
 node.ensemblework.com (this repo, Next.js on Vercel)
        │  fetch + EventSource, credentials: include (Ensemble session cookie, Domain=ensemblework.com)
        ▼
 api.ensemblework.com  ── Ensemble hub-api (one process, one Postgres, one Redis)
        ├─ /api/auth/*            existing sign-in, sign-up, verification, OAuth (?return=node)
        ├─ /api/node/*            Node module: nodes, rooms, messages, approvals, runs, SSE   (hub-api src/node)
        │     └─ node turn  ──►  runAssistantTurn (assistant/agent.ts): every Hub tool + node tools
        │                          ├─ Hub writes (tasks, pages, projects…) ── owner's write policy
        │                          └─ hub_assign_to_agent ── always held ── WorkspaceJob
        ├─ /api/bridge/node       read-only overview for the CLI's Node tab
        └─ included AI (Azure AI Foundry; nodes default to gpt-5-mini) ── 20,000 credits / account / month
                                     ▲
 paired computer: Ensemble CLI or desktop app (synced) ── device token ── claims the job, runs Claude Code / Codex / Cursor / Ensemble's agent in its sandbox
```

### Why the backend lives inside Ensemble

The first plan ([design/pre-v0](design/pre-v0/)) had its own API, database and an "Ensemble client" talking to Ensemble over a dozen new endpoints (E1–E12). For v0 we put Node into hub‑api instead:

| Concern | Separate Node API | Node module in hub‑api (chosen) |
| --- | --- | --- |
| Sign-in | New OAuth server in Ensemble, token exchange, second session | Same session cookie; Node is just another allowed origin |
| Credits | New "model turn" relay with metering | Already metered per account; Node's calls are ordinary included calls |
| Tools | Re‑expose ~100 assistant tools over HTTP | Call `runAssistantTurn` with the node's persona |
| Assign to agent | New job API, webhooks back to Node | Same `hub_assign_to_agent`; watch `WorkspaceJob` rows |
| Ops | Second API service, database, backups | Nothing new in the API; one env var |
| Cost | Separate small model calls through a relay | Same included models, same budget |

The cost is coupling: Node's backend ships with Ensemble's releases and must follow Ensemble's `AGENTS.md`. That is acceptable while one team builds both. If Node later needs its own scale or tenancy, the `/api/node/*` contract is the seam to split along.

## 3. What Node reuses

| Ensemble piece | How Node uses it |
| --- | --- |
| Accounts, sessions, OAuth, email verification, Turnstile | Sign-in and sign-up on Node call the same routes. `?return=node` brings a provider sign-in back to Node. |
| Session cookie on `ensemblework.com` + CORS allowlist | `ENSEMBLE_NODE_WEB_ORIGIN` joins the allowlist (production refuses it unless it is https and shares the cookie domain). |
| Assistant loop (`runAssistantTurn`), tools, playbooks/skills, write policy, Apply, undo, ledger | A node turn is an assistant turn in the owner's space with `agentPersona`, `extraTools` and `purpose: "Ensemble Node"`. Held calls are applied through `POST /api/assistant/apply`. |
| `hub_assign_to_agent`, run profiles, `WorkspaceJob`, device protocol, sandbox, Needs me | Computer work is exactly an Ensemble assignment. Node only adds the run card and the report afterwards. |
| Included AI and credits (`includedUsage`, `assertIncludedOpen`) | Node turns and room routing are included calls on the owner's/author's account. One allowance across all three apps. |
| Account export and deletion (generic over `userId`) | Every Node table has `user_id`, so export and erasure cover it. |
| Sharing policy classes | `/api/node/*` is `personal`: it acts for the signed-in account whichever space is open. |
| CLI device login (`bridge` key) and TUI | The Node tab reads `GET /api/bridge/node` with the key the CLI already has. |
| Needs me, paired computers, connected apps | The website reads `GET /api/approvals`, `GET /api/decisions?status=pending`, `GET /api/devices`, `GET /api/connectors/catalog` and `GET /api/mcp-connections`, and answers Needs me with Ensemble's own `POST /api/approvals/:id/decide` and `POST /api/decisions/:id/decide`. Pairing a computer and connecting an app happen in Ensemble (links open in a new tab). |

## 4. Flows

### 4.1 Sign-up, sign-in, one account

- **New on Node:** `/login?mode=signup` posts to `/api/auth/signup` (name, email, password, Turnstile token when configured). This *is* an Ensemble account. `/welcome` explains that, verifies the email with the 6‑digit code when the server requires it, and continues to the first node.
- **Existing Ensemble user:** sign in with email or a provider. Providers go through `/api/auth/oauth/:provider/start?return=node`. The callback stays on the API host (no provider console change) and returns to Node's `/welcome` (new account) or `/`. Node uses the account as it is: its connected apps, paired computers, trusted folders, run profiles and credits. Nothing is copied.
- **Later on Ensemble or the CLI:** same account and session. The Hub may ask a Node‑made account to finish its profile once. The CLI's `ensemble login` approves in the browser as the same account and pairs the computer.
- Signing out on Node signs out of Ensemble in that browser (one cookie).

### 4.2 Onboarding

`/welcome`: verify (if needed) → "You're in Ensemble" (one account, the three apps, the shared credits) → first node or a crew suggestion → connect a computer. Node has no install guide: the step links to Ensemble's page for pairing a computer (`/settings?tab=account#this-mac`) and to `ensemblework.com/download`, both in a new tab. The page polls until a computer shows up, then opens the new DM or crew.

### 4.3 A DM turn

1. Mira writes in her Assistant's DM → `POST /api/node/rooms/:id/messages` (verified email required on the hosted server).
2. Routing: in a DM, the room's node answers. A `node_turns` row is queued; turns run one at a time per node.
3. The turn reads the room's new messages into the node's own assistant conversation and calls `runAssistantTurn` with gpt‑5‑mini. The model uses Hub tools (create tasks, update pages, read projects…) in Mira's space.
4. The reply is posted with tool chips. Held writes become an owner‑only approval card. The page streams "thinking…" and the text as it is written.

### 4.4 A crew delegates

Mira makes the crew "Software team" on New → Crew. The suggestion fills in a manager, a feature engineer, a tester and a docs writer as new nodes; she renames one, drops the docs writer, ticks the Tester she already has, and keeps the manager as lead. The website creates each new node (`POST /api/node/nodes`, names unique per account; a clash shows next to that row), then the crew (`POST /api/node/crews {title, nodeIds, leadNodeId}`).

Mira writes "Plan the login page and hand out the work" in the crew. The lead (`@manager`) plans in Ensemble, then calls `node_delegate {to: "builder", brief}` and `{to: "tester", brief}`. Each brief is a message that mentions the node, which wakes it. Workers do their part: Hub writes, or `hub_assign_to_agent` for work on Mira's laptop, which Mira approves. Workers finish by mentioning `@manager`, and the manager reports once. Brakes stop runaway chains: 8 node messages in a row, or 12 deep under one human message. In the crew's settings Mira adds any of her nodes, removes some, renames the crew and changes the lead.

### 4.5 People and their nodes in one room

1. Mira makes the room "Launch" on New → Room: a title, 1–3 of her nodes with one as her lead, and emails to invite (`POST /api/node/rooms {title, nodeIds, leadNodeId, invite}`). The page shows the result for each email: asked, or why not (no Ensemble account yet, already in, declined less than 30 days ago, room full).
2. Ben, Asha and Kofi see the request in **Requests to join**, live (`node.invite`). Ben accepts and brings his Scout and Writer, with Scout as his lead (`POST /api/node/invites/:id/accept {nodeIds, leadNodeId}`). Asha declines. Only Mira sees the requests and their state in the room's settings, can withdraw open ones and can ask again after the 30 days. A room holds at most 10 people, counting open requests.
3. Each person sets "what I handle here" and can switch their lead, add or remove their nodes (never the last one: they leave instead). Other people's nodes show only their name, handle, role and face. People who join read only what is said after they join.
4. Kofi posts a request. With several leads, a small relevance call (paid by the author) picks at most two, using each person's stated responsibility. Here it picks Mira's manager.
5. The turn was started by someone other than Mira, so every write is held for her. The reply is a **draft only Mira sees**; she edits, posts or discards it.
6. Mira can talk to her manager **privately in the room** (Only me). That private thread has its own conversation and cursor, and nothing from it reaches a shared reply. A reply that quotes a private message is private too.
7. The manager delegates to Mira's builder, tester and docs writer in her crew (private to her), follows the runs, and when everything is done drafts the report for the room (`node_post`). Mira approves it, and Kofi sees the result.

### 4.6 Work on a computer

`hub_assign_to_agent` always waits. When Mira approves, Ensemble's Apply creates the `WorkspaceJob` for her run profile and computer. Node records a `node_runs` row and posts a run card, owner‑only in shared rooms. Every 15 s the watcher mirrors status, progress and summary onto the card. When the job ends, the node gets a turn with the result and reports to whoever asked. Questions the run asks (permissions, choices) are answered in Ensemble's Needs me: the Hub, the CLI's Tasks tab or the phone.

### 4.7 The CLI's Node tab

`ensemble` → Tab to **Node**. It shows nodes (working or idle), rooms with unread counts and their newest line, approvals waiting, requests to join, the computer runs nodes started, and the credits left. It is read‑only; typing there points to the website.

### 4.8 Chat tools

Every conversation has search (`GET /api/node/search?q&roomId&author`; ⌘K searches all of them), a view of people only or nodes only (`GET …/messages?author=people|nodes`) or mentions of me (filtered in the browser), pins (`GET/POST /api/node/rooms/:id/pins`, only messages everyone in the room can read), reactions (`POST /api/node/messages/:id/reactions`), replies (`replyToId`), deleting your own messages (`DELETE /api/node/messages/:id`), copy, and export as Markdown (`GET /api/node/rooms/:id/export`, saved by the browser). A search result, a pin or a quote opens the conversation at that message and loads earlier pages (`before`) until it is there.

### 4.9 Ensemble from Node

**Computers & Needs me** lists the paired computers (revoked ones left out) with the folders each shares, and what waits in Ensemble's Needs me. Run approvals take Approve or Reject. Agents' questions take Allow once or Deny; a risky allow asks the person to confirm and then sends `confirmed: true`; questions with answer options, ones only that computer may approve, and ones someone else must answer link to Ensemble's Needs me instead. **Connections** lists what the account has connected in Ensemble and what it can connect; Connect and Manage open Ensemble's connections settings in a new tab.

## 5. Models and credits

- Chat model: any model the owner can use, chosen per node with one picker (new node, new nodes in a crew, the node page, and the DM header's model menu). Groups: **Included with Ensemble** (Everyday and Step-up, with name, version and relative credits as on the Hub; Ensemble's own list, `ENSEMBLE_INCLUDED_MODELS`), **Your API keys** (Ensemble's model catalog for the account's keys) and **Your AI plans on ‹computer›** (Claude Code, Codex, Cursor or Copilot on a paired computer, which runs the turn there). The bootstrap carries only the included models; the picker asks `GET /api/node/models` for the rest when it opens. Saving is `PATCH /api/node/nodes/:id {provider, model}` (`model: null` is the default). Default: **gpt‑5‑mini**, else the first everyday model. When included AI is off (local dev), the owner's own medium tier is used.
- Every account gets **20,000 credits per UTC month** (`ENSEMBLE_INCLUDED_MONTHLY_CREDITS`, default 20000), shared by every Ensemble app: the Hub, the desktop app, the CLI and Node. The operator's global ceiling (`ENSEMBLE_INCLUDED_TOTAL_MONTHLY_USD`) protects the overall budget.
- Metrics show Node's spend as purposes `Ensemble Node` and `Ensemble Node routing`.
- Work on the computer uses the run profile's engine on the person's own sign‑in (Claude Code, Codex, Cursor) or Ensemble's agent. It is not a Node chat cost.

## 6. Safety details

- **Visibility:** `visible_to = []` is the whole room; otherwise only the listed accounts and their nodes. Approval cards, error notices and run cards in shared rooms are owner‑only. Other people's nodes are shown by public fields only.
- **Two threads per node and room:** shared (reads only public messages) and private (reads everything the owner sees, answers only the owner). Separate conversations and cursors.
- **Taint:** a turn whose trigger came from someone other than the owner, or from a message marked `fromNonOwner`, runs with the write policy narrowed to preview. Its posts carry the mark, and `node_remember` is refused.
- **Shared rooms:** by default a node drafts every shared‑room post for its owner. The owner can switch a node to post on its own; writes and computer work still wait.
- **Files on a paired computer:** off for every node until its owner switches on "Read files on my computer". Then the node may read, never write, inside the folders that computer shares with Ensemble, only in turns that only the owner started and reads (a DM, a crew, Only me), never secrets or `.git`, and only while the computer allows browsing (`ensemble browse on`).
- **Requests to join:** only a room's creator asks people, by the email of an existing Ensemble account. A room holds 10 people, counting open requests; a decline blocks asking the same person again for 30 days; people read only what is said after they join.
- **Exactly once:** cards settle with a JSON‑guarded `pending → applying` update. Ensemble's Apply dedupes calls by id and locks them.
- **Brakes:** node streak 8, depth 12, mention fan‑out 6 (people) / 3 (nodes), relevance picks ≤ 2, per‑node serial turns, `ENSEMBLE_NODE_PARALLEL` turns per process.

## 7. Phases

| Phase | Scope |
| --- | --- |
| **v0 (done)** | Everything in [00](00_OVERVIEW.md#v0-19-oct-2026). |
| v1 | Web push for approvals and finished runs (PWA service worker is in place). Invite links. Room ↔ Ensemble project binding (a room's default project and board). A plan card (manager's plan as live checklist). Node's own run profile (`run_profile_id`). Nodes working in a shared Ensemble space (`space_id`). Retry/edit on failed messages. |
| v2 | Routines (schedules and Ensemble events) with "test now". Per‑node autonomy matrix (from design/pre-v0/11). Peer requests between people's nodes with expiry. Activity feed. |
| v3 | Native iOS/Android shells. Voice notes. Browser broker on the paired computer. Guardian review model. Templates marketplace. |

## 8. Risks and open questions

- **Small model, big toolbox.** gpt‑5‑mini sees up to 128 tools. Ensemble's playbook routing keeps the visible set small, but plan quality on long delegations needs watching. A node can be moved to a stronger included model later.
- **Credit burn in busy rooms.** Every turn is a model call. Mitigations: drafts by default, relevance routing to at most two, brakes, `(no reply)`, and the per‑account allowance.
- **Single API process for live frames.** SSE frames are in‑process, like the Hub's own stream. Several API processes need Redis pub/sub first.
- **Hub onboarding for Node‑made accounts.** The Hub asks for a profile on first visit. That is fine, but the wording should say "you already use Ensemble Node".
- **Requests to join by email** require an existing account and reveal whether an email has one. Invite links in v1 remove both.
