# 13 · API, events and protocols

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Routes as scaffolded on 19 Oct 2026 (`apps/node-api/src`). All JSON; errors are `{ error, code? }` with HTTP status. Browser routes need the `node_session` cookie (`credentials: "include"`, CORS limited to `NODE_WEB_ORIGIN`).

## 1. REST

### Auth and me

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/ensemble/link` | Start Phase-0 sign-in; returns `{ userCode, verifyUrl, interval }` and sets a short-lived cookie |
| POST | `/api/auth/ensemble/link/poll` | `pending` / `approved` (session started) / an error status |
| GET | `/api/auth/ensemble/start`, `/api/auth/ensemble/callback` | OAuth (E1) |
| GET | `/api/me` | The person + Ensemble connection state |
| POST | `/api/auth/logout` | End the session |
| POST | `/api/dev/session` | Development only (`NODE_DEV_AUTH_BYPASS=on`, never in production): `{ handle, name }` → local account + session |

### Rooms and messages

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/rooms` | My rooms with unread counts |
| POST | `/api/rooms` | Group room with people (handles) and my nodes (+ representative flag) and settings |
| GET | `/api/rooms/:id` | Room, settings, members (people and nodes, handles, owners) |
| POST | `/api/rooms/:id/members` | Add a person (owner/admin) or one of my nodes |
| PATCH | `/api/rooms/:id/settings` | Routing, leads, budgets, responsibilities, mirror |
| GET | `/api/rooms/:id/messages?before=&limit=&thread=` | Visible messages, oldest first |
| POST | `/api/rooms/:id/messages` | `{ body, threadRootId?, replyToId?, private?, clientId? }` |
| POST | `/api/rooms/:id/read` | `{ seq }` |

### Nodes, crews, templates

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/templates` | Node and crew templates |
| GET / POST | `/api/nodes` | My nodes / create from a template or a full `NodeSpec` (also creates its DM) |
| GET / PATCH | `/api/nodes/:id` | Read / update (slug immutable) |
| POST | `/api/nodes/:id/pause`, `/resume`, `/archive` | Status |
| GET / POST | `/api/crews` | My crews / create from a crew template (nodes + crew room) |
| GET | `/api/crews/:id` | One crew |

### Approvals, memory, routines, computers, push

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/approvals` | My pending approvals |
| POST | `/api/approvals/:id/answer` | `ApprovalAnswer` (`approve` + scope, `deny` + reason, `answer` + option/text, `edit` + text) |
| GET / PATCH / DELETE | `/api/memory`, `/api/memory/:id` | My memory entries |
| GET / POST / PATCH / DELETE | `/api/routines`, `/api/routines/:id` | Routines (POST returns a webhook secret once) |
| POST | `/api/routines/:id/run` | Test now |
| POST | `/api/hooks/routines/:token` | Inbound webhook trigger (no session; the secret is the credential) |
| GET | `/api/computers` | Paired computers (E6) |
| POST / DELETE | `/api/push/subscribe` | Web push subscription |
| GET | `/health`, `/health/ready` | Liveness / database readiness |

Planned for Phase 1 UI: `GET /api/delegations/:id`, `GET /api/plans/:id`, `GET /api/activity`, `POST /api/nodes/:id/duplicate`, invitations and peer links (Phase 2).

## 2. Machine-to-machine

| Caller | Route | Auth |
|---|---|---|
| Ensemble | `POST /api/ensemble/webhooks` | `x-ensemble-signature` HMAC with timestamp ([08 §4.4](08_ENSEMBLE_INTEGRATION.md#44-e4--webhooks-to-node)) |
| Run MCP server on a computer | `GET /api/runs/tools`, `POST /api/runs/tools/:name` | `Authorization: Bearer nrt_…` (one delegation) |

## 3. Live events

`GET /api/events` — Server-Sent Events, one stream per tab, covering every room the person is in plus personal events. Each durable event has an `id`; on reconnect the browser sends `Last-Event-ID` and the server replays what was missed (up to 500, else `resync` and the client refetches). A comment heartbeat every 25 seconds keeps proxies open.

| Event | Payload | Durable |
|---|---|---|
| `message.created`, `message.final` | Message | yes |
| `message.delta` | `{ roomId, messageId, seq, text }` (Phase 2 streaming) | no |
| `message.deleted` | `{ roomId, messageId }` | yes |
| `typing` | `{ roomId, principal }` | no |
| `node.activity` | `{ nodeId, activity: idle \| thinking \| working \| waiting_human \| waiting_computer \| offline \| paused }` | no |
| `delegation.updated` | `{ roomId, delegationId, status, title }` | yes |
| `plan.updated` | `{ roomId, planId, status }` | yes |
| `approval.created`, `approval.settled` | Approval / `{ approvalId, status }` (personal) | yes |
| `computer.status` | `{ deviceId, name, online, lastSeenAt }` (personal) | yes |
| `room.updated` | `{ roomId }` | yes |

Events are filtered per person by room membership and `visible_to` before they are written to the stream (`lib/visibility.ts`). Several API processes share events through Redis pub/sub; durable events are written to Postgres first.

## 4. Protocol choices

From the [2026 landscape](../../research/landscape-2026.md) §C:

| Boundary | Node now | Later |
|---|---|---|
| Web ↔ Node | REST + SSE with the event names above | Map events to **AG-UI** 1.0 event families (text message, tool call, state, activity) if third-party clients appear |
| Node ↔ tools (Ensemble) | Ensemble's Actions API (E3) | Read-write **MCP** facade (`/mcp/actions`, stateless MCP 2026-07-28, OAuth 2.1 via E1) |
| Node/computer ↔ coding agents | Ensemble's engines: Claude Code stream-json + hooks, Codex app-server, Cursor **ACP** | ACP for more agents (Gemini CLI is native ACP; Claude Code and Codex have ACP adapters) — added in Ensemble |
| Node ↔ external agents | — | **A2A** v1: publish an Agent Card per node (`/.well-known/agent-card.json` per handle) so outside agents can send tasks (they arrive as peer requests needing the owner's approval); nodes can call external A2A agents as tools. A2A is pairwise; Node keeps group semantics in rooms |
