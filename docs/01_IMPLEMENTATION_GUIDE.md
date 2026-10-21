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
        └─ included AI (Azure Foundry: gpt-5-mini, gpt-4.1-mini) ── 20,000 credits / account / month
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
| Ops | Second VM service, database, backups | Nothing new on the VM; one env var |
| Cost | Separate small model calls through a relay | Same included models, same budget |

The cost is coupling: Node's backend ships with Ensemble's releases and must follow Ensemble's `AGENTS.md`. That is acceptable while one team builds both. If Node later needs its own scale or tenancy, the `/api/node/*` contract is the seam to split along.

## 3. What Node reuses

| Ensemble piece | How Node uses it |
| --- | --- |
| Accounts, sessions, OAuth, email verification, Turnstile | Sign-in and sign-up on Node call the same routes. `?return=node` brings a provider sign-in back to Node. |
| Session cookie on `ensemblework.com` + CORS allowlist | `ENSEMBLE_NODE_WEB_ORIGIN` joins the allowlist (production refuses it unless it is https and shares the cookie domain). |
| Assistant loop (`runAssistantTurn`), tools, playbooks/skills, write policy, Apply, undo, ledger | A node turn is an assistant turn in the owner's space with `agentPersona`, `extraTools` and `purpose: "Ensemble Node"`. Held calls are applied through `POST /api/assistant/apply`. |
| `hub_assign_to_agent`, run profiles, `WorkspaceJob`, device protocol, sandbox, Needs me | Computer work is exactly an Ensemble assignment. Node only adds the run card and the report afterwards. |
| Included AI and credits (`includedUsage`, `assertIncludedOpen`) | Node turns and group routing are included calls on the owner's/author's account. One allowance across all three apps. |
| Account export and deletion (generic over `userId`) | Every Node table has `user_id`, so export and erasure cover it. |
| Sharing policy classes | `/api/node/*` is `personal`: it acts for the signed-in account whichever space is open. |
| CLI device login (`bridge` key) and TUI | The Node tab reads `GET /api/bridge/node` with the key the CLI already has. |

## 4. Flows

### 4.1 Sign-up, sign-in, one account

- **New on Node:** `/login?mode=signup` posts to `/api/auth/signup` (name, email, password, Turnstile token when configured). This *is* an Ensemble account. `/welcome` explains that, verifies the email with the 6‑digit code when the server requires it, and continues to the first node.
- **Existing Ensemble user:** sign in with email or a provider. Providers go through `/api/auth/oauth/:provider/start?return=node`. The callback stays on the API host (no provider console change) and returns to Node's `/welcome` (new account) or `/`.
- **Later on Ensemble or the CLI:** same account and session. The Hub may ask a Node‑made account to finish its profile once. The CLI's `ensemble login` approves in the browser as the same account and pairs the computer.
- Signing out on Node signs out of Ensemble in that browser (one cookie).

### 4.2 Onboarding

`/welcome`: verify (if needed) → "You're in Ensemble" (the three apps, the shared credits) → first node or a crew → connect a computer (install the CLI and run `ensemble login`, or the desktop app). The page polls until a computer shows up, then opens the new DM or crew room.

### 4.3 A DM turn

1. Mira writes in her Assistant's DM → `POST /api/node/rooms/:id/messages` (verified email required on the hosted server).
2. Routing: in a DM, the room's node answers. A `node_turns` row is queued; turns run one at a time per node.
3. The turn reads the room's new messages into the node's own assistant conversation and calls `runAssistantTurn` with gpt‑5‑mini. The model uses Hub tools (create tasks, update pages, read projects…) in Mira's space.
4. The reply is posted with tool chips. Held writes become an owner‑only approval card. The page streams "thinking…" and the text as it is written.

### 4.4 A crew delegates

Mira writes "Plan the login page and hand out the work" in her Software team crew. The lead (`@manager`) plans in Ensemble, then calls `node_delegate {to: "builder", brief}` and `{to: "tester", brief}`. Each brief is a message that mentions the node, which wakes it. Workers do their part: Hub writes, or `hub_assign_to_agent` for work on Mira's laptop, which Mira approves. Workers finish by mentioning `@manager`, and the manager reports once. Brakes stop runaway chains: 8 node messages in a row, or 12 deep under one human message.

### 4.5 People and their nodes in one room

The group "Launch" has Mira, Ben, Asha and one representative node each. Each person sets "what I handle here".

