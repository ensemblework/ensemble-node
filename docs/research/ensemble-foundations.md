# What Ensemble Node builds on: Ensemble's agent and computer foundations

> Summary of the Ensemble repository's own guides as of 18–19 Oct 2026 (Ensemble release 0.4.3), written for people and coding agents working on Ensemble Node. The Ensemble repository (`github.com/ensemblework/ensemble`) and its `docs/` folder are authoritative; check them before relying on a detail here. Ensemble doc numbers below refer to that repository.

## 1. Product shape

Ensemble is a shared workspace for a person and their agents: tasks, boards, pages, projects, people, files, meetings and code, with an assistant that operates the app through typed tools. Surfaces: hosted web (`app.ensemblework.com`, API `api.ensemblework.com`), a Tauri desktop app, the `ensemble` CLI (npm `ensemblework`), and a read-only MCP Context Bridge. Stack: Next.js 15 / React 19 / Tailwind / React Query; Fastify + Prisma + Zod on Node 22; Postgres 16 + Redis 7 hosted; PGlite inside the desktop/CLI runtime; Python FastAPI for hosted model calls. (Ensemble docs 00, 01, 17.)

## 2. Local runtime, desktop and CLI (docs 23, 26)

- The desktop app and the CLI run **the same local runtime**: a Node sidecar with hub-api on a random loopback port, PGlite, the workspace queue, scheduler and the **remote loop**. One runtime per computer (`runtime.lock`); discovery in `api.json`; data in the desktop app's folder; encryption key `secret.key`.
- **Local only vs synced.** A desktop app or CLI that is not paired is local-only: its own database, no hosted assignments, no included models. **Paired** ("synced"): `ensemble login` with *Run tasks* approved, or Settings → Account → This computer in the app. Ensemble Node needs paired computers.
- `ensemble` opens a terminal app with **Tasks** (runs and everything waiting on you) and **Chat** (Claude Code, Codex or Cursor's agent on the person's own sign-in, or Ensemble Code). `ensemble runner install` registers a login service (LaunchAgent / systemd user unit / Task Scheduler) so hosted work runs while the app is closed. `ensemble folders add <path> --label L` shares folders by label; `ensemble needs` answers waiting questions; `ensemble approvals on|off`, `ensemble web files|edit|terminal on|off` are local switches the computer re-checks on every request.

## 3. Remote tasks on a paired computer (doc 25)

- `WorkspaceJob.deviceId` targets a computer. The **host never executes** a device's job; an offline device leaves it queued; there is no fallback to the server or another device.
- Device protocol (`apps/hub-api/src/remote/contract.ts`): register/pair, heartbeat (30 s), claim, progress, ask, decision long-poll (≤55 s), close decision, complete, event stream (`/api/devices/self/events`) that wakes the device, attachments (≤100 MB per job, lease-scoped), model keys, changed files (≤100 files, 256 KB each, 3 MB per run, kept 30 days), file/code/terminal relays, and **assistant turns** (`assistant-turns/:id`, `/tool`, `/stream`, `/done`).
- **Leases:** 120 s lease, 90 s recent-contact window, claims and writes fenced by device + lease token. A missed lease marks the attempt Interrupted and preserves partial work; it is never replayed automatically.
- The host's job spec carries task/context and execution choices, never shell argv or raw paths. The computer validates everything against its own folders, trust, sandbox and git rules (`planLocalJob`). A server-provided "trusted" flag is not a local trust grant.
- **Phone approvals:** `acceptWebApprovals` (on by default) lets the web and phone answer risky decisions; first valid answer wins; timeouts never allow. `runBranchPush` (off by default) authorizes the bounded run-branch push.
- Web Code tab and passkey-unlocked terminal (30 min idle / 8 h max) work through relays; they are owner-only browser routes, never assistant tools.

## 4. Engines (doc 30)

