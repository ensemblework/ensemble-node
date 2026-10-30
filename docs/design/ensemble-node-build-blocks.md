# Ensemble Node: build blocks

**Status: Proposed.** 29 October 2026. Companion to [Reliable work before more agents](ensemble-node-runtime-plan.md) (“the plan”). The plan says why and what. This document says how and in what order. Section marks (§) refer to the plan.

Each block is a unit to build, test on testing and review before the next one starts. A block lists its goal, contract, files, acceptance tests, how it ships, and a rough size.

## 1. Rules for every block

- **Order.** Build the blocks in order unless §2 marks one as parallel. A block is done when its acceptance tests pass in CI and its demonstration works on testing.
- **Where code goes.** Backend changes go to Ensemble's `testing` branch: `apps/hub-api`, which is both the hosted API and the local sidecar in the CLI and desktop app. Website changes go to Node's `testing` branch. A device-side change needs a CLI and desktop release before the website depends on it.
- **Promotion.** At the end of each milestone, run its demonstration on testing. Then promote Ensemble and then Node to production, release the CLI and desktop app if they changed, and merge `main` back into `testing`. No milestone stays testing-only.
- **Versioned contracts.** A plan records its contract version (`contract: 2` from B1, `3` from B4). Older plans finish on the code path they started with. Nothing reinterprets a live plan halfway through.
- **A pure decision core.** From B1, the scheduler's decisions are a pure function, `decide(state) → actions`. Storage moves to tables in B4 without touching that logic, and most scheduling tests need no database.
- **Docs.** Each block updates Ensemble's `docs/35_ENSEMBLE_NODE.md` (and 25 or 30 when a device or engine contract changes) and Node's `docs/01` and `docs/06`.
- **No new product limits.** Concurrency, rate limits and resource claims prevent collisions. They never block legitimate work. Budgets and time limits are the owner's opt-in choices.
- **Sizes.** S is about a day of focused agent work, M two to four days, L one to two weeks. They are rough, for ordering only.

## 2. Overview

Blocks B15–B21 and C1–C7 come from [the node as manager, and rooms with people](ensemble-node-manager-and-rooms.md) (“the extension”). Their section marks are prefixed **E§**. The table below gives the full order of record. Block numbers are identifiers, not positions.

| Milestone | Blocks, in order | What the owner notices |
|---|---|---|
| **M1 Crews tell the truth** | B0 Harness · B1 Typed outcomes · B2 Repair loop · B3 Settings end to end | A failed test holds dependent work; the builder fixes it and the tester retests without being asked. Model and context choices stick. |
| **M2 Crews survive; the node stays in charge** | B4 Durable coordination · B5 Decisions close with their work · B15 Lanes: always available · B16 Session manager | Deploys and restarts do not break crews. The node answers while work runs. Steer, queue, stop and replace from the chat or the card. No stale Needs me. |
| **M3 Plans keep the whole request** | B6 Mission contract · B7 Worker-reported results and evidence · B8 Collapse the middle model · B17 Assistant parity and every space · B18 Helpers that work, shown inline | Every requested feature is tracked. Screenshots and reports open from the plan. Helpers do real work inside the chat. Nodes reach all of the owner's spaces. |
| **M4 The node has hands and eyes** | B9 Device tools · B10 Browser broker and live view · B19 Capture: screenshots and video of anything · B20 Media in the conversation | The node browses, runs things, tests UIs and desktop apps, and sends screenshots and videos only after checking them. |
| **M5 It signs in for you** | B11 Local login hand-off and saved logins · B12 Credential isolation and encrypted entry · B21 Remote browser takeover | Sign in once, at the computer or from the phone. Secrets never reach a model or a worker's environment. |
| **M6 Breadth on a reliable core** | B13 Parallel work in one repository · B14 Routines | Two builders work on one repository without collisions. Reliable work repeats on a schedule or event. |
| **M7 Rooms with people** | C1 Audience-bound turns · C2 Rooms v2 · C3 Questions and requests across people | Public talk is people and their leads only. Each person has a private My crew. Requests to someone's agents reach them privately. |
| **M8 A shared space for the room** | C4 Shared space binding and proposed tasks · C5 Events, status cards and catch-up · C6 Results into the room and the board | Assign a task to a collaborator, and their lead and agents take it from there and report back with evidence. |
| **M9 Collaboration extras** | C7 Contracts, decisions log and room steward | Interface changes reach the right people early. Decisions are recorded once. |

Start Part B (M7–M9) only once the owner is satisfied with M1–M5 for one person.

Dependencies:

| Block | Needs |
|---|---|
| B0 | Nothing; comes first |
| B1 | B0 |
| B2 | B1 |
| B3 | B0; can run in parallel with B1–B2 (shares `node/plans.ts`) |
| B4 | B2 |
| B15 | B4, B5 (late-result fencing for stop and completion) |
| B5 | B4 |
| B16 | B15, B5 |
| B6 | B4 |
| B7 | B1 |
| B8 | B6, B7 |
| B17 | B4 (lanes and turns carry a space); independent of B6–B8 |
| B18 | B6, B15 |
| B9 | B5 (its policy uses decisions), B7 (scoped secrets, evidence) |
| B10 | B7, B9 |
| B19 | B9, B10 |
| B20 | B7, B19 |
| B11 | B5, B10 |
| B21 | B11, B12 (device keys for end-to-end encryption) |
| B12 | B11 |
| B13 | B6 |
| B14 | B5, B6 |
| C1 | M1–M5 done; B17 |
| C2 | C1 (includes code-built status cards) |
| C3 | C2, B5; public result delivery is completed in C6 |
| C4 | C3, B17; Ensemble space changes (E§20) |
| C5 | C4, C2 |
| C6 | C4, B20 |
| C7 | C5, C6; each watcher's own repository access |

## M1 Crews tell the truth

### B0 Harness: reproduce the failures first

**Goal.** Tests that fail today for the reasons in §4, so each later block proves its fix.

**Scope** (Ensemble `apps/hub-api/src/node/`):

- **A scripted engine** for node integration tests: a fake coding agent whose runs end with a chosen status, summary and, from B7, structured report. Extend the existing crew test in `node.integration.test.ts`, which today scripts only successful reports.
- **A small fixture builder**: `crew({ lead, nodes })`, then `plan(steps)`, then `script(outcomes)`.
- **Incident fixtures**, synthetic with no production text:

| # | Fixture | Today | Turns green in |
|---|---|---|---|
| F1 | Build A → test A (reports FAIL) → build B → test B | B starts | B1 (held), B2 (repaired) |
| F2 | Four requested features; the plan covers two | Plan ends `done` | B6 |
| F3 | API restart while a step's turn runs | Step ends `blocked` | B4 |
| F4 | `node_session_send` continuing a session with an explicit model and long context | Context is dropped | B3 |

- **A model evaluation set**, not a CI gate: ten planning prompts with the expected requirement lists and gates. Run it against Luna, Sol low and Sol medium. Record requirement recall and whether the first plan proposal validates. B6 uses it.

**Acceptance.** F1–F4 exist and are marked expected-to-fail (`todo`) with their reasons.

**Ships as** tests only. **Size** S–M.

### B1 Typed step outcomes and gates

**Goal.** A failed verification can never release dependent work (§4.2, §7.2).