1. The client (Kofi) posts a request. With several representatives, a small relevance call (paid by the author) picks at most two, using each person's stated responsibility. Here it picks Mira's manager.
2. The turn was started by someone other than Mira, so every write is held for her. The reply is a **draft only Mira sees**; she edits, posts or discards it.
3. Mira can talk to her manager **privately in the group** (Only me). That private thread has its own conversation and cursor, and nothing from it reaches a shared reply.
4. The manager delegates to Mira's builder, tester and docs writer in her crew room (private to her), follows the runs, and when everything is done drafts the report for the group (`node_post`). Mira approves it, and Kofi sees the result.

### 4.6 Work on a computer

`hub_assign_to_agent` always waits. When Mira approves, Ensemble's Apply creates the `WorkspaceJob` for her run profile and computer. Node records a `node_runs` row and posts a run card, owner‑only in shared rooms. Every 15 s the watcher mirrors status, progress and summary onto the card. When the job ends, the node gets a turn with the result and reports to whoever asked. Questions the run asks (permissions, choices) are answered in Ensemble's Needs me: the Hub, the CLI's Tasks tab or the phone.

### 4.7 The CLI's Node tab

`ensemble` → Tab to **Node**. It shows nodes (working or idle), rooms with unread counts and their newest line, approvals waiting, the computer runs nodes started, and the credits left. It is read‑only; typing there points to the website.

## 5. Models and credits

- Default chat model: included **gpt‑5‑mini** (`ENSEMBLE_INCLUDED_MODELS=gpt-5-mini,gpt-4.1-mini` on the VM). A node can be switched to another included model on the server. When included AI is off (local dev), the owner's own medium tier is used.
- Every account gets **20,000 credits per UTC month** (`ENSEMBLE_INCLUDED_MONTHLY_CREDITS`, default 20000), shared by Ensemble, the CLI and Node. The operator's global ceiling (`ENSEMBLE_INCLUDED_TOTAL_MONTHLY_USD`) protects the overall budget, for example $20 per test user.
- Metrics show Node's spend as purposes `Ensemble Node` and `Ensemble Node routing`.
- Work on the computer uses the run profile's engine on the person's own sign‑in (Claude Code, Codex, Cursor) or Ensemble's agent. It is not a Node chat cost.

## 6. Safety details

- **Visibility:** `visible_to = []` is the whole room; otherwise only the listed accounts and their nodes. Approval cards, error notices and run cards in shared rooms are owner‑only. Other people's nodes are shown by public fields only.
- **Two threads per node and room:** shared (reads only public messages) and private (reads everything the owner sees, answers only the owner). Separate conversations and cursors.
- **Taint:** a turn whose trigger came from someone other than the owner, or from a message marked `fromNonOwner`, runs with the write policy narrowed to preview. Its posts carry the mark, and `node_remember` is refused.
- **Shared rooms:** by default a node drafts every shared‑room post for its owner. The owner can switch a node to post on its own; writes and computer work still wait.
- **Exactly once:** cards settle with a JSON‑guarded `pending → applying` update. Ensemble's Apply dedupes calls by id and locks them.
- **Brakes:** node streak 8, depth 12, mention fan‑out 6 (people) / 3 (nodes), relevance picks ≤ 2, per‑node serial turns, `ENSEMBLE_NODE_PARALLEL` turns per process.

## 7. Phases

| Phase | Scope |
| --- | --- |
| **v0 (done)** | Everything in [00](00_OVERVIEW.md#v0-19-oct-2026). |
| v1 | Web push for approvals and finished runs (PWA service worker is in place). Invite links. Room ↔ Ensemble project binding (a room's default project and board). A plan card (manager's plan as live checklist). Node's own run profile (`run_profile_id`). Nodes working in a shared Ensemble space (`space_id`). Retry/edit on failed messages. |
| v2 | Routines (schedules and Ensemble events) with "test now". Per‑node autonomy matrix (from design/pre-v0/11). Peer requests between people's nodes with expiry. Activity feed and export. Own model keys for nodes. |
| v3 | Native iOS/Android shells. Voice notes. Browser broker on the paired computer. Guardian review model. Templates marketplace. |

## 8. Risks and open questions

- **Small model, big toolbox.** gpt‑5‑mini sees up to 128 tools. Ensemble's playbook routing keeps the visible set small, but plan quality on long delegations needs watching. A node can be moved to a stronger included model later.
- **Credit burn in busy groups.** Every turn is a model call. Mitigations: drafts by default, relevance routing to at most two, brakes, `(no reply)`, and the per‑account allowance.
- **Single API process for live frames.** SSE frames are in‑process, like the Hub's own stream. Several API processes need Redis pub/sub first.
- **Hub onboarding for Node‑made accounts.** The Hub asks for a profile on first visit. That is fine, but the wording should say "you already use Ensemble Node".
- **Email invites** require an existing account and reveal whether an email has one. Invite links in v1 remove both.