- **Ensemble's agent** (its own tool loop), **Claude Code** (`claude -p … --output-format stream-json` with a PreToolUse hook judged by `workspace/engines/judge.ts`), **Codex** (`codex app-server`, approvals answered by the same judge), **Cursor's agent** (ACP over stdio). Copilot CLI only as a hand-off for now (no per-run permission hook).
- Every engine uses the person's **own installed, unmodified program and sign-in**; billing env vars are stripped; Ensemble never reads vendor credentials.
- Run rules: mode (Ask / Review only / Run unattended), folder trust, OS sandbox (Seatbelt, bubblewrap/Landlock, Windows sandbox account), outside-folder access, git permission (local only / commit / commit + push, push done by Ensemble fast-forward only), internet, budgets. `git clone` under the sandbox is done by Ensemble's trusted helper; `.git/config` and hooks stay read-only.
- Questions use Ensemble's **`ask_person`** MCP tool (`scripts/ensemble-ask-mcp.mjs`); chat runs also get `ensemble_list_tasks`, `ensemble_create_task`, `ensemble_search` via `POST /api/engine/tool` with the run's own secret.
- Traces: each tool call/thinking/message is a `RunStep` with bounded, redacted previews; jobs keep reported model, cost, changed files.
- **Subscriptions for the assistant:** a tier can run on the person's Claude, ChatGPT (Codex), Cursor or Copilot plan on a paired computer; the agent gets only Ensemble's tools through the MCP bridge (`/api/engine/assistant/tools|tool`); hosted turns travel through `subscriptions/relay.ts` (`assistant.turn` frame → computer reads spec → posts tool calls and text deltas in 250 ms batches → done; 20 s pickup timeout).

## 5. The assistant and its actions (docs 11, 34)

- Typed tools (`defineTool`: zod input, write flag, risk, preview, Undo), routed by intent through Markdown **playbooks** (at most two preloaded; `hub_how_to` loads more; ≤128 schemas per request). Personal **Skills** are separate, versioned user instructions.
- **Write policy:** `immediate` ("Just do it (undoable)", default), `preview`, or `needs-me`. Connected-app writes, settings, workflows and **agent assignments always wait for Apply**. `POST /api/assistant/apply` runs saved proposals in a transaction with one Undo group; outside writes run after, sequentially, with receipts.
- `hub_run_workflow`: 2–12 ordered writes under one Apply with `$ref` back-references and durable step receipts.
- `hub_assign_to_agent` queues a job on the person's computer under a run profile ("do this on my machine").
- The hosted MCP (`/mcp`, Context Bridge) is **read-only** (17 tools). Read-write access for Node is a new interface (E3).

## 6. Orchestration and decisions (docs 05, 06)

- Durable Postgres `WorkspaceJob` queue; claims serialize per space; jobs sharing a repo/folder/continuation wait; 1–8 concurrent (default 3); one extra slot after a 60-minute wait on a person.
- `WorkspaceJobStatus`: `queued, claimed, running, stopping, waiting_approval, blocked, succeeded, failed, cancelled, interrupted`.
- **Needs me** holds exact decisions (tool permissions, structured questions, publishing approvals); answering continues the same job; stale tree/decision state is refused.
- Arbitrary recurring routines are **not** implemented in Ensemble (product-specific schedules only). Ensemble Node owns routines for now.

## 7. Spaces and sharing (docs 28, 29)

- Spaces are separate workspaces per account (≤12). A token belongs to the space it was created in.
- Sharing: up to 2 members per space (3 with the owner), 5 contacts per account, item shares, public links. Members run agent work **on their own computers**; only the runner answers its decisions; the owner's connected apps, keys, devices, settings and inbox stay private.

## 8. Included AI (doc 33)

Operator-funded Azure deployments: `gpt-6-luna` (1×), `deepseek-v4-flash` (~2×), `gpt-6.1-sol` (~20×), `grok-4.7` (~20×). 20,000 credits per account per UTC month; reservations before each call, settlement after; a global monthly ceiling pauses included AI for everyone. Paired desktop/CLI computers can call included models through `/api/devices/self/included/turn`.

## 9. What this means for Node

| Need | Reuse | Add |
|---|---|---|
| Sign in | Ensemble accounts, `/link` device approval | `node` scope (E1b), OAuth (E1) |
| Chat model calls | Model catalog, keys, included credits, subscription relay | One-step model turn for node-scoped tokens (E2, E2b) |
| Read/write Ensemble | Assistant tools, write policy, Apply, Undo, ledger | Actions API + MCP facade (E3) |
| Heavy work | Jobs, devices, leases, engines, sandbox, Needs me, traces | Node origin, files, run tools (E5), worktrees (E5b) |
| Live state | Device events, decisions | Webhooks to Node (E4) |
| Computers list | `GET /api/devices` | Node-scoped access (E6) |
| Approvals | Decide routes, first answer wins | Node-scoped decide for human-clicked answers (E7) |
