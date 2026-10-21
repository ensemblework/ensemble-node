# 12 · Data model

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Source of truth: `apps/node-api/prisma/schema.prisma` (Postgres). Json columns hold the zod shapes from `packages/shared`; parse them on read. This guide explains roles and invariants; the schema has the exact columns.

## 1. Identity

| Table | Role | Invariants |
|---|---|---|
| `accounts` | A person, mirrored from Ensemble at sign-in | `ensemble_account_id` unique; `handle` unique, lowercase, used in mentions |
| `ensemble_grants` | The person's node-scoped Ensemble tokens (AES-256-GCM), scope, expiry, default space, webhook subscription id | One per account; deleting it disconnects Node from Ensemble |
| `sessions` | Browser sessions | Only SHA-256 of the cookie value stored; 30-day expiry |

## 2. Agents

| Table | Role | Invariants |
|---|---|---|
| `nodes` | A node (`NodeSpec` in columns + Json for models/worker/computer/autonomy/budget) | `(owner_id, slug)` unique; slug never changes; archived nodes keep history |
| `crews`, `crew_members` | A person's crew, its manager and crew room; ordered members | One room per crew |

## 3. Conversation

| Table | Role | Invariants |
|---|---|---|
| `rooms` | dm / crew / group, settings, `last_seq` | `last_seq` only incremented in the message-insert transaction |
| `room_members` | A person **or** a node in a room | Exactly one of `account_id`/`node_id`; `(room_id, handle)` unique; `left_at` instead of delete; `last_read_seq` per person |
| `messages` | Everything said in a room, including cards (kinds `plan`, `delegation`, `approval`, `run`, `status`, …) | `(room_id, seq)` unique; `(room_id, client_id)` unique for idempotent sends; `visible_to` empty = whole room; bot lineage (`root_human_message_id`, `bot_depth`) |

## 4. Work

| Table | Role | Invariants |
|---|---|---|
| `plans` | A manager's plan: goal, notes, `steps` (PlanStep[]), status | Steps validated (unique ids, known deps, acyclic) before insert |
| `delegations` | Assigned work: from, to, owner, brief, acceptance, status, Ensemble task/job/run ids, device, result, artifacts, usage, review rounds | Status transitions follow `packages/shared/src/delegation.ts`; `ensemble_job_id` unique; finished delegations are never reopened (follow-ups instead) |
| `run_tokens` | Per-job secrets for run tools | Stored hashed; expire; useless once the delegation ends |

## 5. Control

| Table | Role | Invariants |
|---|---|---|
| `approvals` | Decisions waiting on a person | `action_hash` of the payload; settled once (`status = 'pending'` guard); `ensemble_decision_id` unique for mirrors |
| `memory_entries` | Scoped memory rows | Owner can edit/delete all; secrets refused before insert; 500 active per scope |
| `routines` | Triggers with instruction | Atomic claim; `next_run_at` recomputed after each fire; webhook secret stored hashed |
| `turn_jobs` | Durable queue of node turns | One `running` per node; stale `running` re-queued once after 10 minutes |
| `node_turns` | One row per turn: model, prompts version, steps, tool calls, tokens, credits, outcome | Kept 90 days for evaluation |

## 6. Plumbing

| Table | Role |
|---|---|
| `events` | Durable SSE log (bigint id = `Last-Event-ID`); per-room or per-account; `visible_to`; trimmed after 30 days |
| `push_subscriptions` | Web push endpoints per person; removed when the push service says gone |
| `peer_links` | Consent between two people for node requests |
| `audit_events` | Hash-linked ledger per account |
| `webhook_deliveries` | Ensemble webhook ids already handled |

## 7. Deletion

Deleting an account cascades its grants, sessions, nodes (and their memberships, routines, turns), crews, approvals, push subscriptions and peer links. Rooms it created stay for other members when shared (ownership passes to the oldest remaining person; Phase 2), and its messages there show "someone who left". Delegations and Ensemble jobs it started are stopped first.

## 8. Migrations

The first migration is committed (`prisma/migrations/20261019000000_init`); `pnpm db:migrate` applies pending migrations (deploy). Create new ones with `pnpm db:migrate:dev` locally. Never reset a shared database. Additive changes first; data backfills as separate steps; destructive changes only after the code no longer reads the column.

## 9. Time

Every timestamp column is `timestamptz` (`@db.Timestamptz(3)`), so comparisons with `now()` or Date parameters in raw SQL (queue claims, routine claims, `last_message_at`) are absolute instants whatever the database session's time zone. A smoke test on a non-UTC session (19 Oct 2026) showed plain `timestamp` columns making a routine fire twice; keep new DateTime fields on `Timestamptz(3)`.
