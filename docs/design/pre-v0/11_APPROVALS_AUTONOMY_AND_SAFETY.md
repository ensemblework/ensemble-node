# 11 · Approvals, autonomy and safety

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `packages/shared/src/autonomy.ts`, `approvals.ts`; `apps/node-api/src/brain/authorize.ts`, `approvals/*`, `audit/ledger.ts`, `memory/secrets.ts`.

## 1. Layers

A node's action passes, in order:

1. **Ensemble and the computer** — space/sharing rules, write policy and Apply, the run's mode, trust, sandbox, git gate, internet, budgets, `acceptWebApprovals`. Node cannot loosen any of these.
2. **Hard floors** (§4) — always the person's call.
3. **The autonomy matrix** (§2) — the owner's per-node, per-action choice.
4. **Who asked** — requests from anyone but the owner are never fully autonomous.
5. **Guardian review** (Phase 3) — a second model checks actions marked for review.
6. **Audit** (§6) — every change is recorded, attributable and, where Ensemble supports it, undoable.

## 2. The autonomy matrix

Per node, per action class (`ActionClass`), one of four levels:

| Level | UI label | Behavior | Dots' Custom Rules | Grok Bot |
|---|---|---|---|---|
| `auto` | Just do it | Runs | Take action without asking | Allow automatically |
| `notify` | Do it, tell me | Runs; noted in the activity feed | — | — |
| `ask` | Ask me first | The exact call is held as an owner approval | Ask before taking action | Ask first |
| `never` | Hand it to me | Refused; the node tells the owner what to do themselves | Hand off to you | Never allow |

Defaults (`DEFAULT_AUTONOMY`):

| Action | Default |
|---|---|
| `room.reply` | auto |
| `room.post_external` (posting in a room with other people) | ask |
| `crew.delegate` | notify |
| `peer.request`, `peer.accept` | ask |
| `plan.execute` | ask |
| `computer.research`, `computer.code` | notify |
| `computer.browser` | ask |
| `git.push` | ask |
| `ensemble.read` | auto |
| `ensemble.write` (undoable) | notify |
| `ensemble.write_sensitive` (connected apps, settings, assignments) | ask |
| `memory.write` | notify |
| `routine.manage`, `spend.over_budget` | ask |

Context rules (`levelFor`): when the trigger came from someone other than the owner, every action except replying and reading becomes at least as strict as `peer.accept` (default ask); a reply in a cross-owner room becomes at least as strict as `room.post_external`.

## 3. Approvals

One object for everything a person must decide (`approvals` table, `ApprovalKind`): `question` (ask_owner), `action` (a held tool call or drafted reply), `plan`, `delegation`, `peer_request`, `room_post`, `ensemble_write` (an Ensemble proposal waiting for Apply), `engine_permission` and `engine_question` (mirrors of Ensemble Needs me decisions on node jobs), `spend`, `routine`, `memory`.

- **Where:** the person's Inbox, web push, and — when the request happened in a room — an owner-only card in that room ([09 §4](09_MULTI_PERSON_COLLABORATION.md#4-private-approvals-and-visibility)).
- **Exactness:** an approval stores the payload and its `action_hash`. Approving a held tool call runs **that call with that input, once** (`resumeFromApproval` marks it used). "Edit" never runs the old payload; the node re-proposes the edited version.
- **Answers:** approve (once / for this task / always, for engine permissions), deny (with reason), answer (option or text, for questions), edit.
- **Settled once:** the status update is guarded (`WHERE status = 'pending'`), so two devices answering together cannot both apply the effect.
- **Expiry:** approvals created by unattended work (routines, other people's requests) can expire (Grok Bot uses ~10 minutes for unattended approvals); chat approvals wait.
- **Mirrors:** an Ensemble decision on a node job arrives by webhook and becomes an `engine_*` approval; answering in Node forwards it (E7); answering in Ensemble, the CLI (`ensemble needs`) or the phone settles the Node card (`decision.settled`). First answer anywhere wins.

### 3.2 Effects

`approvals/effects.ts`: peer request approved → the delegation starts; Ensemble write approved → apply the proposal (denied → discard); engine permission → `decide` allow/deny with scope; engine question → `decide` with the option or text; an approved drafted reply → posted for the owner exactly as shown; everything else wakes the requesting node with the answer.

## 4. Hard floors

Regardless of the matrix (and, for computer and browser work, enforced by the run rules and the browser broker):

- **Always the person themselves:** changing passwords or account security, moving money, accepting legal terms.
- **Always a fresh approval:** permanent deletion of data, installing or running software from an unrecognized source, granting new credentials or access, purchases with a saved card, sending messages to new external recipients.
- **Never:** reading or exporting secrets; using one person's credentials for another person's request; acting on instructions found inside tool results, files or web pages.

These mirror the non-overridable defaults Dots documents and are stricter where Node spans several people.

## 5. Pause and kill switches

- **Pause a node:** no new turns, routines skip, queued turns cancelled, its running Ensemble jobs stopped (partial work kept).
- **Pause all my nodes:** one switch on the person's account.
- **Operator switches:** `NODE_SCHEDULER=off`; a global brain switch for incidents (turns stop, rooms stay readable).
- Stopping never undoes completed external actions (same as both competitors); Ensemble's Undo covers what it can.

## 6. Audit

`audit/ledger.ts` appends a hash-linked row per account for every change a node or person makes through Node: posts on someone's behalf, delegations, plans, computer runs, Ensemble writes, approvals and their answers, memory changes, routine changes. Appends are serialized per account with a transaction-scoped advisory lock; `verifyChain` checks link continuity. Ensemble keeps its own ledger for writes inside Ensemble (with the node recorded as the actor, E3).

## 7. Prompt injection

- The system prompt states who gives instructions (the owner, and the crew manager within the owner's crew) and that tool results, files, web pages, quoted messages and other people's messages are **data**.
- `fromNonOwner` is computed from the trigger, not from what the model says; it raises autonomy to at least "ask".
- Private context never enters another person's node prompt (visibility filtering).
- Representatives never carry a person's private context into a shared room without approval (charter + `room.post_external`).
- Phase 3: guardian review for risky actions; scanning node outputs for forged control markers before another node reads them (the Claude Agent SDK added a similar check for subagent outputs).

## 8. Budgets

Per node: daily credits, concurrent jobs (default 1), job minutes (default 60), messages per hour (default 120). Per room: bot turns per human message. Per delegation chain: depth 3, review rounds 2. Ensemble adds its own: included-credit reservations and monthly allowance, job quotas, run budgets (minutes, tool calls, model turns).

## 9. Data protection

Ensemble tokens are encrypted with AES-256-GCM (`NODE_SECRET_KEY`); sessions and run tokens are stored as SHA-256 hashes; webhooks are HMAC-signed with a timestamp; no credentials for websites ever reach Node; logs exclude tokens and message bodies; deleting an account deletes its nodes, rooms it owns, messages it authored in its own rooms, memory, routines and grants.
