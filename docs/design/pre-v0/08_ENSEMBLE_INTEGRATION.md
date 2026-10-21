# 08 · Ensemble integration

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Node side: `packages/ensemble-client`, `apps/node-api/src/auth`, `ensemble/`, `delegation/computer.ts`, `brain/gateway.ts`. Ensemble side: the changes in §4, made in the Ensemble repository with its own tests and docs (its AGENTS.md rule: docs move with code).

## 1. Rules of the integration

1. **Ensemble decides.** Every call carries the person's node-scoped token; Ensemble's space, sharing, module, quota, write-policy and Apply rules apply exactly as for the Ensemble assistant. Node's autonomy can only add checks.
2. **No browser cookies cross products.** Node never forwards an Ensemble session cookie and Ensemble never trusts Node's.
3. **Human answers only.** Node forwards answers to Ensemble decisions only when a person clicked them in Node; the brain never answers an Ensemble decision.
4. **Capabilities, not versions.** Node reads `GET /api/node/capabilities` (E6) and hides features the connected Ensemble does not offer; an unexpected 404 is reported as "this Ensemble cannot do that yet".
5. **Additive and documented.** Every E-change is backwards compatible, has tests in Ensemble, and updates Ensemble's docs (25, 26, 30, 11, 34, 13, 02 route tables) in the same change.

## 2. Identity and tokens

### 2.1 OAuth (E1, Phase 2)

Ensemble becomes an OAuth 2.1 authorization server for first-party clients: authorization code + mandatory PKCE (S256), exact redirect URIs, refresh-token rotation, a consent page on `app.ensemblework.com/oauth/authorize` ("Ensemble Node wants to: use your models, read and change your workspace through the assistant's tools, run tasks on your paired computers, receive updates"), and revocation from Settings → Connect your apps. Node is a confidential client (`ensemble-node`). The same server can later serve external MCP clients, which Ensemble documents as missing today; follow the 2026-07-28 MCP authorization profile (PKCE, RFC 8707 resource indicators, RFC 9728 protected-resource metadata) so one implementation serves both.

### 2.2 Link fallback (E1b, Phase 0)

Ensemble's existing device approval (`POST /api/cli/auth/start` → `/link?code=…` → `POST /api/cli/auth/token`) gains a `node` scope:

- `StartBody.scopes` accepts `"node"` (today `"mcp" | "runner"`); `/link` shows "Ensemble Node (web)" and lists what node access means.
- On approval, `/token` mints an `ApiToken` with `scope: "node"` (today it mints `bridge`), returns `{ token, scopes, account: { id, email, name }, … }`.
- Node stores it encrypted (`ensemble_grants`) and calls `GET /api/auth/me` (allowed for `node` scope) to bind the account.

### 2.3 What a `node` token may call

An explicit allowlist, enforced like Ensemble's bridge and device scopes: `/api/auth/me`, `/api/node/*`, nothing else. Tokens are **account-level**; routes that touch content take a `spaceId` that Ensemble checks the account may open (`openableSpace`), so one connection serves nodes bound to different spaces. Revoking the token (Ensemble Settings or Node sign-out) ends Node's access at once.

## 3. Who owns what, and what syncs

| Data | System of record | Sync |
|---|---|---|
| Accounts, spaces, sharing | Ensemble | Node mirrors name/handle/avatar at sign-in |
| Model keys, subscriptions, included credits | Ensemble | Never copied; Node calls E2 |
| Tasks, pages, projects, people, skills, files | Ensemble | Nodes read/write through E3; delegations can mirror to tasks |
| Jobs, runs, traces, changed files, devices, Needs me | Ensemble | Node creates jobs (E5), hears about them (E4), links to them |
| Nodes, crews, rooms, messages, delegations, plans, approvals, memory, routines | Node | Phase 3: node memory and charters can be mirrored as Ensemble pages for editing and history |

## 4. Ensemble-side changes (E1–E12)

### 4.1 E1 · E1b · Identity

