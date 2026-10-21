# 06 · Crews, delegations and plans

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `apps/node-api/src/crews/routes.ts`, `delegation/*`; `packages/shared/src/delegation.ts`, `plans.ts`; `templates/`.

## 1. Crews

A crew is one person's team of nodes with a **manager** in front. Creating one from a template (`POST /api/crews {templateId}`):

1. creates each node from its node template (slugs that already exist get `-2`, `-3`…), each with its own DM;
2. creates the **crew room** with the person and every node, routing `lead`, the manager as lead;
3. records the crew (manager, room, members in order).

Default templates ([14 §4](../../06_CAPABILITIES_AND_ROADMAP.md#4-templates)):

| Crew | Nodes |
|---|---|
| Software team | Manager · Feature engineer (Claude Code, opus) · Tester (Codex, gpt-6.1-sol) · Docs writer (Claude Code, sonnet) |
| Research desk | Manager · Researcher (Ensemble's agent, research jobs) · Docs writer |

Each node "owns and knows" its job through its **charter** (becomes `AGENTS.md` in its run folder), its **skills** (Ensemble Skills: house style, release checklist…) and its **memory** (what it learned about your project). The docs writer, for example, learns your documentation rules once and keeps them in memory.

You can still talk to any crew member directly (@mention it in the crew room, or its DM); the manager is the default, not a gate.

## 2. Plans

A manager turns a request into a plan with `propose_plan` (`packages/shared/src/plans.ts`):

```json
{
  "goal": "Add Google sign-in to the admin panel",
  "steps": [
    { "id": "build",  "title": "Implement Google OAuth", "assigneeNodeId": "feature", "brief": "…", "acceptance": ["…"] },
    { "id": "verify", "title": "Test the sign-in flow",  "assigneeNodeId": "tester",  "dependsOn": ["build"], "kind": "review", "brief": "…" },
    { "id": "docs",   "title": "Document setup",         "assigneeNodeId": "docs",    "dependsOn": ["build"], "brief": "…" },
    { "id": "report", "title": "Summarize for Mira",     "assigneeNodeId": "manager", "dependsOn": ["verify", "docs"], "kind": "report", "brief": "…" }
  ],
  "notes": "Assumes the existing session middleware; asks before adding a dependency."
}
```

Rules: 1–20 steps (managers aim for ≤8), unique ids, known dependencies, no cycles (`validatePlan`), assignees resolved from handles to node ids in the room. `plan.execute` defaults to **ask**: the exact `propose_plan` call is held as an approval and runs unchanged when approved (Edit sends the owner's version back to the manager to re-propose).

Running (`delegation/plans.ts → advancePlan`): ready steps (all dependencies done, not started) become delegations; each finished delegation advances the plan; a failed step wakes the manager (`plan_step_failed`) to re-plan or escalate; when every step is done the plan is `done` and the manager is woken to report (`plan_done`).

## 3. Delegations

A delegation is the structured twin of "@tester please verify the branch": who asked, who does it, brief, acceptance criteria, status, the Ensemble job, the result.

### 3.1 Lifecycle

| Status | Meaning | Next |
|---|---|---|
| `proposed` | Created | `awaiting_approval`, `queued`, `declined`, `cancelled` |
| `awaiting_approval` | The assignee's owner must accept (cross-owner) | `queued`, `declined`, `cancelled` |
| `queued` | Assignee woken / job waiting for a computer | `running`, `cancelled`, `failed` |
| `running` | Work in progress (job claimed or running) | `needs_input`, `review`, `done`, `failed`, `cancelled`, `interrupted` |
| `needs_input` | Job waiting on a person (Ensemble `waiting_approval`/`blocked`) | `running`, `failed`, `cancelled` |
| `review` | Job succeeded; the assignee summarizes | `done`, `running`, `failed`, `cancelled` |
| `interrupted` | Lease lost (sleep, crash). **Never resumed silently** | `queued` (explicit retry), `failed`, `cancelled` |
| `done`, `failed`, `cancelled`, `declined` | Final (`failed` can be retried as `queued`) | — |

Ensemble job statuses map with `fromEnsembleJobStatus` (`queued`/`claimed` → queued, `running`/`stopping` → running, `waiting_approval`/`blocked` → needs_input, `succeeded` → review, `failed`, `cancelled`, `interrupted`).

### 3.2 Flow

1. **Create** (`delegate`, a plan step, or `run_on_computer`'s self-delegation): checks the assignee is active and in the room, computes depth (refused past `NODE_MAX_DELEGATION_DEPTH`), posts a **delegation card** in the main timeline mentioning the assignee; the card's thread is where the work lives.
2. **Cross-owner?** The assignee's owner gets an owner-only **peer request** card. Approve → `queued`; deny → `declined` and the requester is told.
3. **Start:** the assignee gets a turn (`reason: delegation`). It refines the brief and usually calls `run_on_computer`, or does the work with Ensemble tools alone (the docs writer editing an Ensemble page).
4. **Run:** Ensemble job lifecycle arrives by webhook; permission prompts and questions become owner-only cards in the thread; `node_post_update` milestones appear in the thread.
5. **Finish:** the job succeeds → `review` → the assignee's turn checks the result and calls `finish_delegation` (done/failed + summary). The delegator (e.g. the manager) is woken (`delegation_done`) and the plan advances.
6. **Changes:** the delegator calls `request_changes` → a **follow-up delegation** linked to the original (finished work is never reopened, like Ensemble's run feedback), at most two rounds, then escalate.
7. **Stop:** `stop_work` (assignee, delegator or owner) stops the Ensemble job and cancels; partial work stays on the branch.

## 4. Delegation styles

The 2026 frameworks name two styles (OpenAI Agents SDK and LangGraph use the same words):

- **Agent-as-tool** — the manager keeps control; the specialist returns a result. Node's crew delegations work this way: workers report into the thread, the manager owns the conversation with the person.
- **Handoff** — the specialist takes over the conversation. Node uses this when a person talks to a crew member directly, and between people's representatives in a shared room (peer requests).

## 5. Mirroring to the Ensemble board

With `mirror.ensembleProjectId` set on the room, each delegation creates (through Ensemble tools) a task in that project: title, brief on the task page, owner `agent`, a tag `node:<slug>` (first-class agent identity is E8), linked to the job. Status changes update the task; the result links the run, the PR and changed files. Ensemble stays the place where the work is tracked; Node is where it is discussed.

## 6. Several nodes, one repository

Feature, tester and docs writer often touch the same repository. Ensemble serializes jobs that share a folder, which would make a crew sequential. **E5b worktree placement** gives each job its own git worktree and branch, created by the runtime (never by the agent — 2026 CVEs in Claude Code and Cursor abused agent-controlled worktrees and hooks), with `.git` internals kept read-only as Ensemble already does. The manager plans branch names (`node/<slug>/<topic>`) and merge order; the tester checks out the feature branch read-only; merges and pushes follow each node's `git.push` autonomy.