**Contract** (`contract: 2`, still stored in the plan card's JSON):

```ts
type StepKind = "build" | "verify" | "write" | "research" | "other";
type StepOutcome = "unknown" | "done" | "pass" | "fail" | "blocked" | "unverified";

type Check = {
  id?: string;                // from B6: the acceptance criterion it covers
  name: string;
  verdict: "pass" | "fail" | "blocked" | "skipped";
  detail?: string;
  evidence?: string[];
  rerun?: { command: string; cwd?: string; expects: "exit_0" | { outputMatches: string } }; // checks as code, §8.5
};

type StepReport = {
  outcome: "done" | "pass" | "fail" | "blocked";
  summary: string; // at most 2000 characters
  checks?: Check[];
  subject?: Candidate; // what was built or tested
  evidence?: Array<{ kind: "commit" | "file" | "url" | "log" | "screenshot"; ref: string; caption?: string }>;
  blockedBy?: "needs_owner" | "login_required" | "missing_access" | "environment" | "unknown";
};

// What a build produced and a verification tested. A commit when the mission allows commits;
// otherwise a content hash of the working tree (git write-tree on a temporary index), so
// "publish: none" still has a candidate identity.
type Candidate = { repo?: string; folder?: string; branch?: string; commit?: string; contentHash?: string; url?: string };

type Attempt = {
  n: number;                       // 1, 2, …
  reason: "first" | "repair" | "retest" | "nudge";
  candidate?: Candidate;           // build: produced; verify: the one it was told to test
  outcome: StepOutcome;
  report?: StepReport;
  failureSignature?: string;       // verify fail: see B2
  startedAt: string; endedAt?: string;
};

// Added to PlanStep:
//   kind: StepKind; verifies?: string; attempts: Attempt[];
//   outcome: StepOutcome   // = the current (latest) attempt's outcome; history stays in attempts
```

**Rules,** in the pure `decide(plan)`:

| Predecessor's current outcome | Dependents |
|---|---|
| `done` (build, write) or `pass` (verify) | May start |
| `fail` | **Held**: a computed state, shown as such, never `skipped`. B2 reopens the failed line. |
| `blocked` or `unverified` | Held. |

- `status` stays the execution state; `outcome` is the current attempt's result. Gates and the plan's end state read only current outcomes, so a failed first attempt followed by a passing retest counts as passed. History stays visible.
- **Quiescence.** The plan is quiescent when no step is working and no waiting step can start. Today that condition is "nothing is waiting or working", which held steps would never satisfy. At quiescence the lead's report turn runs and lists held steps with the reason. Without this rule, B1 alone would leave a plan waiting forever.
- **Code computes `pass`.** Before B6, a `verify` attempt passes only when it reports at least one check and **every** check passed. A `blocked` or `skipped` check means the attempt is `blocked`, and any failing check means `fail`. From B6, each acceptance criterion has a stable id and a mandatory flag, and `pass` means every mandatory criterion has a passing check.
- **Candidate binding.** A verification is told which candidate to test: the build's latest reported candidate. A report whose `subject` names a different candidate is `unverified`.
- A `verify` step may report only `pass`, `fail` or `blocked`. The tool rejects reports that contradict their checks.
- A plan ends `succeeded` (every step's current outcome `done` or `pass`), `partially_completed`, `failed` or `stopped`. It never ends a plain `done`.
- **Late events are fenced by attempt.** Runs and cards record the attempt number (`data.plan.attempt`). `stepRuns`, `stepPending`, `stepCardsWaiting`, `finishStep` and `planTurnEnded` count only the current attempt, so a late end from attempt 1 cannot settle attempt 2.

**Tools.**

- New `node_step_report`, available in step turns, taking a `StepReport`.
- `node_step_blocked` becomes a thin alias for `node_step_report` with `outcome: "blocked"`.
- If a step turn ends with prose and no report, the runtime gives one automatic prompt ("report with node_step_report"). If that also ends without a report, the outcome is `unverified`.
- `node_delegate` gains `kind` and `verifies`. When they are left out, the kind comes from the node's role (a tester's step is `verify`), and a `verify` step's `verifies` defaults to the build step in its `after`.

**Files.**

- `node/plans.ts`: types; `advancePlan` becomes the pure `decide` plus a thin effect runner; quiescence; `reportNote` lists held steps; attempt fencing in `stepRuns` and `finishStep`.
- `node/brain.ts`: the step-end block ("A step's reply is its report").
- `node/tools.ts`: the new tool.
- `node/runs.ts`: the run-end note asks for a report; run links carry the attempt.
- `STEP_RULES`: shorter; the rules that code now enforces are removed.
- Web: `components/chat/plan-card.tsx` shows outcome badges, held steps, checks and attempts; `lib/types.ts`.

**Acceptance.**

- In F1, B does not start, the lead reports once at quiescence, and the plan ends `failed` or `partially_completed`, not `succeeded`.
- A verify step that answers in prose only ends `unverified` after one prompt.
- `pass` with a failing, blocked or skipped check is rejected.
- A verification report about a different candidate is `unverified`.
- A late run end from an earlier attempt changes nothing.
- A `contract: 1` plan behaves exactly as before.

**Ships to** Ensemble testing and Node testing (the card). No device release. B1 is safe on its own: failures stop and are reported. Promote it to production together with B2. **Size** M.

### B2 Repair loop

**Goal.** In-scope failures are fixed and retested without the owner coordinating (§8.2).

**Rules,** in `decide`. Repair **reopens the same steps as new attempts**; it never adds steps. When verify step V, which verifies build step B, has a current outcome of `fail`:

1. **Reopen B** as attempt n+1 with reason `repair`. It continues B's session (same agent, model and context; B3 covers a model named explicitly). Code writes its brief from V's failing checks, evidence and tested candidate: "Fix only this. Keep everything else."
2. When B's repair attempt ends `done` with a new candidate, **reopen V** as attempt n+1 with reason `retest`, bound to that candidate. It runs in a session separate from the builder's; it may continue V's own session. If V's earlier attempt recorded re-runnable checks (§8.5), the retest packet tells the verifier to run them first and to judge only what they cannot show. From B9, the runtime runs them itself before any model turn.
3. V's dependents keep waiting on V. Nothing is rewired.

**Progress detection.** Two separate identities:

| Identity | Computed from | Used for |
|---|---|---|
| **Failure signature** | The sorted ids of failing checks plus a normalised hash of each failure's message, with paths, times and hashes stripped. It never includes the commit. | Is this the same failure again? |
| **Candidate identity** | The commit, or the working-tree content hash when the mission does not allow commits | Did the repair change anything? |

Repair of a line stops when the repair attempt leaves the candidate unchanged, or a retest fails with the same failure signature as the previous one. The lead then gets one judgement turn with the history. It may change approach or agent, ask the owner, or defer the requirement. It cannot simply ask for the same repair again: a third identical signature escalates to the owner as one Needs me decision. There is no fixed round limit while failures keep changing; the owner may set a budget.

**Owner decisions.** `blocked` with `blockedBy: "needs_owner"` raises one Needs me decision, not a chat message. Dependents stay held.

**Card.** Attempts show under their step ("Attempt 2 · repair", "Attempt 2 · retest"). There are no new top-level steps.

**Acceptance.**

- F1 extended: test A fails, A is repaired and retested, the retest passes, then build B starts, and the plan ends `succeeded`.
- A repair that changes nothing triggers one lead turn and no further repair.
- The same failure signature on new commits triggers the lead turn; a third repetition reaches the owner once.
- Works with `publish: none` (content hash, no commit).
- The main thread holds only the plan card and the final report.

**Ships to** Ensemble testing and Node testing. **Size** M.

### B3 Execution settings end to end

Can run in parallel with B1 and B2. It shares one file with them (the step run note in `node/plans.ts`); agree that part first. Until B3 lands, B2's repair continues the builder's session with its stored settings, which already works when no model is named explicitly.

**Goal.** The owner's chosen agent, model, effort and context survive start, continuation and step dispatch, and the worker never has to check them (§4.4, §9.2).

**Changes.**

- `node_session_send` gains `context` (and `fast` where an engine supports it).
- `inSession` in `workspace/assign.ts`: when a model is named, still inherit `contextTier` and `reasoningEffort` from the session unless they are named too. Represent `inherit`, `provider_default` and `explicit` as distinct values instead of `undefined`.
- Each job records the settings **requested** (from the step or mission), **resolved** (sent to the adapter) and **observed** (reported by the engine, or `not_reported`). Adapters report effort and context where the agent's CLI exposes them.
- A mandatory setting the engine cannot honour raises one decision, for example "Copilot on this computer does not offer long context for this model: run with the default, or choose another". Nothing is silently substituted.
- The run's instructions say: "These settings are already applied: …. Do not check them."

**Files.** `node/sessions.ts` (`SendInput`), `workspace/assign.ts`, the engine adapters, `remote/contract.ts` (observed fields), the step run note in `node/plans.ts`.

**Acceptance.**

- F4 passes.
- A mismatch surfaces once.
- No worker stops to verify its own model.

**Ships to** Ensemble testing. Observed settings need a device release; until then the website shows "not reported". **Size** M.

### M1 demonstration

On testing, in a synthetic repository, run steps 1–5 and 7 of the plan's first end-to-end demonstration (§13), with a seeded regression.

## M2 Crews survive; the node stays in charge

### B4 Durable coordination

**Goal.** Committed state is the only truth. Restarts and deploys resume work, and steps start within seconds (§4.5, §4.10, §9.1).

**Schema** (Prisma, additive; `contract: 3`):

```prisma
model NodeMission {
  id            String    @id @default(uuid())
  userId        String
  leadNodeId    String
  originRoomId  String
  originPrivate Boolean
  cardMessageId String    @unique
  contract      Int
  status        String    // planning | running | waiting_for_user | waiting_for_device | repairing | succeeded | partially_completed | failed | stopped
  revision      Int       @default(0)
  goal          String?
  constraints   Json?     // B6
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  endedAt       DateTime?
}

model NodeStep {
  id             String    @id
  missionId      String
  nodeId         String
  kind           String
  brief          String
  after          String[]
  verifies       String?
  requirementIds String[]  // B6
  run            Json?
  status         String
  outcome        String
  report         Json?
  attempt        Int       @default(1)   // the current attempt
  attempts       Json      // Attempt[] from B1, history included
  sessionId      String?
  startedAt      DateTime?
  endedAt        DateTime?
  version        Int       @default(0)
}

model NodeOutbox {
  id          String    @id @default(uuid())
  operationId String    @unique  // carried to the consumer, which stores it under its own unique constraint
  missionId   String?
  kind        String    // step.start | turn.enqueue | run.ended | mission.report | notify
  payload     Json
  dedupeKey   String    @unique
  availableAt DateTime  @default(now())
  attempts    Int       @default(0)
  deliveredAt DateTime?
  error       String?
}
```

`NodeRun` stays as the attempt record. It gains `stepId`, `attempt`, and B3's requested, resolved and observed settings.

**Reserved now for later blocks,** so that Part A does not paint Part B into a corner (extension E§3, E§16):

| Model | Fields | Used by |
|---|---|---|
| `NodeMission` | `executor` default per step (`self`, `session`, `helper`, `node`, `person`); `spaceId` (where the work lives); `requestedBy` (account and node); `deliverTo` (room and audience) | B15, B17, C3, C6 |
| `NodeTurn` | `lane` (`conversation:<room>:<public or private>` or `work:<step>`); `audience` (`owner` or `room`), set by **where the output goes**, never widened later; `spaceId` | B15, B17, C1 |
| `NodeTurn`, `NodeMission` | Four principals: `dataPrincipal` (always the owner), `billingPrincipal`, `executionDevice`, `approver` (E§12) | C1, C3, C7 |
| Every outbox effect and mutating tool call | An intent row with its operation id, written before dispatch | B15 (non-abortable turns), B4 reconciliation |

They default to today's behaviour: owner audience, the owner as all four principals, the owner's home space, and the conversation lane.

**Behaviour.**

- **Transactions.** The `decide()` result and its outbox rows commit in one transaction. A dispatcher claims rows with `FOR UPDATE SKIP LOCKED` and marks each delivered after its effect.
- **Effects are idempotent at the consumer, not just in the outbox.** A unique `dedupeKey` deduplicates rows, not effects. Every outbox row carries an **operation id**, and each consumer stores it under a unique constraint before acting: `NodeTurn.operationId`, `WorkspaceJob.operationId` (a session start or send), and the device's tool and browser operations (B9, B10). A redelivered row finds the existing turn, job or operation and does nothing new.
- **Unknown effects are reconciled, not retried.** An operation that started but recorded no result is `unknown`. The dispatcher asks the consumer (the job's state, the device's operation journal) before doing anything else. A model is never told "retry if needed".
- **Tool receipts are written as they happen.** Today a node turn's tool calls are saved only when the turn ends. B4 writes each tool call's receipt (name, operation id, result summary) when it completes, so a restart knows what a cut-off turn already did.
- **Wake on completion.** The hosted handler that devices post to, `POST /api/devices/self/jobs/:id/complete` (`devices/routes.ts`), inserts a `run.ended` outbox row in the same transaction that records the job's end. So do the cancel and failure paths. The sidecar only posts. The 15-second run watcher becomes a 60-second reconciliation.
- **Restart.** A running turn with no tool receipts is queued again. A turn with receipts resumes with a note that lists them, and the same operation ids prevent repeats. No step ends `blocked` because of a restart. Queued turns that belong to a live mission are no longer dropped for age.
- **The card.** The plan message becomes a view of `NodeMission` and `NodeStep`. The API returns the same `PlanData` shape plus the new fields. Contract 1 and 2 plans stay in JSON until they end.

**Acceptance.**

- F3 passes.
- Killing the API between a transition and its dispatch starts the next step once after restart.
- Killing the API after a session start was sent but before the outbox row was marked delivered does not start a second session.
- A duplicate `complete` produces one transition and one wake.
- On testing, the next step starts within 3 seconds (95th percentile) after a run ends.

**Ships to** Ensemble testing (a migration). **Size** L.

### B5 Decisions close with their work

**Goal.** Needs me never holds an actionable request for work that has ended (§10.5). This is the "Expire Needs Me requests when their task ends" feature.

**Changes.**

- Every decision row links its mission, step, attempt and job. When any of them ends, its open decisions close as "expired: its work ended", in the same transaction. A late answer gets "This request ended with its work" and changes nothing.
- The first valid answer wins, by a compare-and-set on status. The CLI, Ensemble on the web and Node all show the same settled result.
- Expiry depends on origin (§10.5). A decision from work the owner started in chat has no timer. One from background work expires after a configurable time (30 minutes by default) and shows that it expired.
- An answer can carry a scope: `once`, `mission`, `folder` or `always`. Wider scopes are stored as owner rules, which B9 uses to ask at most once per folder.

**Files.** `lib/decisions.ts`, `routes/decisions.ts`, `node/approvals.ts`, `node/node-secrets.ts`, the device's ask and close routes.

**Acceptance.** The plan's §13 rows: "Stop while queued/running/waiting for login", "Same question answered on phone and CLI", and "Pending decisions attached to terminal work" at zero.

**Ships to** Ensemble testing. A device release is needed if the device's poll must understand the new closed state. **Size** M.

### B15 Lanes: always available

**Goal.** The owner can talk to a node while it works, and the work continues (E§3). This is the change from "one turn at a time per node" to lanes.

**Lanes.**

- `NodeTurn.lane` (reserved in B4) decides scheduling. Turns run in order within a lane and in parallel across lanes.
- Conversation lanes go first under the model's rate limits.
- Work lanes per node default to 3 in parallel; that is the owner's setting, not a product limit.

**Conversation turns stay short.** A soft budget of about 30 seconds and a few tool calls. Past it, the model is told to hand the rest to work with `node_work_start({ title, brief, executor: "self" })`. That creates a one-step mission (E§3.2).

**Work lanes.** A `self` step runs as a sequence of model turns. Each turn gets the step's packet, the work inbox and a summary of its earlier tool receipts. It ends with `node_step_report` (B1). Work lanes have no posting tools.

**Steering own work.** `node_work_steer({ work, note })` adds a note to the inbox, read at the next turn boundary. `node_work_stop` stops the work.

**The work board.** Code builds it (E§3.3) and adds it to every conversation turn.

**One voice.** A `work.ended` event wakes the conversation lane. For simple completions, code posts a result card instead of taking a model turn.

**Interruptions** (E§3.5):

- A new owner message during a conversation turn aborts and restarts it with both messages, but only while no mutating tool has been dispatched. Intent rows (B4) make "dispatched" exact.
- After that, the turn is non-abortable and the message is answered next.

**No races on one target** (E§3.6):

- Commands on one session, mission, work item, card or device resource are applied in order, with a compare-and-set on its revision.
- Crew step turns run in work lanes.
- Every chat message and card leaves through one delivery outbox per thread, in order.

**Capacity for talking.**

- Part of the talk model's concurrency and rate is reserved for conversation lanes.
- Work turns are not started when the reserve is low.
- A conversation turn that meets a rate limit or a slow provider falls back to a second model, or replies from the work board without one.

**The stop path.** `POST /api/node/stop { scope }` and the chat commands "stop" and "stop all" stop the focused item or everything, without a model. Late results are fenced by B5.

**Files.**

- `node/queue.ts`: lanes and priorities.
- `node/brain.ts`: conversation and work personas and tool sets.
- New `node/work.ts`.
- `node/plans.ts`: the `self` executor.
- Web: work items on the work board card, and a Stop menu.

**Acceptance.**

- During a three-minute `self` work item (a scripted engine and browser), the owner asks a question. The answer arrives within 10 seconds and the work continues.
- "Stop" stops it within 3 seconds, with no model call.
- A correction steers the work: its next turn sees the note.
- On completion: one message, and no duplicates after an API restart (B4).
- With three work lanes saturating the provider (scripted 429s and slow streams), the owner still gets an answer within 10 seconds.
- Killing the API between a mutating tool's commit and its receipt never repeats the mutation.
- Steer and stop issued at once from the public and private threads at one session apply in order; the stale one is rejected.

**Ships to** Ensemble testing and Node testing. **Size** L.

### B16 Session manager

**Goal.** The node is the manager of agent sessions, from the chat and from the card (E§4).

**The session card** replaces the run card in the thread. It shows the status, the current message, the queue (reorder or cancel), a live log tail, and the buttons **Steer…**, **Queue…**, **Stop and send…** and **Stop** (keep or drop the queue).

**APIs.**

- `POST /api/node/sessions/:id/{queue|steer|replace|stop}` and `PATCH /api/node/sessions/:id/queue` (reorder, cancel).
- They use the same code as the tools in `node/sessions.ts`.
- Each action records an event on the node's work board, so the node always knows.

**Queue editing.**

- Queue order is an explicit position per queued job, separate from `continueFromJobId`.
- When the next job is claimed, under a per-session lock, its `continueFromJobId` is set to the job that actually ran before it, so resume ancestry is always true.
- Reordering and cancelling touch only unclaimed jobs, with a compare-and-set on the session's version.

**Focus.** "Tell it to also…" steers the session most recently active in this thread or mission. If two sessions are equally likely, the node asks one short question.

**Watchdog.** `node/watchdog.ts` applies code rules: no progress for a set time, a repeated error signature, tokens spent with no file changes, or changes outside the mission's folder. A hit raises an attention event to the conversation lane, never a chat message.

**Agent questions** (E§4.5).

- With the owner's permission, an `ask_person` question goes to the node first.
- The node may answer only with a fact quoted from the mission, with its source, through a capability bound to that question and job.
- It never answers permissions, widening the scope, security, cost or destructive choices.
- Unanswered questions from one folder are coalesced into one Needs me item.
- Permission requests follow the decision policy.

**Handing over.** The node can explicitly take over a session no node owns, or hand a session to another of the owner's nodes (with a card).

**Files.** `node/sessions.ts`, `workspace/sessions.ts` (queue editing), new `node/watchdog.ts`, `node/routes.ts`. Web: `components/chat/run-card.tsx` becomes the session card.

**Acceptance.**

- A steer from the card interrupts the run, which resumes with the update within seconds, and the card shows "updated".
- Reordering the queue changes the order runs start in.
- Stop with keep or drop behaves as described.
- "Also update the README" in chat steers the right session.
- A stuck scripted run produces one attention event and one node action.
- A question answerable from the mission is answered by the node, with its source quoted. A permission question always reaches Needs me.
- Reordering while a job is being claimed, cancelled or steered never produces a broken or branched resume chain (concurrency test).

**Ships to** Ensemble testing and Node testing. **Size** M–L.

### M2 demonstration

Run the M1 demonstration with an API restart and a duplicate completion injected. Then stop a run that waits for approval; no card is left open. While a three-minute research task runs, ask the node about something else and get an answer at once. Steer the builder's session from its card, then by asking the node in chat.

## M3 Plans keep the whole request

### B6 Mission contract: one validated plan

**Goal.** Every requested deliverable is accounted for, and constraints are written once (§7.3, §7.4).

**Tool `node_plan`** (lead only). It replaces a series of `node_delegate` calls for crews. `node_delegate` stays for a single step.

```ts
type NodePlanInput = {
  goal: string;
  requirements: Array<{
    id: string;
    text: string;
    acceptance: Array<{ id: string; text: string; mandatory?: boolean }>; // mandatory by default
    evidence?: Array<"screenshot" | "test" | "commit" | "doc" | "url">;
  }>;
  constraints: {
    computer?: string; folder?: string; repos?: string[]; branch?: string;
    publish?: "none" | "commit" | "push" | "pr"; environment?: string;
    agent?: string; model?: string; effort?: string; context?: "default" | "long_context";
    substitution?: "forbid" | "ask" | "allow";
    order?: "serial" | "parallel_ok";
    notes?: string[];
  };
  steps: Array<{
    id: string; to: string; kind: StepKind; requirementIds: string[];
    brief: string; after?: string[]; verifies?: string; run?: StepRun;
  }>;
  deferred?: Array<{ requirementId: string; reason: string }>;
};
```

**Validation.** Errors go back to the lead, which fixes them in the same turn:

- An unknown node, or a cycle.
- A requirement covered by no step and not deferred with a reason.
- A requirement with acceptance criteria but no `verify` step.
- Acceptance criterion ids that are not unique. Verifiers report checks against these ids, and code computes `pass` from them (B1).
- `verifies` that does not point at a build step.
- `order: "serial"` without the features chained.
- A brief longer than 1500 characters. Briefs carry the step's objective only; constraints are rendered from the mission.

**Requirement ledger.** Each requirement moves `open → in_progress → accepted | failed | deferred | cancelled`, derived from its steps' outcomes. The card shows the ledger. A mission with open requirements cannot be `succeeded`.

**Revisions.** An owner message during a mission gives the lead a turn with a snapshot of the mission. `node_plan_revise({ add, cancel, constraints, defer })` increments the revision. Queued steps pick up new constraints. Running attempts are steered only if the lead chooses. A side request ("also add this board task") becomes its own mission or a single step and never overwrites a running mission.

**Prompts.** Remove the persona's "put into every brief what your owner said" rule, and the other rules that code now enforces. Move the node prompts into `packages/prompts` with snapshot tests, and record a prompt version on each turn.

**Acceptance.**

- F2 passes: the remaining requirements stay visibly open, and the mission can end `partially_completed` at best.
- Grouping several features in one step under `order: "serial"` is rejected.
- On the B0 evaluation set, the default lead model reaches at least 95% requirement recall before it becomes the default. Measure Luna too.

**Ships to** Ensemble testing and Node testing (the ledger in the card). **Size** L.

### B7 Worker-reported results and evidence

**Goal.** The coding agent that did the work returns the structured result and the files the owner should see (§7.5, §10.4).

**First: scoped run secrets.** Before any new way for data to leave the computer ships, stop giving every run every saved secret (§4.7). A node run gets only the secrets its step or mission names, chosen by the owner, or named in the secret request that created them. It gets none by default. Hub and CLI runs keep today's behaviour until the owner opts in. B9 and B10 rely on this. Full isolation follows in B12.

**Run MCP server.** The `ensemble` server, which today offers `ask_person`, gains two tools:

| Tool | Behaviour |
|---|---|
| `report_result(StepReport)` | Stored on the job and validated: the shape, and that the reported candidate exists (the commit is in the folder's repository, or the content hash matches the working tree). |
| `attach_evidence({ path, kind, caption?, requirementId? })` | `kind` is screenshot, image, video, trace, report, log or file. Upload rules are below. The file goes to a new `POST /api/devices/self/jobs/:id/evidence`, into blob storage behind Ensemble Files, linked to the job and visible to the owner only. |

**Upload rules,** enforced on the device and again on the server:

- **One evidence folder per run.** The runtime creates it (`.ensemble/evidence/<run>` under Ensemble's data folder, not the repository) and tells the agent its path. An attached file outside it is first copied in by the runtime under the same checks.
- **No link tricks.** Files open with no-follow and by descriptor, regular files only. The resolved path is checked again after opening, and hard-linked files with several names are refused.
- **No credential files.** `.env*`, key and certificate files, shell histories, and Ensemble's and the browser broker's own folders are refused, as are files that contain a saved secret value.
- **Size limits.** Images and other files up to 20 MB; video and traces up to 100 MB.
- **Content checks.** The server sniffs the MIME type. HTML, SVG and other active formats are served only as downloads or in a sandboxed frame with a strict content security policy. Text types are redacted. Images cannot be redacted, which is one reason sensitive steps stop screenshots (B11).
- **Audience.** Evidence keeps the mission's audience and retention. It never becomes visible in a shared room unless the owner shares it.

**Fallback.** An engine without MCP writes `.ensemble/result.json` and puts files in the run's evidence folder; the runtime reads them when the run ends.

**Engine instructions.** Every adapter adds one short paragraph on reporting.

**Node.** `node/runs.ts` uses the structured report when there is one, without paraphrase, and the step's outcome comes from it. The step's node takes a turn only for `blocked` or a missing report.

**Privacy.** Only files the agent explicitly attaches are uploaded, never source files implicitly. A per-computer switch (`ensemble evidence off`) turns upload off; the evidence then shows as "on this computer, not uploaded".

**Web.** An evidence gallery on the step: thumbnails, a lightbox, a video player and downloads, each with its caption, tested candidate and viewport.

**Acceptance.**

- The plan's §13 row "Agent reports a screenshot path" gives an attachment that opens.
- A missing report gets one prompt, then `blocked: no_report`.
- A secret value in an attached log is redacted.
- A symlink to `~/.ssh/id_ed25519`, a hard link, `.env`, and a file swapped after the check are all refused (tests).
- An uploaded SVG or HTML file does not run script in the web app.
- A node run without named secrets sees none of the owner's saved secrets.

**Ships to** Ensemble testing, a **CLI and desktop release**, and Node testing. **Size** L.

### B8 Collapse the middle model

**Goal.** Executable steps go straight from a compiled packet to the coding agent (§8.4).

**Changes.**

- **A packet compiler** in code, with sections Goal, Your part, Constraints, Inputs, Settings, Who you are and Report. It stays within about 6000 characters and links to full sources rather than pasting them.
- **Dispatch.** `build` and `verify` steps, and `write` steps on a computer, start or continue a session directly. Same line of work → continue the session; verification → an independent session. The owner's "ask before computer work" setting (`autonomy.computerWork`) still applies.
- **When the step's node takes a turn:** for `blocked` reports, a missing report after the prompt, non-executable steps, and direct messages from the owner.
- **The run card** shows "What the agent was told": the packet.

**Acceptance.**

- In an M1 demonstration run, no step-node model turn happens between dispatch and verdict.
- The median time from a dependency being satisfied to its session starting is under 10 seconds.
- Each worker packet contains each constraint exactly once.

**Ships to** Ensemble testing. **Size** M.

### B17 Assistant parity and every space

**Goal.** A node does everything the Ensemble assistant does, in every space its owner can open (E§5).

**Parity.**

- A test lists the assistant's tools and fails if any is missing from node turns, apart from the two replaced by session tools.
- Playbooks, user skills, the write policy, Apply and Undo behave as for the assistant, attributed to "@node for <owner>".

**Every space.**

- Hub tool calls from a node take an optional `space` (id or name). A wrapper adds it to each tool's input.
- The gateway uses a **delegated internal identity**: `via = node`, `accountId` = the owner, `userId` = the target space, `access` = the owner's current role.
- It installs the same request scope a member request has, so Ensemble's route policy, `guestMayUse` and owner-only tools apply unchanged.
- It re-checks membership and role on every tool call and Apply.
- It never passes browser-only gates (terminal, space management, sharing, passkeys).
- Conversation history, receipts, Undo and retained results are kept per source space.
- The default space is the room's bound space (C4), then `NodeAgent.spaceId`, then the owner's account space.
- Each tool receipt records its space.

**Overview.** A read-only `node_overview` lists tasks assigned to the owner, due items and active runs across all their spaces.

**Files.** `node/brain.ts`; `assistant/agent.ts` (a space resolver per tool call); `lib/auth.ts` (an identity builder shared with browser requests); `assistant/request.ts`.

**Acceptance.**

- The parity test passes.
- A node creates a task in a space where its owner is an editor, and is refused writes where the owner is a viewer.
- The owner's connected apps are unavailable in spaces they do not own.
- `node_overview` lists work across three spaces.
- A membership revoked during a turn stops the next tool call in that space, and that space's results drop out of later context.

**Ships to** Ensemble testing. **Size** M–L.

### B18 Helpers that work, shown inline

**Goal.** Temporary helpers that can do real work and live inside the chat. Nodes can also propose new nodes (E§10).

**Helpers.**

- A helper executes a step (`executor: helper`) with a capability grant from its parent: `read`, `computer` (device tools and browser, limited to named folders) or `sessions`. The grant never exceeds the parent's own.
- It cannot create helpers or nodes unless the owner allows it.
- It reports with `node_step_report` (B1) to the parent's mission. The parent speaks to the owner.

**Inline threads.**

- The helper's conversation is a thread attached to the parent's message (`NodeMessage.threadOf`), not a task room.
- The web shows it as a collapsible thread chip under that message. It is read-only for the owner, with **Stop**, **Delete** and **Promote to node** (which keeps the charter and memories).
- Helper threads never appear in the sidebar. Existing task rooms stay readable.

**Lifecycle.** A helper ends when its step ends, plus a short grace period. Today's helper limits become owner settings with the same defaults.

**New nodes.** `node_create` and `node_create_group` post a proposal card (name, role, charter, models, crew) for the owner to confirm. The owner can switch this to "create without asking".

**Files.** `node/helpers.ts`, `node/store.ts` (threads), `node/routes.ts`, `node/brain.ts` (helper persona and tools). Web: thread component in `components/chat/message.tsx`; room list filtering.

**Acceptance.**

- A parent runs two helpers in parallel on research. The owner sees two inline threads. Their outcomes reach the parent's mission, and the parent sends one message.
- A helper with a `computer` grant for a folder can run `computer_run` there; a `read` helper cannot.
- Promote creates a normal node with the helper's charter and memories.

**Ships to** Ensemble testing and Node testing. **Size** M.

### M3 demonstration

The plan's full first end-to-end demonstration (§13) except the login step: four requested features, with screenshots and reports in the result. During it, the lead runs two research helpers, shown as inline threads, and creates a task in a space where the owner is a member.

## M4 The node has hands and eyes

### B9 Device tools for the node

**Goal.** The node checks and does quick things on the computer itself (§4.9, §6.1).

**Transport.** A new relay frame `node.tool.request`, following the pattern of `code.request`:

- Results up to 64 KB come back inline.
- Longer output streams like the web terminal: Redis chunks under a run id.
- A command running longer than 60 seconds becomes a tool run that wakes the node when it ends, like a job but without a coding agent.

**Tools** for the node's model:

| Tool | Notes |
|---|---|
| `computer_run({ folder, command, timeoutSec, background? })` | Up to 900 seconds; longer work is a session |
| `computer_files` | Today's read actions, plus `write`, `move` and `delete` under the same policy |
| `computer_git({ folder, op })` | `status`, `diff`, `log`, `show`, `branch` |
| `computer_http({ url, method })` | Local development servers only (`localhost`) |

**Execution.** Commands run exactly as coding-agent commands do today. They go through the guard in `workspace/guard.ts` (paths resolved through symlinks against one root, git calls checked against the job's ceiling) and run under the computer's OS sandbox (`workspace/sandbox/`: Seatbelt, bubblewrap, Landlock or the Windows sandbox account). The sandbox denies `SECRET_HOME_PATHS`, Ensemble's data folder, the run-secret store and the browser profile. Policy and redaction alone cannot stop a shell command from reading an absolute path; the OS sandbox can.

Where the computer reports a weak sandbox (`capabilities().strength`), the hard floor is best effort. Node shows that on the computer's card. In attended mode `computer_run` then asks once per folder, even if the owner chose *Always*.

**`computer_http`** reaches only development servers the runtime knows about: ports claimed by a `computer_run` it started, or ports the owner registered. The scheme is checked, the resolved address must be loopback, and every redirect is checked the same way.

**Policy on the device** (§10.5):

- The hard floor applies first, then the owner's rules.
- Attended: the first use per folder asks once in Needs me, with the choices *Once*, *This mission* and *Always for this folder*.
- Unattended: allowed, inside the sandbox.
- Each call carries an operation id (B4) and writes a ledger entry with the program and folder, not the output.

**Compatibility.** The device advertises a `nodeTools: 1` capability. An older device gets a clear "Update Ensemble on this computer" message. This stays separate from the human web terminal and its passkey, on purpose.

**Acceptance.**

- The plan's §13 rows for first use per folder and for unattended mode.
- A five-minute test command wakes the node once, when it ends.
- Output containing a secret is redacted.
- `cat ~/.ssh/id_ed25519`, reading Ensemble's data folder and reading the browser profile all fail under the sandbox (tests on Linux and macOS).
- `computer_http` to a non-loopback address, or a redirect to one, is refused.

**Ships to** Ensemble testing and a **CLI and desktop release**. **Size** M–L.

### B10 Browser broker and live view

**Goal.** Browse, test UIs and return screenshots, with a live view (§10.1).

**Broker.** The sidecar manages a Playwright Chromium with a persistent profile in Ensemble's data folder (`browser/<profile>`). It runs headed when a desktop session exists and headless otherwise. It starts with one profile per owner.

**Tools,** for both callers in §6.1:

- `browser_open`, `browser_tabs`, `browser_close`
- `browser_snapshot` (the accessibility tree, bounded)
- `browser_click`, `browser_type` (non-secret text), `browser_press`, `browser_wait`
- `browser_screenshot` (to evidence through B7)
- `browser_console`, `browser_network_errors`
- `browser_record` (trace or video)
- `browser_upload({ ref, file })`, from the run's evidence folder or a file the owner attached, and `browser_download`, into the run's evidence folder. Both pass B7's upload rules.

There is no script evaluation and no raw CDP access.

**Isolation.** The broker runs as its own process. Its profile folder is denied to coding-agent runs and to `computer_run` by the OS sandbox (B9), so cookies are not readable by a command either. Until B11, the profile is used for local development servers and public pages; the owner may sign in by hand in the headed window.

**Leases and identity.** Every browser session belongs to a durable operation: a job attempt for a coding agent, or a B9 tool operation for the node. Screenshots, traces and downloads are filed as that operation's evidence through B7. A tab belongs to one operation; the node and a coding agent never drive the same tab.

**Live view.** While a lease is active, a frame about every 3 seconds goes to the run card through Redis with a five-minute lifetime. It pauses during sensitive steps.

**UI testing.** The repository's own deterministic tests run first. Exploratory checks follow at the listed viewports, with screenshots. Animations get a trace or video.

**Acceptance.**

- A tester verifies a page on a local development server and attaches screenshots at two viewports.
- The live view shows on a phone.
- No tool, and no sandboxed command, lets an agent read cookies.
- A node-direct screenshot appears as evidence on the step that asked for it.

**Ships to** Ensemble testing, a **CLI and desktop release**, and Node testing (live view and gallery). **Size** L.

### B19 Capture: screenshots and video of anything

**Goal.** Screenshots and videos of web pages, `localhost` apps, Electron apps and other desktop apps, and smooth video of animations (E§8). Linux first, then macOS.

**Capture service** in the sidecar, with two callers: the node's device tools and the run MCP server.

| Target | How |
|---|---|
| `web` | Playwright (viewport, full page, element, device emulation, video) |
| `electron` | Playwright's Electron launch, with video |
| `gui` | A private virtual display (Xvfb) per capture session, the app launched on it, its window found by process id, and frames or video taken with `ffmpeg` |
| `terminal` | Transcript, optionally rendered to an image or video |
| `desktop` | The owner's real screen. Later, opt-in, with the system's consent prompt. |

**Tools.**

- `capture_screenshot({ target, url | app, viewport?, fullPage?, element? })`
- `capture_video({ target, url | app, durationSec, steps?, fps?, mode: "realtime" | "frames" })`
- `capture_app_start({ command, cwd, display: "virtual" })` returns a handle; `capture_app_stop({ handle })`

**Frame-stepped animation** (E§8.3): control the page's time, step each frame, screenshot it, and encode with `ffmpeg`.

**Media pipeline.**

- MP4 (H.264), a poster frame and a small preview.
- A two-minute default limit, which the owner can raise.
- Output goes into B7 evidence.

**Virtual displays** each get a minimal window manager. The sidecar allocates them under a lease and tears them down; a janitor reaps expired leases after crashes. That is part of this block, not B13. They never touch the owner's screen.

**Privacy** (E§8.4):

- Password and code fields, and marked elements, are masked at capture.
- Tabs in a login or takeover state are never captured.
- A local scan matches saved secret values and runs OCR for key-like strings. A hit is blurred, or the capture is held.
- The owner can mark origins as never captured, or always previewed first.

**Codecs.** System `ffmpeg` with H.264 where present. Otherwise a downloaded LGPL build writing VP9 in WebM. A licensing check is needed before release.

**Setup.** `ensemble capture setup` installs Playwright's browsers and a static `ffmpeg` into Ensemble's data folder. It prints the one command for system packages (`xvfb`). The computer reports a `capture` capability.

**macOS** uses window capture with the Screen Recording permission. Windows comes later.

**Acceptance.**

- Screenshots of a `localhost` app at two viewports.
- A demo Electron app on Ubuntu: launched on a virtual display, a screenshot and a 15-second video taken, the owner's screen untouched, with the screen locked.
- A GTK app captured the same way.
- A 3-second CSS animation recorded frame-stepped at 60 fps has 180 frames with exact timestamps, and the moving element sits where the animation's timing says at sampled frames.
- A page showing a saved secret value is blurred or held, never uploaded in clear.
- A killed sidecar leaves no display or app behind after restart.
- On macOS, denied Screen Recording permission produces one clear message.

**Ships to** Ensemble testing and a **CLI and desktop release**. **Size** L.

### B20 Media in the conversation and confirm-before-send

**Goal.** The node sends screenshots and videos in the chat, only after checking them (E§8.5).

**Media messages.**

- Node messages can carry evidence attachments: image grids, a video player with poster, and downloads. The audience follows the message's audience.
- The conversation lane's `node_send_result({ text?, evidence })`, or code's result card (B15), delivers them.

**Confirm before sending,** each recorded as a check on the step:

1. The process is alive and its window is up with the expected title.
2. The image is not blank, and the expected text is present.
3. Functional assertions pass, for web and Electron.
4. A vision judgement passes against the acceptance criteria.

A failure is a failed verification, and the repair loop runs (B2). Media that the privacy scan holds, or that is from a sensitive origin, is shown to the owner first as a preview card, and is sent only if they confirm.

**Web.** A media message component that works well on a phone.

**Acceptance.**

- The worked example (E§8.7) ends in one message with a video, a screenshot and the list of checks.
- A blank screenshot is caught and leads to a repair.
- Videos play on a phone.

**Ships to** Ensemble testing and Node testing. **Size** M.

### M4 demonstration

"Check the sign-up page on my dev server on mobile and desktop, fix anything broken, and show me." The node starts the development server (B9) and browses it (B10). It hands the fix to a builder, retests, and returns screenshots.

Then the extension's Electron example (E§8.7): "Make me a small Electron app that shows my GitHub notifications. Send me a video when it works." The owner receives one message with a checked video.

## M5 It signs in for you

### B11 Local login hand-off and saved logins

M5 starts **local**: the owner signs in at the computer. Remote takeover from a phone is a later feature (plan §10.2); the live view (B10) only watches.

**Detection.** The broker's heuristics or a worker raise `login_required(origin, profile)`. That raises a decision card, and all observation of that tab stops: screenshots, snapshots, live view and traces. The headed window comes to the front on the computer.

**The login chain, local part** (§10.2): a login saved on the device, otherwise hand-over in the headed window. The broker fills saved values; the model never sees them. Saving a login happens on the computer (a small broker dialog, or `ensemble browser save-login <origin>`). The remote secure form comes with B12's encrypted entry.

**Resuming.** The owner chooses "I'm done" in the card or in a small broker toolbar. The broker checks a signed-in condition the worker declared (a URL pattern or a selector), and the same step resumes.

**Saved logins** live in a device-side store, separate from run secrets, encrypted with a key held in the OS key store, and denied to sandboxed runs.

**Acceptance.** The plan's §13 rows "Missing authenticated session" and "Browser task needs a login with a saved credential". A canary test finds no credential in prompts, traces, screenshots or results.

**Ships to** Ensemble testing, a **CLI and desktop release**, and Node testing. **Size** L.

### B12 Credential isolation and encrypted entry

**Changes.**

- **Finish what B7 started.** B7 already gives node runs only the secrets they name. B12 extends that to every run, with the owner's agreement, and labels the remaining environment-variable path as compatibility mode.
- **Broker operations by reference.** `secret_http({ ref, url, method, headers, body })`, limited to each secret's allowed destinations. A git credential helper handles pushes.
- **Encrypted entry.** The device generates a key pair and keeps the private key in the OS key store. Its public key's fingerprint is recorded at pairing and shown on the computer and in the web app. The web encrypts in the browser (WebCrypto, an AEAD scheme) with associated data binding the device id, decision id, origin, expiry, nonce and key version. The device accepts each decision's ciphertext once. The hosted API relays only ciphertext. Re-pairing rotates the key; unpairing revokes it. The hosted site still serves the web code, which the threat model states plainly.
- **Remote secure form.** With encrypted entry in place, B11's login chain gains its third option: the owner types a login on the phone and the broker fills it, optionally saving it to the device.
- **Accurate wording.** Fix the secure card's text and the docs (§4.7).

**Acceptance.** The plan's §13 secret rows. A canary value shows that the API never logs or holds plaintext.

**Ships to** Ensemble testing, a **CLI and desktop release**, and Node testing. **Size** L.

### B21 Remote browser takeover

**Goal.** The owner signs in, or takes control of the Ensemble browser, from the web app or a phone (plan §10.2; E§7).

**Live view and input.**

- The broker streams the tab with Chromium's screencast. Frames are relayed to a canvas in the web app.
- Clicks, typing, scrolling and keys are sent back as input events.
- The target is under 300 ms of latency on a good connection.

**Only during a takeover.** Takeover happens only on a login decision or the owner's **Open browser**. The model's observation of that tab is paused throughout. Typed keys reach no model and no log.

**End-to-end encryption.** Frames and input are encrypted between the device and the owner's browser with B12's pinned device key and a per-session key. The hosted relay forwards ciphertext only, so it can neither read keystrokes nor inject input.

**Capability.**

- A takeover needs a short-lived, single-use capability bound to the account, device, tab, origin and decision. Only the owner, signed in, can obtain it.
- One controller at a time.
- Input events carry sequence numbers, so replays are refused.
- It ends at once on expiry, sign-out, unpairing or **I'm done**.

**Resuming.** **I'm done**: the broker checks the signed-in condition, and the step resumes.

**Acceptance.**

- Sign in to a test site with a one-time code from a phone.
- A canary shows no credential in logs or prompts.
- The model sees no frame from the takeover.
- The relay stores and can read no frame or key (inspection test).
- A second browser cannot take control while one has it.
- A replayed input event is refused.

**Ships to** Ensemble testing, a **CLI and desktop release**, and Node testing. **Size** L.

## M6 Breadth on a reliable core

### B13 Parallel work in one repository

- **The strategy is the mission's choice**, set in its constraints (`parallel: "serial" | "worktrees" | "snapshots"`). The default is serial in one checkout. Ensemble never imposes a branch or merge workflow and never creates, pushes, merges or opens a pull request beyond the mission's `publish` and `branch` constraints.
- **Worktrees:** the runtime manages a worktree per build step, on local branches named by the mission (or temporary local branches that are never pushed unless publishing allows). An integration step combines them the way the mission says: merge, rebase or patch.
- **Snapshots:** when the owner does not want branches, each builder works in a detached worktree and integration applies their patches to the main checkout.
- Resource claims cover the checkout or worktree, the branch, development-server ports, and browser profiles and tabs. Claims prevent collisions; they never refuse work. Conflicting work waits.
- Verification always names an immutable candidate (B1).

**Acceptance.** The plan's §13 rows "Two writers target one checkout or tab" and "Candidate changes after a passing test". **Size** L.

### B14 Routines

- A routine is a saved mission template (a skill), a trigger (a schedule with a time zone, an Ensemble event or a webhook), an owning node and a notification rule.
- Each occurrence has a deduplication key. A routine can be tested now and paused. Its decisions expire as background decisions (§10.5).

**Acceptance.** The plan's §13 row "Scheduled event is delivered twice", and no notification storm on a burst of events. **Size** M.

## M7 Rooms with people

Start only when M1–M5 satisfy the owner for single-person work. The design is in the extension's Part B, which is open to change as the single-person work teaches us.

### C1 Audience-bound turns

**Goal.** What a lead may see and say for someone other than its owner is enforced in code (E§16).

**Changes.**

- A turn's `audience` (reserved in B4) is set by **where its output goes**. Every turn that answers in the Room tab is `room`, even when the lead's own owner asked. Owner-wide turns exist only in My crew and the owner's direct chat. No turn widens its audience later.
- `room` and `owner` turns keep separate histories, caches and receipts, keyed by room, lane, audience, principal and space.
- For `room` turns, the tool gateway allows reads only of: the room's public history, the bound shared space (with the owner's role), the owner's status card, items marked shareable, and the decisions log.
- Anything else raises one private card to the owner ("Ben asked X. May I share Y?"). Writes stay held, as today.
- Per-collaborator trust settings (E§15) are stored per room and person. They decide whether reachable items are answered at once or asked about, and whether free-form answers to others may use the lead's model, within a per-room budget (the billing principal, E§12).

**Acceptance.**

- A turn started by another person cannot read the owner's private spaces, pages, memories or missions, even when asked directly. A canary page is never quoted.
- The owner asking their own lead in the Room gets a room-bound answer. A canary from My crew never appears in the Room.
- The disclosure card appears once, and its answer is respected.

**Size** M.

### C2 Rooms v2

**Goal.** People talk to people and to leads; each person works with their own nodes in private (E§13, E§14).

**Routing** (E§14):

- Unaddressed messages wake no node.
- Only leads answer in public.
- Mentions of another person's non-lead node are routed to that person's lead.
- Node messages wake nobody.
- `@leads status` is a code-built card from each person's **status card**, introduced here. It is built by code from tasks assigned to them in the room's work and from their missions for the room, at the detail level they choose. C5 later adds events and the digest.

**Tabs.**

- **Room**: public.
- **My crew**: a private lane per person. Today's `visibleTo` and private conversations become a tab.
- **Board**: after C4.

**Composer.** **Send to everyone** or **Ask my nodes**, the latter with a quote of the Room message. My crew has **Share to room**.

**Away handling.** Leads say when their owner is away and answer status within scope.

**Leaving.** A person leaving the room atomically loses its capabilities, subscriptions, trust grants given to them and pending deliveries to them. Shared-space membership is asked about separately.

**Migration.** Existing rooms switch to v2 with a one-line notice. Their history is kept.

**Acceptance.**

- An unaddressed public message produces no node post.
- A non-lead node never posts in public.
- "Ask my nodes" on a Room message gives a private answer in My crew.
- `@leads status` takes no model turn.

**Size** M–L.

### C3 Questions and requests across people

**Goal.** Structured questions, shares, reviews and work requests between people, through their leads (E§15).

**Changes.**

- `NodePeerRequest` records for `question`, `share`, `review` and `work`.
- Before C4, `work` is a private card to the target owner. From C4, it is a proposed task, but only when both people are current editors of the room's shared space; otherwise it stays a private card.
- `review` pins an immutable commit or URL. The target owner confirms the exact candidate. The requester grants read access to that commit only. The verifier runs sandboxed, with no secrets, limited network and a clean checkout.
- The requester sees status and public answers; the target owner sees the full card, with **Accept**, **Edit**, **Decline with a note** and **Always accept requests like this**.
- A person's own lead can relay a request for them ("ask Ben's lead…"). It is attributed to the person.
- Accepting creates a mission with `requestedBy` and `deliverTo` (B4 fields).

**Acceptance.**

- A question is answered within scope.
- A question needing private information raises a card.
- A work request never runs before acceptance. Once accepted, the lead posts the result text; evidence on tasks and in the Room comes in C6.
- A review runs on the target's computer against the pinned commit, with no secrets in its environment.

**Size** M.

## M8 A shared space for the room

### C4 Shared space binding and proposed tasks

**Goal.** The room's work lives in a shared Ensemble space, and work across people goes through its board (E§17.1, E§15).

**Ensemble changes** (E§20):

- Member and contact limits that fit rooms, as the owner's choice.
- A room ↔ space binding.
- At join, an offer to become a member (explicit).
- A `proposed` task state with requester, and accept, edit and decline actions for the assignee.
- "@node for person" attribution on items, comments and runs.

**Node changes.**

- Accepting a shared task asks one explicit question (E§17.1):
  - **Private work, shared result** (the default) runs the mission in the assignee's own space and delivers results to the task.
  - **Shared run** runs it in the shared space, visible to all members, as Ensemble does today for members' runs.
- The Board tab shows the space's board.

**Acceptance.**

- The extension's example (E§17.1) end to end.
- A viewer's nodes cannot write.
- A space owner's connected apps never reach members' nodes.
- With "private work, shared result", members see the delivered result and evidence but not the run's transcript or code.

**Size** L, mostly in Ensemble.

### C5 Events, status cards and catch-up

**Goal.** Each lead knows what concerns its owner, and tells them once (E§17.1, E§18).

**Changes.**

- Space events (task assigned, status changed, mention, watched page edited) go to a subscription per person, through their lead. Code batches and deduplicates them.
- Status cards (from C2) are kept current by these events.
- A catch-up digest when a person returns to a room.
- Every event re-checks the recipient's access when delivered.

**Acceptance.**

- An assignment produces exactly one private message to the assignee.
- `@leads status` renders without a model.
- After a day away, the digest lists every request made of the person.

**Size** M.

### C6 Results into the room and the board

**Goal.** Finished work comes back where everyone looks (E§17.1, E§15).

**Changes.**

- A mission with `deliverTo: <room>` ends with its lead posting the result and evidence in the Room.
- The evidence is attached to the task, and the task moves to Done, or waits for the owner if they prefer to close tasks themselves.
- Cross-person review results are attached to the requester's task.

**Acceptance.** Steps 7–8 of the extension's worked example (E§19).

**Size** M.

## M9 Collaboration extras

### C7 Contracts, decisions log and room steward

**Goal.** E§17.2–17.4.

**Changes.**

- **Page roles** "contract" and "decisions log", with watchers.
  - Contract changes are detected from page edits.
  - Commits touching linked files are detected too, but each watcher's lead uses **its own owner's** repository access (their repo links or GitHub connection), never a shared credential. A watcher without access gets page-edit changes only.
  - Each watching person gets one private message from their lead, with an offer to adapt their work.
- **Decisions are logged** only when a person confirms them (a ✓ or "log this"). A superseding entry links the old one.
- **The room steward:** a node owned by the space (an Ensemble change: nodes owned by a space).
  - It acts for whoever asks it, never exceeding that person's role, with their computer and usage, and their approval.
  - Proactive chores need a sponsor and a budget, and touch only the steward's own pages and board suggestions.
  - It drafts meeting notes, keeps the decisions log, writes digests and suggests board tidying.

**Acceptance.**

- A contract change produces one private message per affected person, and nothing changes without consent.
- A decision is logged only after confirmation.
- The steward's meeting notes turn into proposed tasks for the right people.

**Size** L.

## Later

The plan's W11 covers the rest: channels (Slack, Teams, text messages), voice, full desktop control, teaching by demonstration and team-owned nodes beyond the room steward. Each needs its own design and acceptance tests.

## Decisions for the owner before building

| # | Question | Recommendation |
|---|---|---|
| 1 | Evidence upload (B7): upload what agents explicitly attach, by default, with a per-computer switch to turn it off? | Yes |
| 2 | Lead model (B6): keep Sol medium as the default until Luna meets the evaluation bar? | Yes |
| 3 | Expiry of decisions raised by background work (B5) | 30 minutes, like Grok Bot; configurable |
| 4 | Browser profile (B10): one Ensemble browser per owner shared by all nodes, as in Grok Bot, or one per node? | One per owner first; per node later if needed |
| 5 | B3 alongside B1–B2 (a second agent), or strictly in sequence? | Alongside, after agreeing the shared run note in `node/plans.ts` |
| 6 | Unattended mode and untrusted content (plan §10.5): may an unattended run widen its own scope (a new repository, an outside recipient, a production target) because a web page, email or tool output said so? | No: such a scope expansion waits as a decision. Everything inside the mission's scope still runs unattended. |
| 7 | Secrets for node runs (B7): none by default, with the step or mission naming what it needs? | Yes |
| 8 | Conversation lane model (B15) | Luna if it passes the B0 evaluation for routing and steering; otherwise Sol low |
| 9 | Work lanes per node in parallel (B15) | 3 by default; the owner's setting |
| 10 | Helpers' default capability (B18) | `read`; the parent grants `computer` or `sessions` per task |
| 11 | Nodes creating nodes (B18) | Ask with a proposal card; the owner can allow it without asking |
| 12 | Node answering its agents' questions (B16) | Only facts quoted from the mission, with their source; never permissions, scope, security, cost or destructive choices; the owner can turn it off |
| 13 | Default video length limit (B19) | Two minutes; the owner can raise it |
| 14 | Rooms (Part B) | See the extension's open questions (E§21) |
| 15 | Free-form answers by your lead to other people (C1) | Allowed within a per-room budget you set; status answers are free (code-built) |
| 16 | Shared tasks (C4): default to "private work, shared result" or "shared run"? | Private work, shared result |
| 17 | Video format when no system H.264 encoder exists (B19) | VP9 in WebM from an LGPL build, after a licensing check |

**Outcomes from the B0 evaluation** (Ensemble `apps/hub-api/scripts/node-plan-eval.mjs`; results in Ensemble docs/35 §11). Ten planning requests went to a crew lead on each model. Sol low and Sol medium handled all ten, with every expected deliverable named. Luna low handled seven, and named 10 of 14 deliverables. It sent three build requests straight to one coding run, without the checks that were asked for.

- Decision 2: the lead keeps Sol medium.
- Decision 8: a node with no model of its own talks with Sol at low thinking. Luna stays the fast model that a turn cut off by a rate limit answers with.

## Build status

Every block of this plan is built. The backend is Ensemble's `node` module (`ensemblework/ensemble`, `apps/hub-api/src/node`), described in Ensemble's docs/35. The website is this repository. Ensemble 0.6.0 ships the computer's side (the CLI and the desktop app).

| Block | Built | What is not done |
| --- | --- | --- |
| B0 Harness | Live checks with real models: `node-smoke.mjs` (the incident), `node-smoke-dm.mjs` (helpers, routines, proposals, stop) and `node-smoke-room.mjs` (two people in a room). Model evaluation: `node-plan-eval.mjs`. | |
| B1–B5, B15 | Typed outcomes, the repair loop, run settings, the outbox, lanes, a stop without a model, and decisions closing with their work | |
| B16 Session manager | Card controls, queue editing, the watchdog, agent questions answered from the mission, handing a session over or taking one over, the Sessions page | |
| B6–B8, B17, B18 | The mission contract, worker reports and evidence, direct dispatch from packets, every space, helpers inline | |
| B9, B10, B19 | Device tools, the browser broker with a live view, screenshots and video of pages and apps | App capture is untested on macOS and does not exist on Windows. The Xvfb and ffmpeg paths are tested only without those programs. |
| B20 | Media in the chat; captures checked before they are sent, including a model that reads the picture | |
| B11, B12, B21 | Sign-in hand-off and saved logins; secrets sealed in the browser for the computer's key, used by reference; remote takeover, end-to-end encrypted | No OS key store: keys are in the data folder, encrypted with the runtime's local key. There is no toolbar in the computer's own browser window. |
| B13, B14 | Parallel work (serial, worktrees, snapshots), routines | |
| C1–C3 | Audience-bound turns, rooms v2, questions and requests across people | |
| C4–C7 | The room's space and proposed tasks, room events and the catch-up digest, results onto the board, contracts, the decisions log and the steward | Contract changes are seen from page edits only, not commits. The steward is the sponsor's own node, acting only on request. |

Everything above was reviewed for security. Each finding was fixed with a regression test.

### Polish (Ensemble 0.6.0)

Read from the owner's own conversations, the polish fixed what made nodes feel broken. Ensemble's docs/35 describes the result.

| Problem | Now |
| --- | --- |
| A node asked in Needs me, then said "please allow and retry" and stopped | Every question is a card in the chat; the node's call waits and goes on by itself; a parked turn posts nothing and is woken by the answer. Answered cards fold into checkpoints. Node has no Needs me page |
| Every new website needed an approval | Public pages open without asking; the computer's own and its network's addresses ask once |
| Screenshots, `htop` and a `.md` report all went to a coding agent | A short routing table: the node does simple work itself (`computer_run`, `computer_terminal_screenshot`, `computer_sudo`, `node_share_file`, the browser); agents only write or change code |
| "Screenshot attached" with no picture | What a turn captures shows with its reply by itself; a tool that brought nothing back says so; a model that ran tools and said nothing is asked once for its reply |
| No terminal screenshots, no `sudo` | A real pseudo-terminal screen as a PNG; administrator commands approved on a card, the password sealed in the browser for the computer |
| Dangerous commands | A documented hard floor (`device-tools/dangerous.ts`) for nodes, agents and `sudo` |
| Web search returned nothing; shops blocked the browser | Included models search with Azure Foundry's `web_search` (sources and an answer); a Bing fallback; the browser presents itself as the computer's Chrome and reports human checks |
| A crew's lead pulled another node in | Crews stay crews; another node joins only on the owner's card |
| The watchdog cancelled a healthy run | Only five identical failures, four in a row, count; looking around is not failing; advice is to leave a run alone |

Routing evaluation with real models (`node-route-eval.mjs`, 11 of the owner's everyday requests, a simulated computer): GPT-6 Luna low 11/11, GPT-6 Luna medium 10/11, GPT-6.1 Sol low 11/11.