See §2. Tests: scope allowlist (node tokens refused everywhere else), approval flow, refresh rotation, revocation, space checks.

### 4.2 E2 · E2b · Model gateway

`POST /api/node/model/turn` (node token):

```jsonc
// request
{ "provider": "ensemble", "model": "gpt-6-luna", "effort": "default",
  "system": "…", "messages": [ { "role": "user", "content": "…" },
    { "role": "assistant", "content": "", "toolCalls": [ { "id": "c1", "name": "delegate", "input": {} } ] },
    { "role": "tool", "toolCallId": "c1", "name": "delegate", "content": "…" } ],
  "tools": [ { "name": "delegate", "description": "…", "parameters": { /* JSON Schema */ } } ],
  "purpose": "node.chat", "maxOutputTokens": 4000 }
// response
{ "text": "…", "toolCalls": [ { "id": "c2", "name": "run_on_computer", "input": {} } ],
  "usage": { "inputTokens": 1200, "outputTokens": 90, "cacheReadTokens": 800, "credits": 3 }, "model": "gpt-6-luna" }
```

- One step, no tool execution in Ensemble. Reuses `lib/model-turn.ts`, provider/model/effort validation, included reservations/settlement (`included_credits_used`, `included_paused` errors pass through as 429), personal keys, metrics (`node.chat`, `node.plan`, `node.router`, `node.summary`).
- **E2b (subscriptions):** for `claude-code`/`codex`/`cursor-agent`/`copilot-cli`, Ensemble uses its assistant-turn relay (`subscriptions/relay.ts`) to the person's computer, but the computer's MCP bridge lists and calls tools at a **tool host URL + per-turn token** supplied by Node instead of Ensemble's own tools. The response is the agent's final text plus a transcript of tool calls already executed by Node. Pickup timeout, stop and quiet timeouts as today.

### 4.3 E3 · Actions API (read and write)

| Route | Purpose |
|---|---|
| `GET /api/node/tools?space=&playbook=…&q=` | Tool schemas allowed for this account/space (registry + `toolsFor` filtering + connected-app tools), each with `write`, `alwaysHold`, `area`. `q` = message text for playbook routing (Phase 2) |
| `POST /api/node/tools/call` | `{ spaceId, name, input, actor: { nodeId, roomId } }` → validate, authorize, run reads; for writes apply the person's write policy: run (`done` + Undo id) or hold (`held` + `proposalId` + preview). Ledger entries record the node as actor (`payload.byNodeId`) |
| `POST /api/node/proposals/:id/apply` · `/discard` | Apply or discard a held proposal (same checks as `POST /api/assistant/apply`) |
| `GET /api/node/how-to/:playbook` | Playbook text and its tools for mid-turn loading |
| `POST /mcp/actions` (Phase 2) | Read-write MCP facade (Streamable HTTP, stateless per MCP 2026-07-28) over the same calls, for worker engines and external agents with a node token |

Implementation reuses `assistant/registry.ts`, `runOne` in `assistant/agent.ts`, `assistant/apply.ts`; route-backed tools keep forwarding server-only credentials as the assistant does. Viewers in shared spaces still get no write tools.

### 4.4 E4 · Webhooks to Node

`POST <NODE_API_PUBLIC_URL>/api/ensemble/webhooks` with header `x-ensemble-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>`; at-least-once with exponential backoff for 24 h; unique `id` per event (Node dedupes). Subscription per account is created when Node connects (`POST /api/node/webhooks/subscribe { events }`).

Envelope: `{ id, type, accountId, spaceId, createdAt, data }`. Data by type:

