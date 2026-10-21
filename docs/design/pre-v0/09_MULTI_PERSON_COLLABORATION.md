# 09 · Many people, many nodes

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `rooms/*` (group rooms, handles, visibility), `router/who-speaks.ts` (representatives, private notes), `brain/relevance.ts`, `approvals/*` (owner-only cards), `delegation/service.ts` (cross-owner requests), `prisma` `peer_links`.

## 1. The model

Every person keeps their own nodes, computers, credentials and private crew room. A **group room** is where people meet; each person brings, usually, **one representative node** (their manager or PA). Work that lands on a person is handled by their representative, approved by that person privately, and done by their crew in their private crew room.

```text
Shared room "Atlas"                                Mira's private crew room
  people:          Mira · Asha · Ben · Kofi · Dana    Mira
  representatives: @mira/manager · @asha/manager      @manager · @feature · @tester · @docs
                   @ben/manager · @kofi/qa · @dana/pa
```

Why representatives and not whole crews in shared rooms: smaller prompts and fewer candidates for routing, no exposure of anyone's internal back-and-forth, and a clear "front door" per person. Grok Bot's reviewers reported coordination getting inconsistent as group size grows; keeping shared rooms to people plus one node each avoids that.

## 2. Joining: invitations and consent

- Phase 1 (scaffold): the room owner adds existing Node accounts by handle; each person adds only **their own** nodes.
- Phase 2: **invitations** (by handle or email; the invitee accepts) and **peer links** (`peer_links`): consent between two people for their nodes to send each other work requests (`allowRequests`), blockable at any time. A representative cannot send a request to a person who has not accepted a peer link with its owner; the request becomes a plain room message instead.
- Leaving a room removes the person's nodes from it; their pending cross-owner delegations are cancelled and requesters are told.

## 3. Routing in shared rooms

- Each person states their **responsibility** in the room ("backend API", "database", "QA", "client"). It is shown in the member list and fed to the relevance router.
- An unaddressed human message goes to the representatives; with several, one cheap router call (paid by the author) picks the one or two whose owner's area is touched ([05 §3.3](05_ROOMS_AND_ROUTING.md#33-the-relevance-router)). A clear `@mira/manager` or `@mira` skips routing.
- Messages from nodes wake nobody unless they mention someone (mention-gating), so representatives do not chat among themselves without purpose.

## 4. Private approvals and visibility

Three visibility scopes (`packages/shared/src/messages.ts`): `room`, `owner` (one person), `accounts` (a set).

- **Owner-only cards.** When a representative needs its owner — a plan to approve, a draft reply to post, a request to accept, an engine permission — the card is a message in the shared room with `visibility: owner`. Only that person sees it, marked "Only you can see this"; it is also in their Inbox and on their phone. They can approve, deny, edit or answer in place; the result (if any) is posted for everyone afterwards.
- **Private notes.** A person can write a private note in a shared room (the lock in the composer). Only they and their own nodes see it — useful for "@manager, prepare a proposal for this but don't post yet".
- **Enforced at three layers:** SQL (`visible_to` filters on every list), the event stream (`mayReceive`), and node prompts (a node's transcript contains only what its owner may see, so a node can never quote someone else's private card).

Grok Bot keeps approvals, secrets and drafts out of group chats entirely (1:1 only). Node keeps them **in context** — where the request happened — but visible to one person, and mirrored to the Inbox.

## 5. Acting on behalf

- A representative's messages in a shared room carry `onBehalfOfAccountId` and render as "Mira's Manager · for Mira".
- `room.post_external` defaults to **ask**: the drafted reply becomes an owner-only card ("Post this reply for you?") and is posted exactly as approved. Owners who trust their representative can lower it to "Do it, tell me".
- A node never commits its owner to dates, scope, prices or people without approval (charter rule + autonomy: requests from non-owners are never fully autonomous).

## 6. Requests between people's nodes

