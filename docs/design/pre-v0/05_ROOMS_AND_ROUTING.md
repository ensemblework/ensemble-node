# 05 · Rooms, messages and routing

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `packages/shared/src/rooms.ts`, `messages.ts`, `mentions.ts`; `apps/node-api/src/rooms/*`, `router/*`, `brain/relevance.ts`.

## 1. Rooms

| Kind | Members | Default routing | Created by |
|---|---|---|---|
| `dm` | You + one of your nodes | `direct` | Automatically with every node |
| `crew` | You + your crew's nodes | `lead` (the manager) | Creating a crew |
| `group` | People + nodes (each person adds only their own nodes) | `lead` | Anyone; becomes **cross-owner** with a second person |

Limits (`packages/shared/src/limits.ts`): 16 people and 8 nodes per room. Grok Bot allows 2–6 bots per group; Node allows more but recommends **representatives** in shared rooms rather than whole crews.

Room settings (`RoomSettings`): routing mode, lead nodes, max responders for the router, max bot turns per human message, bot-to-bot on/off, **responsibilities** per person (used by the relevance router: "Mira: backend API", "Dana: client"), and an optional Ensemble project to mirror delegations into as tasks.

## 2. Writing a message

`rooms/service.ts → postMessage`:

1. **Membership:** a person must be a member; a node must be a member.
2. **Directory and mentions:** handles come from members — people by account handle, nodes by slug (`@tester`) in dm/crew rooms and owner-qualified (`@asha/manager`) in group rooms; a bare slug still works in a group room when exactly one node has it and no person uses it (`rooms/directory.ts`). `@everyone` notifies all members; `@nodes` wakes every node. Mentions inside backticks, code fences and email addresses are ignored (`packages/shared/src/mentions.ts`).
3. **Visibility:** `room` (everyone), `owner` (one person: private notes and approval cards), `accounts` (a set). Stored as JSON plus the denormalized `visible_to` array so list queries, the SSE stream and node prompts filter in SQL.
4. **Lineage:** a node's message records the human message it descends from (`root_human_message_id`) and its bot depth, which feed the loop brakes.
5. **Sequence:** `UPDATE rooms SET last_seq = last_seq + 1 … RETURNING` inside the insert transaction gives a gap-free per-room order clients sort and resume by.
6. **Publish** `message.created` (durable event), then **dispatch** off the request path.

`clientId` (unique per room) makes retries from flaky phones idempotent: a resend returns the first copy (HTTP 200) and wakes nobody, including when two copies race.

## 3. Who answers

`router/who-speaks.ts` decides deterministically; only an unaddressed human message with several candidates costs a model call.

Order of rules:

1. System messages wake nobody. Paused nodes never answer. A node never answers itself.
2. A **private note** can only be answered by its author's own nodes.
3. For a message **from a node**: bot-to-bot must be on, the bot-turn budget not spent, and no bot-only streak (§4) — otherwise nobody answers.
4. **Mentions win:** mentioned nodes answer; `@nodes` wakes all eligible nodes.
5. The **thread's delegation owner** answers follow-ups in its thread.
6. An unaddressed **node** message (status, result) wakes nobody. This is the mention-gating Slack and Teams apply by default, and the main protection against bot ping-pong.
7. By routing mode, for an unaddressed **human** message:
   - `direct`: the dm's node.
   - `mention_only`: nobody.
   - `lead`: the room's lead nodes (the manager in a crew room); in a cross-owner room without leads, the **representatives** — one candidate answers directly, several go to the relevance router.
   - `open`: the relevance router picks among all nodes.

### 3.3 The relevance router

`brain/relevance.ts`: one call to a cheap model (`ROUTER_SYSTEM` prompt) with the members, their responsibilities, recent context and the new message; it returns at most `maxResponders` node ids as JSON. Answers are filtered to the candidates and capped; anything unparseable routes to nobody (the UI suggests @mentioning). The **message author's** account pays for routing their own message. Chosen nodes still decide for themselves (`stay_silent` is always available).

Why not let every bot self-select (Grok Bot's approach)? Self-selection costs one model call per bot per message and reviewers reported inconsistent coordination in larger groups; one router call plus explicit responsibilities is cheaper and predictable.

## 4. Loop brakes

`router/guards.ts`, applied by the router and enforced again by budgets in the brain:

| Brake | Default | Effect |
|---|---|---|
| Mention-gating for node messages | always | Unaddressed bot output wakes nobody |
| Bot turns per human message | 12 (`NODE_MAX_BOT_TURNS_PER_HUMAN_MESSAGE`, per-room lower) | Further bot messages in that lineage wake nobody; a system note says the conversation is paused until a person speaks |
| Bot-only streak | 8 messages (`NODE_PINGPONG_LIMIT` × 2) | Nodes posting 8 messages in a row in a thread without a person stops routing between them. Counts the streak, not strict A/B alternation, so interleaved chains (A, A, B, B…) are caught too |
| Turn coalescing | always | A node already queued for a room is retargeted to the newest message instead of getting a second turn (it reads everything new anyway) |
| Delegation depth | 3 (`NODE_MAX_DELEGATION_DEPTH`) | Deeper delegation is refused; the node asks its owner |
| Review rounds | 2 | A third "request changes" is refused; escalate |
| Messages per node per hour | 120 (node budget) | The node is throttled |
| Turn steps | 8 | The last step must answer without tools |

Frameworks disagree on what a "turn" is (OpenAI Agents SDK: one LLM call; LangGraph: one super-step; AutoGen: one round). Node's unit is explicit: **bot messages descending from one human message**.

Planned (Phase 2): stall detection — if a plan makes no progress for N turns, the manager re-plans or escalates (Magentic-One's approach), and repeated near-identical bot messages are suppressed.

## 5. Threads

Threads keep the main timeline readable. A delegation card is posted in the main timeline; its work (questions, updates, results, approvals) lives in the card's thread. Threads are one level deep. `GET /api/rooms/:id/messages?thread=<rootId>` reads one.

## 6. Streaming replies

Phase 1 posts whole replies (included models are not streamed token by token today). Phase 2 streams: the reply is created in state `streaming`, `message.delta` events append text (ephemeral, not in the durable log), `message.final` replaces it. Clients that reconnect mid-stream receive the final message from the log. This follows the "append to one message" pattern purpose-built AI transports use rather than one event per token.

## 7. Read state

`room_members.last_read_seq` per person; unread = `rooms.last_seq − last_read_seq`. The web app marks read when the newest message is on screen (`POST /api/rooms/:id/read`).
