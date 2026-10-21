# 07 · Computers and execution

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `apps/node-api/src/delegation/computer.ts`, `runs/routes.ts`, `ensemble/for-account.ts`. Ensemble-side: E5, E5b, E6, E11, E12 ([08 §4](08_ENSEMBLE_INTEGRATION.md#4-ensemble-side-changes-e1e12)).

## 1. Which computers

Nodes work on computers **paired with the owner's Ensemble account**:

| Client | How to pair | Works with Node |
|---|---|---|
| Ensemble CLI | `ensemble login` and approve *Run tasks*; `ensemble runner install` to keep it running at login | Yes |
| Ensemble desktop app, synced (paired) | Settings → Account → This computer | Yes |
| Ensemble desktop app, local only | — | **No**: it never receives hosted work |
| A spare machine or personal VPS running the CLI headless | Same as the CLI | Yes — the recommended "always-on box" (§4) |

All of a person's nodes share that person's computers, as all of a user's Grok Bots share one VM — but here the machine is yours, and there can be several. Per node, `computer.deviceIds` orders preferences, `folderLabels` limits where it may work (labels the computer shared with `ensemble folders add`), and `repoUrls` what it may clone. The Computers page (`GET /api/computers`, E6) shows each machine's state, signed-in agents and shared folders.

## 2. A node job

`run_on_computer` → `delegation/computer.ts` → Ensemble `POST /api/node/jobs` (E5). Node sends:

| Field | Value |
|---|---|
| `title`, `brief` | The delegation title and the rendered `WORKER_BRIEF` (goal, acceptance, context, working rules) |
| `kind`, `engine`, `model`, `effort`, `runProfileId` | From the node's worker config (a tool call may override kind/engine) |
| `deviceId` | First online preferred computer, else per failover policy |
| `place` | `fresh`, `folder` (label), `clone` (repo URL), `worktree` (label + branch, E5b) or `continue` (earlier job) |
| `files` | Written into the run folder before the engine starts: `AGENTS.md` (the charter), `CLAUDE.md` (points to AGENTS.md), `.node/memory.md` (active memory) |
| `runTools` | `{ url: <NODE_API_PUBLIC_URL>/api/runs/tools, token: nrt_… }` |
| `origin` | `{ app: "node", nodeId, delegationId, roomId }` — Ensemble shows it on the run and sends webhooks for it |

Everything else is Ensemble's existing path: the job is queued for that device; the runtime claims it with a 120-second lease; the computer validates the spec against its own folders, trust, sandbox and git rules; the engine runs (Claude Code with the per-run PreToolUse judge, Codex via app-server, Cursor via ACP, or Ensemble's agent); permission prompts and questions go to Needs me (mirrored into Node, [11 §3](11_APPROVALS_AUTONOMY_AND_SAFETY.md#3-approvals)); traces, changed files and links are kept as run evidence in Ensemble.

## 3. Run-scoped tools

The run's MCP server on the computer (Ensemble's `scripts/ensemble-ask-mcp.mjs`, extended by E5) already offers `ask_person`. For node jobs it also lists the tools at `GET /api/runs/tools` and calls `POST /api/runs/tools/:name` with the job's `nrt_` token:

| Tool | Effect |
|---|---|
| `node_post_update` | A short milestone in the delegation's thread (secret-shaped text refused) |
| `node_remember` | A durable learning saved to the node's memory |
| `ask_person` (existing) | A question to the owner through Needs me, mirrored as an owner-only card |

Planned: `node_ask_crew` (a question to the manager instead of the person), `node_attach` (an artifact link on the delegation).

A run token reaches one delegation, expires after 24 hours and stops working when the delegation ends. The computer only ever connects **outward** to Ensemble and to Node.

## 4. Offline, sleep and failover

Ensemble never moves a device's job to the server or to another device on its own, and a lost lease marks the run Interrupted (partial work kept, never replayed silently). Node builds on that:

- **Before starting:** the node checks the preferred computers' state. Offline → it says "Queued until Office Mac is online" and the delegation stays `queued`.
- **Failover policy** per node: `none` (wait), `ask` (an owner card: "Office Mac is offline. Run on Home PC?"), `auto` (next online preferred computer).
- **Device webhooks** (`device.status`, E4) update the UI and wake waiting delegations when a computer returns.
- **Keep awake (E12):** the runtime holds a sleep assertion while a job runs (macOS `caffeinate`-style assertion, Windows `SetThreadExecutionState`, Linux `systemd-inhibit`), released when idle.
- **Interrupted runs** become `interrupted` delegations with Retry and Cancel; the node explains what happened.
- **Always-on box:** for round-the-clock nodes, run `ensemble runner` on a spare mini PC or a small personal VPS (a few dollars a month). That gives Grok-Bot-style availability on hardware the person owns, with their own subscriptions signed in there.

## 5. Concurrency

Ensemble's queue runs 1–8 jobs per space concurrently (default 3) and serializes jobs that share a folder or repository. Node adds a per-node limit (`budget.maxConcurrentJobs`, default 1) and, with E5b, worktree placement so different nodes can work on one repository in parallel on their own branches.

## 6. Browser and computer use

Grok Bot and Dots run a browser in the vendor's cloud and ask you to sign in there. Node's browser runs on **your** computer:

- **Phase 1:** research jobs use the engines' own web tools; code jobs can run a project's headless browser tests.
- **Phase 3 (E11): browser broker.** The runtime runs Chromium outside the sandbox with a dedicated profile per person (optionally per node), a domain allow/deny policy, and an MCP interface the sandboxed engine uses (navigate, read, click, type, screenshot). Logins: you sign in once in that profile **on your computer** (headed window) — credentials never pass through Node, Ensemble or a model. From your phone, a step that needs a login or 2FA becomes a **take-over** card with live screenshots; a secret typed there goes straight to the broker on your computer, never into the transcript.
- **Hard floors** apply to browser actions: purchases, payments, password changes and account security always go to the person.
- Full desktop computer use (any app, screen and mouse) is out of scope until a sandboxed approach exists; Dots and Grok Bot also confine it to their cloud machines.

## 7. Cost model

Node runs no virtual machines. Ensemble's costs for a node are its chat-model turns (cheap tier) and Node's own service; the heavy work runs on the person's hardware, usually on the AI plan they already pay for. That is the structural price advantage over products that keep a VM per user or per agent.
