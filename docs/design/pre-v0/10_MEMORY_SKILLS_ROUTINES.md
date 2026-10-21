# 10 · Memory, skills and routines

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `apps/node-api/src/memory/*`, `routines/*`; `packages/shared/src/memory.ts`, `routines.ts`.

## 1. Memory

Memory is what a node keeps between conversations: facts ("staging is at …"), preferences ("Mira wants concise answers"), procedures ("release = tag, then changelog, then announce"), decisions ("we chose Postgres for X") and episodes (what happened on a past task).

| Scope | Shared with | Example |
|---|---|---|
| `node` | That node | "Docs use sentence-case headings and no emoji" |
| `crew` | The owner's crew | "Main repo is my-app; CI is GitHub Actions" |
| `room` | Every member of a room (and their nodes) | "Atlas: Friday releases; Dana approves copy" |
| `account` | All of the owner's nodes | "Mira works in UTC+5:30; prefers short answers" |

Rules (`memory/service.ts`):

- **The person owns it.** Every entry is a row in Settings → Memory with its scope, kind, source (message, delegation) and author; edit, archive or delete at any time. (Dots' documented gap: its memories cannot be viewed or edited.)
- **Secrets are refused** by shape (API keys, tokens, private keys) before saving (`memory/secrets.ts`), in `remember` and in the run tool `node_remember`.
- **What a node sees:** active node + account (+ room, in that room) entries, newest first, up to 30 in the prompt; `recall` searches more. Crew memory is searchable by crew members.
- **Writing:** `remember` (chat) and `node_remember` (from a computer run) follow the `memory.write` autonomy level (default "Do it, tell me"). Phase 2 adds a weekly "memory review" card summarizing new entries.
- **Limits:** 500 active entries per scope; archive old ones.
- **Phase 3:** semantic recall (pgvector over the same rows), and optional mirroring of node memory and charter to Ensemble pages so they get Ensemble's editor, history and sharing.

Memory is not authoritative (Grok Bot's docs make the same point): consequential actions re-read the source (the Ensemble task, the repository) rather than trusting a remembered fact.

## 2. Skills

A node's standing instructions are its **charter**. Reusable procedures are **Ensemble Skills** (versioned personal instructions that already exist in Ensemble), referenced by id in `node.skillIds`:

- The node's prompt carries the skills' names and one-line descriptions; `load_skill` reads a body on demand (E3, `hub_read_skill`), as Ensemble's assistant does.
- **Structured skills** (Phase 2 template, matching what both competitors converged on): when to use it, inputs and access needed, steps, validation, output, approval needs.
- **"Save as skill"** on a finished delegation (Phase 2) drafts a skill from what worked, for the owner to review.
- **Teach by demonstration** (Phase 3, with the browser broker): record a short browser flow on your computer; the node drafts a skill from it with the steps and the approvals it needs.
- Because skills live in Ensemble, the same procedure serves Ensemble's assistant, Node's nodes and coding agents through the Context Bridge.

## 3. Routines

A routine wakes a node with an instruction, without a person writing a message. Most are created by asking a node ("every weekday at 9, summarize yesterday's failed CI runs here"), which calls `create_routine` under the `routine.manage` autonomy level.

| Trigger | Notes |
|---|---|
| `cron` | Standard cron + timezone; runs at least 5 minutes apart (Grok Bot parity) |
| `interval` | Every N minutes (≥5) |
| `ensemble` | Ensemble events via webhooks (E4): task created/assigned/status changed/commented, page mentioned, run finished, decision created; optional filters (project, tag, assignee) |
| `webhook` | A per-routine inbound URL with a secret shown once (`POST /api/hooks/routines/:token`) |
| `github` | Phase 2: PRs, checks, issues, pushes (through Ensemble's GitHub connector or a webhook) |
| `manual` | Only "Test now" |

Mechanics (`routines/service.ts`): the scheduler ticks every 30 seconds and **claims due routines atomically** (`WITH due … FOR UPDATE SKIP LOCKED … UPDATE … RETURNING`), so several API processes never double-fire. Each fire queues a node turn (`reason: routine`); heavy work still goes to the owner's computer and waits there if it is offline. A run more than 10 minutes late runs once (`onMissed: run_once`) or is skipped (`skip`); missed runs are never replayed in bulk. `quietWhenNothingNew` lets monitoring routines post only when something changed. Limits: 50 routines per node. Phase 2: run history (last 20 per routine), auto-pause after long owner inactivity, "Scheduled" view, cost estimate per routine.

## 4. Proactivity

Nodes become useful without being asked through three mechanisms, all bounded:

1. **Routines** (above), including monitors with `quietWhenNothingNew`.
2. **Self-scheduled follow-ups** (Phase 2, `schedule_followup`): "check the deploy again in 30 minutes" — a one-off routine the node creates for itself, like Dots' "decide when to pause and wake up".
3. **Proactive research** (Phase 3): read-only background passes over sources the owner already allowed (Ensemble board, connected apps through E3 read tools), producing *private suggestions* in the owner's DM, never actions. Same rule Dots applies: proactive work is strictly read-only.