| Type | `data` |
|---|---|
| `job.updated`, `job.finished` | `{ jobId, status, runId?, summary?, deviceId?, links?: [{ kind, url }], changedFiles?: [{ path, status }] }` — only for jobs with `origin.app = "node"` |
| `decision.created` | `{ decisionId, jobId, kind: "permission" \| "question", title, detail, options: [{ id, label, recommended }] }` |
| `decision.settled` | `{ decisionId, answeredVia }` |
| `device.status` | `{ deviceId, name, online, lastSeenAt }` |
| `task.created`, `task.assigned`, `task.status_changed`, `task.commented` | `{ taskId, projectId?, title, status?, assignee?, tags? }` |
| `page.mentioned` | `{ pageId, mention: "@<node handle>", excerpt, authorId }` (E9) |

### 4.5 E5 · E5b · Node jobs

`POST /api/node/jobs` with `CreateJobInput` (`packages/ensemble-client/src/types.ts`): creates a task (or links `linkTaskId`) and a `WorkspaceJob` through `createJob`, with:

- `origin` stored on the job (`context.origin`), shown on the run ("From Ensemble Node · Feature for Mira"), and used to route webhooks;
- `files` (≤32, ≤200 KB each) materialized by the runtime into the run folder before the engine starts, refusing paths outside it and never overwriting existing repository files except `AGENTS.md`/`CLAUDE.md` when the node owns the folder (fresh/worktree);
- `runTools` given to the run MCP server: it lists `GET {url}` and proxies calls with the token; tool names are prefixed `node_`;
- `place.type = "worktree"` (E5b): the runtime creates `git worktree add` under the workspace root on a new branch from the shared folder's repository, outside the agent's control, keeps `.git` internals read-only, and removes the worktree when the job's folder is cleaned up.

`GET /api/node/jobs/:id` and `POST /api/node/jobs/:id/stop` mirror the existing job routes for node tokens. Hosted rules stay: verified email, account quotas, device ownership; nothing runs on the server.

### 4.6 E6 · Computers, spaces, capabilities

`GET /api/node/devices` (same data as `GET /api/devices` plus signed-in agents from heartbeat capabilities), `GET /api/node/spaces`, `GET /api/node/capabilities` → `{ release, features: ["model_turn", "tools", "jobs", "worktrees", "webhooks", "decisions", …] }`.

### 4.7 E7 · Decisions

`GET /api/node/decisions/:id` and `POST /api/node/decisions/:id/decide { answer: allow|deny|option|text, scope?, optionId?, text? }` for decisions of node jobs. Same semantics as `POST /api/decisions/:id/decide` (first answer wins, action hash checked, the computer's `acceptWebApprovals` switch still applies); recorded as answered via Ensemble Node.

### 4.8 E8–E12

| # | Change |
|---|---|
| E8 | Agent identity on tasks: `tasks.agent_ref` (`node:<id>`) so the board shows the node's avatar and name |
| E9 | `@node` mentions in Ensemble pages and comments: the mention menu lists the person's nodes; a mention sends `page.mentioned`; the node answers with a comment through E3 |
| E10 | Higher sharing limits for team plans when a Node room mirrors a shared space |
| E11 | Browser broker in the runtime ([07 §6](07_COMPUTERS_AND_EXECUTION.md#6-browser-and-computer-use)) |
| E12 | Keep-awake during active jobs; documented headless "always-on box" setup |

## 5. Contract tests

`packages/ensemble-client` owns every request and response shape. Contract tests replay fixtures recorded from Ensemble's own route tests; a scheduled job runs Node's client against a local Ensemble checkout (`../ensemble`, in-memory PGlite test app) so a breaking change on either side fails before deploy.

## 6. Failures

| Ensemble answers | Node does |
|---|---|
| 404 on an `/api/node/*` route | "This Ensemble cannot do that yet (E#)"; feature hidden after a capabilities check |
| 401 / revoked token | Marks the grant broken; the person sees "Reconnect Ensemble"; nodes pause their Ensemble actions |
| 409 `ensemble_reconnect` | Same as above after a failed refresh |
| 429 `included_credits_used` / `included_paused` | The node says so in words and suggests the owner's own plan or key |
| 503 / timeout | Retry with backoff for idempotent reads; never retry a write blindly (writes carry an idempotency key from Phase 1) |