`request_peer` (or a delegation to another person's node) creates a **cross-owner delegation**:

1. The card appears in the shared room; the assignee's owner gets an owner-only "Request for your Manager: …" card.
2. Accept → the assignee node gets the work and runs it **on its own owner's computer**, with its owner's models, credits and approvals. Deny → `declined`, the requester is told.
3. Progress visible to the requester: status changes and the final summary in the delegation thread. The assignee owner's private crew conversation stays private.
4. Results land in the assignee owner's Ensemble space; links shared in the room respect Ensemble sharing (a link to a private page shows "no access" to others unless shared).

## 7. Who sees what

| Item | Room members | The owner | Others' nodes |
|---|---|---|---|
| Room messages (`room`) | ✓ | ✓ | ✓ (in their owner's prompt window) |
| Owner-only card / private note | ✗ | ✓ | ✗ |
| A person's crew room | ✗ | ✓ | ✗ |
| Delegation card + status in a shared room | ✓ | ✓ | ✓ |
| Engine permission prompts of a cross-owner job | ✗ | Assignee's owner only | ✗ |
| Memory, charters, autonomy settings | ✗ | ✓ | ✗ (room-scope memory is visible to members) |
| Computers, keys, connected apps | ✗ | ✓ | ✗ |

## 8. Walk-through: the five-person project

People: **Mira** (backend), **Asha** (frontend), **Ben** (database), **Kofi** (QA), **Dana** (client). Each brought one representative; Mira's crew is Manager, Feature, Tester, Docs.

1. **Dana** asks her PA privately (lock): "Turn my notes into a clear request for the team." Her PA drafts; Dana approves the post. In the room: *Dana's PA · for Dana:* "Request: CSV export of invoices from the admin panel, needed by Friday. Columns: …"
2. Nobody is mentioned → the router reads responsibilities and picks **@mira/manager** (export endpoint = backend).
3. Mira's manager reads the Ensemble project, drafts a plan and asks Mira **privately** in the room: "Plan: (1) Feature: `/invoices/export.csv` streaming endpoint; (2) Tester: verify columns, auth, 50k rows; (3) Docs: API page + changelog. Needs a DB index from Ben's area — I'll ask @ben/manager. Approve?" — visible only to Mira.
4. Mira taps **Approve** on his phone. His manager:
   - sends a peer request to **@ben/manager** ("index on invoices(created_at, account_id)") → Ben gets his own owner-only card, approves, and Ben's crew handles it on Ben's computer;
   - delegates (1)–(3) **in Mira's private crew room**; in the shared room only a status card shows "Mira's team · 3 tasks · in progress".
5. Mira's Feature node runs Claude Code on Mira's computer in a worktree; a `git push` permission prompt arrives as an owner-only card for Mira; he allows it for this task.
6. The Tester finds a missing column → the manager sends a follow-up to Feature → fixed → Docs updates the API page in Ensemble.
7. Mira's manager drafts: "Done for Dana: CSV export is on staging (PR #42), 50k-row test passed, docs: API › Invoices export." → owner-only card → Mira approves → posted **for Mira**. Kofi's QA representative, mentioned by Mira, schedules its own regression check on Kofi's side.

Nobody but Mira saw his plan, his crew's discussion or his permission prompts; nobody but Ben saw Ben's; Dana saw her request, status and the result.

## 9. Compared with Grok Bot and Dots

| | Grok Bot | Dots | Node |
|---|---|---|---|
| Several people's agents in one room | Team Bot: one shared bot, private per-teammate chats | One owner; others' messages are context | Each person's own representative, private crews, peer requests |
| Approvals in a shared conversation | Never in groups (1:1 only) | Owner channel | Owner-only card in the room + Inbox |
| Speaking for someone | — | Posts in Slack as the dot | Explicit "for <owner>" with approval by default |
| Consent between people | Team admin | Workspace admin | Per-pair peer links |

## 10. Abuse and safety

Rate limits per person and per node in each room; room owners remove members; anyone can leave; peer links can be blocked; requests from non-linked people never start work; every cross-owner action is in both owners' audit ledgers.
