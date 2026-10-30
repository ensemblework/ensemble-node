# Ensemble Node: reliable work before more agents

**Status: Proposed, reviewed.** Research and architecture plan, 29 October 2026; second-pass review the same day (§1.1). This is not a description of shipped capabilities.

This proposal would change [01: implementation](../01_IMPLEMENTATION_GUIDE.md), [06: capabilities](../06_CAPABILITIES_AND_ROADMAP.md), and Ensemble's guides 25, 30 and 35. It does not change application behaviour, deploy anything, or authorise work on a user's repositories.

**Build order:** [Build blocks](ensemble-node-build-blocks.md) turns this plan into numbered blocks with contracts, files, tests and release steps. This document says *why* and *what*; that one says *how* and *in what order*.

**Extension:** [The node as manager, and rooms with people](ensemble-node-manager-and-rooms.md) adds:

- the always-available node (conversation and work lanes);
- full session management;
- assistant parity across every space;
- helpers that work, shown inline;
- screenshots and video of web, `localhost`, Electron and desktop apps;
- remote sign-in;
- rooms where several people bring their own nodes around a shared Ensemble space.

## 1. Recommendation

Build **a persistent personal agent with a reliable execution system**, not a group chat in which several models try to manage one another.

The basic product promise should be:

> Give a node an outcome. It uses your connected apps and your computer, delegates specialist work to your signed-in agents, brings back inspectable results, and interrupts you only for a real decision.

Keep the existing Ensemble foundation. Replace the weak contracts between planning, execution, verification and reporting. Add a first-class local browser and results channel. Do not start with a new backend, another agent framework, more personalities, or model training.

Three principles determine the design:

1. **Models decide what to attempt; code controls lifecycle and authority.** A prompt is not a scheduler, a lock, an approval, or a test verdict.
2. **Finishing a model turn is not finishing a job, and finishing a job is not satisfying the user.** Represent these separately.
3. **One conversation can contain many pieces of work.** Work must have its own durable identity and state, independent of chat messages and model context.

Existing models are sufficient to build and evaluate this architecture. That does not establish that a small model will equal every competitor on every task. Start with a capable model for planning and repair, measure it, and move simpler decisions to cheaper models where evidence supports doing so.

### 1.1 Second-pass review

The first pass got the diagnosis right. A second pass re-checked the main code anchors in §16 (`brain.ts`, `plans.ts`, `queue.ts`, `runs.ts`, `sessions.ts`, `workspace/assign.ts`, `lib/run-secrets.ts`) and the latest crew's stored plan (read-only), and re-read the main competitor sources. The diagnosis stands. The second pass changed or added the following:

| Change | Why | Where |
|---|---|---|
| **The node needs hands.** Add typed device tools (command, files, git, browser) that the node's model calls directly, over the device relay Ensemble already has. | Today every computer action, even `git status` or a screenshot, needs a full coding-agent session. That makes the node slow, costly and indirect. It is the biggest structural difference from Grok Bot, whose bots act on their own computer. | §4.9, §6, §10.1 |
| **The worker reports, not the node.** The coding agent that did the work returns the structured result and attaches evidence through Ensemble's run MCP server, which every engine already loads. | Today the lead, the step's node and the coding agent form a chain of three models. A truncated summary is paraphrased twice before the scheduler sees it. | §4.9, §7.5 |
| **Collapse the middle model.** Executable steps go straight from a compiled work packet to the coding agent. The step's node takes a turn only when judgement is needed. | This removes a slow, lossy hop and the over-long, constraint-stuffed briefs. | §8.4 |
| **Checks as code.** A verifier leaves a re-runnable check (test, script or Playwright spec) where it can. A retest runs it again without a model. | Repair loops become cheap and deterministic, and "pass" means something. | §8.5 |
| **One validated plan proposal.** The lead submits the whole plan, with its requirements and constraints, in one tool call that code validates before anything starts. | Incremental `node_delegate` calls cannot be checked as a whole. Constraints copied into every brief by a model are lossy. | §7.4 |
| **Deploys interrupt crews.** Durable coordination moves earlier in the order. | One API process; each deploy restarts it, and recovery marks running plan turns failed. During dogfooding on testing that happens often. | §4.10, §12 |
| **Decision policy written down.** Hard floor, then the owner's rules, then attended or unattended defaults. A reviewer model may only escalate to *ask*, never deny. | Matches the owner's rule: never auto-reject ordinary work, ask once per scope, and allow everything in unattended mode. The one proposed exception (untrusted content widening scope) is left to the owner. | §10.5 |
| **Grok details that matter.** A live computer view; a login chain (stored login → password manager → secure form → hand-over); approvals that do not expire when started from chat. | These are what make Grok Bot feel capable, and the first pass under-specified them. | §3, §10 |
| **The repeated phrase in the quoted brief is a display artefact.** The stored brief is clean. | Fix it in the web plan card. It is not a coordinator bug. | §4.11 |

Nothing in the first pass was found to be wrong. Some of it was too abstract to build from, which is why the [build blocks](ensemble-node-build-blocks.md) exist.

The owner's further requirements are covered by [the extension](ensemble-node-manager-and-rooms.md). For one owner: the node stays available while it works, manages sessions, matches the assistant in every space, uses helpers, and sends checked screenshots and video. Then rooms with other people and their nodes. It adds blocks B15–B21 to milestones M2–M5, and C1–C7 as milestones M7–M9 after single-person work is solid. One consequence reaches back into this plan: B4's schema reserves lane, audience, space and requester fields now.

## 2. Evidence and limits of this assessment

I inspected Node's current guides, private hosting notes, existing research and relevant pre-v0 designs; Ensemble's Node, engine, remote-execution and orchestration documentation; and the implementation of turns, plans, sessions, run watching and secrets.

With the owner's permission, I queried the specified production account's Node records and associated jobs using **read-only Postgres transactions**, with timeouts and bounded results. No account data was changed. This document deliberately omits the account identifier, email, private computer names, private paths and raw transcripts.

The local Ensemble revision inspected was `ebff513f`; the production checkout was `2670d27811d6d769d1011f1cf8661f7633915c64`. The six inspected modules `brain.ts`, `plans.ts`, `queue.ts`, `runs.ts`, `sessions.ts` and `node-secrets.ts` were byte-identical between those checkouts. Local Node was `b9e1258`; the production website reported `007e3a7a012f20171776d772eb8431ef14f1211d`. These are snapshots, not a claim that every repository and deployed component was at the same revision.

Competitor findings below come from public primary documentation fetched for this assessment. Their internal prompts, complete orchestration algorithms, databases, queue technology and exact model routing are not public. Architectural recommendations are ours, not purported reconstructions of their private implementations.

This was not a hands-on benchmark of the competitors, a fresh execution of the reported Markdown defect, or a comprehensive security audit. A worker's report is evidence that it reported something, not independent proof of everything in that report.

The second pass re-read the main cited modules at Ensemble `ebff513f` and found those anchors accurate. It also read the latest plan's stored steps in one read-only transaction. They show: builder `done`; tester `done` with a report beginning "FAIL"; the next feature step started and then `blocked`; the retest `skipped`; and the plan `done`. That is the failure described in §4.2. It also surveyed the local runtime: the device relay, the engine adapters, the run MCP server, evidence upload and the job queue. Those findings are in §4.9–4.10.

## 3. What the comparator products actually provide

### Grok Bot: persistent work surfaces and explicit handoffs

Official documentation describes persistent named bots, each with a role and memory, using **one shared cloud computer per account**. Bots have separate screens, but those screens are not security boundaries. Files, browser sessions and logins are shared within the account; users are isolated from one another. Work continues when the user's laptop is closed. [G1, G3]

Bots can work in parallel, receive targeted messages, and hand off work asynchronously. Importantly, the collaboration documentation itself recommends **one owner at each stage** and warns that parallel handoffs can produce duplicate work and noisy updates. Grok's documented mechanism is bot messaging, not proof of a hidden deterministic DAG scheduler. [G2]

The computer is a complete work environment: browser, filesystem and terminal. Structured app connectors are preferred where available; browser interaction covers visual workflows and services without a suitable connector. The user can watch and take over the computer. Sign-ins persist. Secure forms and Vault references keep supported credential flows out of the model's context; connector OAuth tokens remain on the connector backend. [G3, G4, G7]

Results are not just final text: files, images, links and generated pages can be inspected and revised. Skills capture a procedure, its inputs, validation and approval requirements. Routines apply those procedures on schedules or events. The recommended progression is explicitly: **make a one-off task reliable, save it as a skill, then automate it**. [G5, G6]

Official security documentation also distinguishes Cloud Agent and subagent launches. This supports the pattern of handing specialist work to another execution capability; it does not establish that every difficult Grok task uses a particular coding model. [G7]

**What to take:** persistent work environments, specialised execution, reviewable results, clear stage ownership, private credential handoffs, and quiet coordination.

Details the second pass found that matter for design: [G3, G4]

- **Live view.** A computer preview sits beside the conversation and shows clicks, typing, navigation and status. The user can open it and take control. This is a large part of why the product feels capable.
- **Login chain.** A login saved in Vault first, then a connected password manager (1Password approves and fills), then a Secure Form, and only then a hand-over for SSO, passkeys, CAPTCHAs or device approvals. Values are filled into the page without the model seeing them. One-time codes can be read from a connected mailbox.
- **Auto Review.** Each action is checked before it runs. Most run on their own; some produce an approval card. The user's own rules ("Ask first", "Allow automatically") adjust this, and built-in safety checks always apply. Text from an email or a web page never counts as the user's request.
- **Approval expiry depends on origin.** A card raised by work the user started in chat waits without a timer. A card raised by background work expires after 30 minutes. A new message from the user closes open cards.
- **Local execution is a separate, explicit permission.** Commands on the user's own computer use one setting: ask every time, always allow, or never.
- **Bots extend themselves.** A bot can install an app or add an MCP server by URL or command. Server-side, Grok Bot runs on Cursor's account and connector backend, which explains its Cloud Agent hand-offs.

**What not to copy blindly:** bot-to-bot chat as the source of truth, vendor-specific limits, shared credentials as an isolation mechanism, or every feature in the marketing checklist.

### ChatGPT dots: an ongoing coordinator with separate work threads

OpenAI describes a dot as an always-on agent with ongoing responsibilities, its own cloud computer, browser, connected apps and memory. Its launch documentation names GPT-6 Astra. It starts with a primary dot; teams of user-created dots are described as a future direction, not established parity with Grok's multi-bot groups. [O1]

A dot can split work into background agents, start visible cloud threads, and create or continue local Work/Codex tasks or tasks in a configured Codex cloud environment. A delegated task has its own conversation and selected context; it does not automatically inherit every conversation with the parent. Existing tasks remain attached to their original execution environment. [O3, O4]

The documentation makes an especially relevant distinction: **a completed run does not by itself confirm that the requested result was achieved or delivered**. Activity and task inspection exist to review that difference. [O3]

Cloud work can continue with the user's computer off. Local work needs the connected computer online. Browser takeover, secure sign-in and saved credentials are separate mechanisms. The model is paused during supported secure sign-in; protected credential services supply values outside its context. [O2, O4]

Proactive research is a separate, code-restricted read-only activity. It cannot itself send messages, change connected apps, or control the browser/desktop. Follow-up actions go through ordinary authority checks. The action-review system is separated from environments in which generated code executes. [O2]

**What to take:** separate conversation and work identities, focused task context, durable responsibilities, original-environment session continuity, and a distinction between execution completion and accepted results.

**What is not established:** the model size of each background agent, the private scheduler implementation, or consumer multi-dot crews equivalent to Grok.

### Claude Duet: attention management and completed deliverables

Anthropic describes Duet as a proactive agent, powered by Opus 5.5, using the account's memory, skills and connected apps. It works in a cloud VM with its own browser and can continue when the user closes the app. It periodically checks connected accounts rather than checking continuously. [A1, A2]

The main thread is deliberately quiet: the Tasks tab carries ongoing work; the thread receives results and decisions. The help centre says Duet may suggest completion, but the user marks tasks completed. It is not documented as a user-configurable multi-node engineering crew. [A3]

Duet has private login forms and approval flows. Its announcement explicitly links its credential handling to Managed Agents. That engineering article explains a useful public architecture: **separate the session log, model harness and execution environment**, and keep credentials outside the environment in which generated code runs. This is evidence for the credential/separation pattern, not proof that every Managed Agents internal is Duet's exact implementation. [A2, A4]

There are real limitations: the launch article says Duet cannot yet show its browser, and some tasks are weaker than others. Do not claim that all three competitors offer the same live-computer interface. [A2]

**What to take:** attention management, returning work rather than commentary, explicit task state, selective background activity, and separation of durable state from execution.

### Comparison that should drive our priorities

“Documented” below means publicly described, not independently benchmarked. “Partial” means useful pieces exist, not an end-to-end guarantee.

| Capability | Grok Bot | ChatGPT dots | Claude Duet | Ensemble Node today |
|---|---|---|---|---|
| Persistent assistant identity | Named bots | Primary dot | One ongoing agent/thread | Implemented nodes, charters and memory |
| User-visible multi-agent coordination | Groups and handoffs | Background agents; multiple user dots not established here | Multi-node crews not documented | Quiet crew plans exist; outcome gates are weak |
| Work while user's device is off | Cloud computer | Cloud computer | Cloud VM | Local jobs wait; hosted controller can still operate |
| User's signed-in coding tools | Cloud/subagent delegation; local access separate | Local/cloud Work and Codex | General task execution; exact delegation internals undisclosed | Multiple local engines and session continuation implemented |
| Persistent authenticated browser | Documented | Documented | Documented cloud browser | No first-class Node browser broker found |
| Watch/take over browser | Documented | Documented | Browser viewing absent in launch description | No first-class Node handoff contract found |
| Private credentials | Vault/forms; connector backend | Secure forms and credential service | Private forms; separate credential handling | Secure card/local store exists; isolation promise needs strengthening |
| Inspectable generated results | Files, previews, pages and media | Task files, results and activity | Docs, sheets, decks and task results | Run logs and changed-file evidence; result attachment path incomplete |
| Recurring and event work | Skills and routines | Scheduled/event responsibilities | Periodic proactive checks | No general Node routines |
| Memory and procedures | Per-bot context; reusable skills | Context, saved notes, memory | Existing Claude memory and skills | Per-node facts and Ensemble skills; mission state mostly prose |
| Quiet attention model | Stage-owner guidance; can still be noisy | Primary coordinator plus activity | Explicitly quiet main thread | New crew behaviour is much better than old logs |

Two conclusions:

- The competitors' advantage is an integrated **work runtime**, not simply better role prompts.
- Native access gives Node a useful execution location, not automatic reliability, login access, screenshots, isolation or 24/7 availability.

The 19 October research in this repository is useful but not current truth. For example, Grok's fetched approval page now describes 30-minute expiry for background requests, where the old notes said approximately ten. Its collaboration and approval pages also disagree about approvals in groups. Treat such details as uncertain until reconciled, rather than copying them into our product requirements.

## 4. What is actually going wrong in Ensemble Node

### 4.1 The earlier message storm was real; the newer crew is different

The retained older crew contains 127 records: 6 human messages, 66 node text messages, 17 run cards, 13 error notices and 25 system notices. Twenty-one system notices repeat the “too many node messages” brake; the 13 errors report rate limiting.

The largest retained rolling 60-second window contained **42 non-human records**. This supports the reported noisy failure, but does not independently establish the exact recollection of 80+ messages within one minute.

The later crew contains 15 records: 5 human messages, 5 node text replies, 2 plan cards and 3 nested run cards. Current crew routing prevents node messages from waking other crew nodes. Do not diagnose today's implementation as if that correction did not happen.

The old records demonstrate chatter, repeated brake notices and rate-limit pressure. They do not by themselves prove the exact race or code revision that produced every duplicate.

### 4.2 The latest failure is a broken outcome contract

The later run gives a particularly clear sequence:

1. The implementation worker reported a Markdown change.
2. The independent tester explicitly reported **FAIL**, with a concrete pipe-character table regression.
3. The tester's process finished successfully, so its job status was `succeeded`.
4. The tester's Node step was also stored as `done`.
5. The next feature depended on that step being `done`, so it was scheduled.
6. That worker read the failed test report and correctly refused to start.
7. The lead reported the failure and suggested the next repair, but no repair-and-retest work was scheduled. The plan was stored as `done`.

The final human-facing report was honest about the failure. The problem is not that every model lied. The **runtime could not distinguish “testing finished” from “the implementation passed testing.”**

The code explains it:

- `node/brain.ts:443-457` treats a non-empty step reply with no pending runs/cards as `done`. It does not require a structured outcome.
- `node/plans.ts:216-255` releases dependencies when predecessor steps are `done`.
- `node/plans.ts:26-45` has no acceptance/check verdict in `PlanStep`.
- `node/plans.ts:284-303` concludes reporting as `done` even when work is blocked or skipped.

The annoying refusal quoted in the request was therefore **a sensible worker obeying the gate** after the scheduler incorrectly released it. The system should have routed the failed check back to its implementation owner instead.

### 4.3 The plan does not preserve the whole request

The first plan put three separate features in one builder step and placed independent testing after the builders. That did not encode the requested per-feature test gate.

The replacement plan represented Markdown and Needs Me expiry, but left resizing, custom-board parity and documentation as prose saying they still needed queueing. There was no durable requirement-to-step coverage map keeping those obligations open.

This is not solved by adding “do not forget” to the prompt. Every requested deliverable needs a recorded disposition: planned, accepted, blocked, explicitly deferred, or cancelled by the user.

### 4.4 Execution settings are not an end-to-end contract

The first worker stopped because it could not verify the required reasoning/context settings, despite the job record requesting them. The continued implementation job retained the model but had no `contextTier` in its persisted context. A later fresh tester job did carry `long_context`.

This does **not** prove which context window the provider actually used. It demonstrates missing reliable attestation and inconsistent persisted intent.

There is a concrete contract gap: `node_session_send` accepts model and effort but no context setting (`node/sessions.ts:74-93`), while start accepts the richer run settings. `workspace/assign.ts:116-139` can skip inheriting context/effort when a model is explicitly named.

The controller should not ask an LLM to infer its own configuration from prose or a public model page. It needs machine-readable **requested, resolved, and observed** settings.

### 4.5 Durable jobs do not make the entire coordinator durable

Ensemble already has persisted jobs, device leases and recovery. Keep them. Node adds weaker coordination edges:

- `node/queue.ts` serialises turns through process-local maps and promises.
- Recovery marks interrupted turns failed and drops old queued turns rather than recovering a durable mission checkpoint.
- `node/plans.ts` commits a state change and enqueues the next turn afterwards.
- `node/runs.ts:45-61` marks a result reported before enqueueing its follow-up.
- Node live events use an in-process SSE hub.

Those commit/enqueue gaps can lose a continuation if the process fails between them. These are **code-derived failure windows**, not a claim that a restart caused the inspected test-gate incident.

### 4.6 Evidence is mostly narrative, not a contract the coordinator can use

The tester reported screenshots and a reproduction file by local path. Its job evidence contained files/model/cost fields, but not a structured acceptance verdict or a first-class screenshot/report attachment associated with a requirement.

The Node watcher forwards truncated summaries, not a typed verification result. A mobile user receiving “see this local file” has not received a usable deliverable. Existing Ensemble `Artifact` records largely represent connected-app items; they are not automatically a run-output transport.

### 4.7 The secrets feature exists, but its strongest wording is inaccurate

There is already a useful secure card, encrypted local storage and redaction. Do not rebuild it as though nothing exists.

However:

- `node/node-secrets.ts:154-169` receives the raw value in the hosted API and relays it to the device. “Not persisted here” is different from “the server never sees it.”
- `lib/run-secrets.ts:53-66` decrypts all saved run secrets into the coding process's environment. “Not intentionally inserted into the model prompt” is different from “unreachable by model-directed code.”

No credential disclosure was observed in this assessment. The design issue is that redaction and instructions are not the same guarantee as credential isolation.

### 4.8 More prompting or a stronger lead will not fix these contracts

The inspected lead was already configured for **GPT-6.1 Sol, medium reasoning**; its recorded turns used that model. Some specialists used Sol and the tester controller used Luna. It is not credible to attribute the whole failure to a tiny lead model.

There are useful scripted integration tests for routing, concurrency, sessions, stop and approvals. The principal crew test scripts successful reports (`node.integration.test.ts:471-536`). That verifies machinery under cooperative outputs; it does not establish that a real failed test blocks dependent feature work.

The repository also has a substantial pre-v0 plan, including explicit acceptance criteria and a review state. The problem is **not literally absence of a plan**. The simpler implementation and its tests did not preserve the crucial outcome semantics.

### 4.9 The node has no hands, and three models play telephone

The node's own model runs in the hosted API (`brain.ts`, through Ensemble's assistant loop). It can call Ensemble's tools, read files in shared folders (`node_computer_files`), and start or steer coding-agent sessions. It cannot run a command, look at a web page on the computer, take a screenshot or check `git status` without starting a whole coding-agent session. Each of those takes minutes and costs subscription quota, and it returns prose.

A crew step today passes through three models:

```text
lead model ──brief (prose, ≤4000)──► step node's model ──prompt (prose, ≤6000)──► coding agent
                                                                                   │ works
lead model ◄──step result (prose, ≤4000)── step node's model ◄──job summary (truncated to 3000)──┘
```

Each hop loses or distorts something. The quoted brief shows the effect: the persona tells the lead to "put into every brief what your owner said about where to work and what not to do", so every brief carries a paragraph of copied constraints. The tester's verdict reached the scheduler only as prose that a model had already summarised.

The pieces needed to fix this already exist in Ensemble:

- **A synchronous device relay.** `askDeviceFor` (`devices/file-relay.ts`) sends a frame on the device's event stream and waits up to 15 seconds for the answer, which is stored in Redis. `node_computer_files`, the web Code tab and the web terminal use it. The terminal is deliberately limited to the signed-in person with a passkey unlock. An agent call class needs its own policy and audit.
- **A run MCP server in every engine.** Every coding-agent run gets Ensemble's `ensemble` MCP server (`ask_person`), wired into the Claude Code, Codex, Cursor, Copilot and ACP adapters. A `report_result` tool and an `attach_evidence` tool belong there.
- **Engines that report the model they used.** Progress and completion carry the model, tokens and cost (`remote/contract.ts`). They do not carry reasoning effort or context tier.

Missing pieces: there is no browser automation in the local runtime. Evidence upload covers changed text files only, with no images, screenshots or binary files. Completion is the free-text summary.

### 4.10 Every deploy can break a running crew

The API is one process (systemd units in Ensemble's `infra/deploy/`). Testing redeploys whenever its `testing-live` branch moves (`infra/deploy/testing/deploy.mjs`), and production checks for a new deploy every minute. On restart, `recoverTurns` marks running node turns failed and settles their plan steps as `blocked` ("Interrupted by a server restart"). Queued turns older than an hour are dropped. While crews are tested on the testing server that receives each new commit, a deploy during a plan is a routine failure, not a rare crash. This moves durable coordination (§9.1) earlier in the build order.

There is also latency in the wake-ups. The run watcher polls every 15 seconds (`node/runs.ts`). The job queue polls every 1.5 seconds (`workspace/worker.ts`). A step that finishes can wait 15 seconds before anything notices.

### 4.11 The repeated phrase in the quoted brief is a display artefact

The stored brief of the refused step reads cleanly: "…implement ONLY Expire Needs Me requests when their task ends (ensemble://task/…), read its page. Ensure terminal tasks cannot leave actionable stale requests; …". The repetition in the quoted copy ("…actionable stale (ensemble://task/…), read its page. Ensure terminal tasks cannot leave actionable stale requests") was therefore added where the text was shown or copied, in the web plan card (`apps/node-web/components/chat/plan-card.tsx`) or its link formatting. Fix it there. The brief's real problem is its length and copied constraints (§4.9), not corruption.

## 5. Keep, strengthen, replace

| Existing piece | Decision |
|---|---|
| Node website and shared account | Keep. No visual redesign in this programme. |
| Fastify/Prisma/Postgres backend within Ensemble | Keep. No separate Node service/database required now. |
| Device pairing, outbound connection, leases, local runner | Keep and extend. Do not create a second daemon for the same responsibilities. |
| Claude/Codex/Cursor/Copilot adapters and subscriptions | Keep; introduce explicit capability and result contracts around them. |
| Session reuse, queue/steer/replace/stop | Keep; make inherited settings, cancellation and ownership auditable. |
| Ensemble tools, connectors, skills, Files and Needs Me | Reuse. Avoid parallel implementations of these products. |
| One lead and quiet crew steps | Keep. Apply the same separation to helpers and retries. |
| Plan state living only inside a chat card | Migrate to work records; keep the card as their presentation. |
| Free-text replies implying success | Replace with typed outcomes and evidence requirements. |
| Repeating long instructions in each brief | Replace with versioned task contracts plus focused context. |
| General secrets in every worker environment | Migrate to scoped credential operations; accurately label the compatibility path. |
| Browser work requiring ad hoc agent setup | Add a supported runtime capability with persistent profiles and handoff. |

Do not migrate to eve, LangGraph, Temporal, or another framework just to obtain a new vocabulary. The existing stack can implement the first milestones. Reconsider a durable workflow engine only if measured operational needs justify the migration.

## 6. Target architecture

```text
Node web / future clients
    |
    | user intent, decisions, steering, result inspection, live view
    v
Ensemble hosted control plane
    +-- Conversation service             messages and one speaking node
    +-- Mission service                  requirements, constraints, revisions
    +-- Planner / repair model           proposes plans or revisions (validated by code)
    +-- Deterministic scheduler          pure decision core: dependencies, gates, repair, wakeups
    +-- Packet compiler                  mission + step + inputs -> one worker packet (code, not a model)
    +-- Verification service             check outcomes and acceptance evidence
    +-- Decision service                 questions, approval, login, secret requests; policy (§10.5)
    +-- Event log + transactional outbox durable transitions and delivery
    +-- Ensemble tool gateway            existing tools, apps, skills and Files
    +-- Device tool gateway              the node's own hands: typed calls over the device relay
    |
    | versioned device protocol; scoped jobs, tool calls, events, receipts
    v
Existing local Ensemble runtime (the sidecar in the CLI and desktop app)
    +-- Execution/session manager        signed-in coding agents
    +-- Run MCP server ("ensemble")      ask_person + report_result, attach_evidence, browser_*
    +-- Device tools                     command, files, git; policy enforced on the device
    +-- Browser broker                   dedicated profiles, sessions, live view, takeover
    +-- Credential broker                credential references, not raw model input
    +-- Workspace/resource manager       folders, worktrees, ports, exclusive claims
    +-- Evidence collector               files, screenshots, traces, test receipts, upload
    +-- Local journal                    reconnect and uncertain-effect recovery
```

These are module boundaries, not a requirement to deploy ten microservices.

The control plane owns intent, coordination and the durable record. The local runtime owns the truth about local processes, files, browser sessions and tool capabilities. Models select actions through typed interfaces. Neither chat prose nor an SSE event is authoritative execution state.

Node should support three routes for actual work:

- **Direct capability:** workspace lookup, connected-app action, browser observation, short report.
- **Local specialist:** coding, substantial command/file work, independent verification.
- **Supported external execution:** a provider's documented cloud-agent service, where the user has separately authorised it and its billing.

Do not turn every website visit into a coding-agent session. Do not invent a separate custom coding harness where the user's existing agent already does the job well.

### 6.1 The node's hands: one tool surface, two callers

Browser, command, file and git tools live **on the device**. Two kinds of caller reach the same implementation:

| Caller | Transport | Typical use |
|---|---|---|
| The node's own model (hosted) | Device tool gateway → `askDeviceFor`-style relay, a new `node.tool.request` frame; long commands stream output like the web terminal and wake the node when they end | `git status`, run the tests, open a page and take a screenshot, read a log, check that a dev server answers |
| A coding agent in a run | The run MCP server (`ensemble`), which every engine already loads | Browser testing during a build, attaching screenshots, reporting the structured result |

One implementation means one policy, one audit trail, one set of resource claims (a browser tab or a port) and one evidence path. The device enforces the policy, as it already does for the Code tab. The server's agreement is not enough.

The node's model does quick, bounded work itself. A coding agent does substantial work. A rough guide: if it takes a few tool calls and no code changes, the node does it; if it needs editing, iteration or long reasoning about code, it is a session.

## 7. The work contract

### 7.1 Domain objects

Call the user-level work object a **mission** internally; the UI can continue to call it a task or plan.

| Object | Purpose and minimum fields |
|---|---|
| Mission | Owner/space, original request, requirements, authority/scope, status, revision, origin conversation |
| Step | Mission, requirement IDs, role/capability, inputs, dependencies, expected outputs, execution and acceptance policy |
| Attempt | Step, job/session/device, attempt number, requested/resolved/observed configuration, timestamps and failure class |
| Check | Requirement, tested subject/revision, verdict, evidence references, verifier identity |
| Decision | Mission/step/attempt, kind, exact payload hash, owner, scope, state, expiry/invalidation conditions |
| Result attachment | Existing file/blob reference or authorised local reference, media type, hash, producer, revision, visibility |
| Event | Mission sequence, actor, cause, event type, payload version, correlation/operation ID |
| Outbox entry | Committed event/effect to deliver, idempotency key, delivery status and retry metadata |

Reuse `WorkspaceJob`, `Run`, existing decisions and Files wherever their contracts fit. Add relationships rather than duplicating their contents. An agent's vendor session is an execution resource, not the mission itself.

### 7.2 Separate execution from acceptance

For a step, represent at least:

```text
execution: pending | ready | running | waiting | finished | failed | cancelled | interrupted
outcome:   unknown | pass | fail | blocked | not_applicable
```

Mission state can be `planning`, `running`, `waiting_for_user`, `waiting_for_device`, `repairing`, `succeeded`, `partially_completed`, `failed`, or `cancelled`. Details belong in reason fields, not dozens of near-identical statuses.

A dependency must state what it requires:

```text
build.finished -> verification may run
verification.pass(subject = current candidate revision) -> next gated feature may run
verification.fail -> repair belongs to the original implementation owner
```

The system can validate a verdict and its evidence linkage; it cannot prove an arbitrary real-world claim merely because an LLM returned valid JSON.

Example verification result:

```json
{
  "execution": "finished",
  "outcome": "fail",
  "requirementIds": ["markdown-table-fidelity"],
  "subject": {
    "repository": "example-app",
    "revision": "candidate-sha",
    "environment": "testing"
  },
  "checks": [
    {
      "name": "record title containing a pipe",
      "verdict": "fail",
      "evidenceIds": ["reproduction-log", "table-screenshot"]
    },
    {
      "name": "authenticated live account",
      "verdict": "blocked",
      "reason": "login_required"
    }
  ],
  "summary": "Table parsing loses a cell.",
  "suggestedNextAction": "repair"
}
```

Use a completion tool or supported structured-output channel. A runtime verifies command exit codes, revision identity and uploaded evidence where it can. For legacy engines, missing structured output means **unverified**, not automatic success. A summary parser may propose an interpretation, but must not silently release a gate.

### 7.3 Preserve the request and its authority

Before dispatch, record:

- The requested deliverables and their acceptance criteria.
- Repository/folder/device and target environment.
- Branch and publication instructions, exactly as authorised.
- Agent/model/context requirements, including whether substitution is permitted.
- Whether feature work is serial or independent work may run in parallel.
- Required evidence, including authenticated versus mocked testing.
- The source and scope of each instruction.

A plan validator checks cycles, unknown references, overlapping exclusive resources, missing requirements and missing required gates. It cannot infer every natural-language requirement perfectly: the planner proposes the requirement list, and uncertain scope becomes one focused clarification.

A user correction creates a **mission revision**. New steps inherit it. Existing steps are reconciled deliberately; a stale queued instruction must not override a newer user decision. A side request such as “add this board task” does not overwrite the running mission.

Do not truncate mandatory instructions out of existence. Put stable constraints in structured fields and full source material behind retrievable references.

### 7.4 One validated plan proposal; constraints are data

The lead proposes the whole plan in **one tool call**. Code validates it before anything starts. If validation fails, the errors return to the lead in the same turn and it corrects the plan. The shape (full schema in [build block B6](ensemble-node-build-blocks.md#b6-mission-contract-one-validated-plan)):

```text
plan
  goal
  requirements[]   id, text, acceptance[], evidence wanted (screenshot | test | commit | doc | url)
  constraints      computer, folder, repos, branch, publish (none | commit | push | pr),
                   environment, agent, model, effort, context, substitution (forbid | ask | allow),
                   order (serial | parallel_ok), notes[]
  steps[]          id, to (node), kind (build | verify | write | research | other),
                   requirementIds[], brief, after[], verifies (step id), run overrides
```

Validation checks for: unknown nodes; cycles; every requirement covered by a step; a `verify` step for every requirement whose acceptance needs one; `verifies` pointing at a build step; serial order respected when `order` is `serial`; and briefs within their limit.

**Constraints are written once, on the mission.** Code renders them into each worker packet. A brief carries only the step's own objective. This removes the paragraph of copied rules from every brief (§4.9). A user correction changes the mission's constraints and creates a revision; queued steps pick it up when their packet is compiled.

### 7.5 The worker reports, not the node

The structured result comes from whoever did the work:

- **A coding agent** calls `report_result` on the run MCP server, with the shape in §7.2. Before that it calls `attach_evidence` for each screenshot, report or log it wants delivered. The local runtime validates paths and sizes, uploads the files and links them to the attempt.
- **An engine that cannot call MCP tools** writes `.ensemble/result.json` in its working folder. The runtime reads and validates it at the end of the run.
- **The node's own model**, for steps it does itself, calls `node_step_report` with the same shape.

**Code computes the verdict from the checks.** The reported `outcome` must agree with them. A verification passes only when every mandatory acceptance criterion has a passing check against the candidate the scheduler told it to test (build block B1). A missing, blocked or skipped mandatory check is not a pass.

When no report arrives by any of these routes, the attempt is `unverified`. The runtime gives the worker one prompt to report: a message to the same session, or one more node turn. If there is still no report, the step is `blocked` with reason `no_report`. Prose is never read as a verdict.

## 8. Coordination, repair and communication

### 8.1 One lead, independent specialists, no chat-driven scheduling

The lead owns the user conversation. Specialists receive bounded assignments and return results to the mission. They do not schedule one another by putting `@names` in prose.

Users can still address a specialist directly. That selects a responder or creates/steers work; it does not require waking the whole crew.

Persistent nodes are useful identities for responsibilities, preferences and expertise. They need not all hold a live model session. Temporary helpers should be execution children, not new permanent personalities or sidebar conversations unless the user asks.

Use another agent when independence or genuine parallel work helps, not for each small lookup. A lead should not spend three model calls redistributing work a single tool could do.

### 8.2 Repair loop

For a failed check:

1. Persist the failure and the tested revision.
2. Hold dependent work; do not label it permanently skipped just because repair is possible.
3. Send the reproduction and evidence to the existing implementation session.
4. Create a new candidate revision.
5. Run the independent verifier against that exact revision.
6. Release the gate only after required checks pass.

The lead proposes changes when repair needs new judgement. Straightforward in-scope repair can continue under the existing authority. A scope expansion, unavailable credential, unresolved requirement or a genuinely stuck approach becomes a decision for the user.

Detect repeated identical failures using failure fingerprints and evidence of progress. Do not mechanically repeat a broken configuration. Do not stop otherwise productive work at an arbitrary fixed number of agent turns.

Resource concurrency and provider rate limits are necessary operational constraints. User budgets and time limits are optional controls. Neither should be confused with hidden product restrictions on branches, pushes, PRs or valid work.

### 8.3 Communication policy

Separate three channels:

| Channel | Content |
|---|---|
| Main conversation | User requests, a concise plan/acknowledgement when useful, real decisions, final outcome |
| Live work state | Updating plan, progress, queued/offline/waiting status and current check |
| Inspectable activity | Worker messages, commands, tool receipts, retries, evidence and detailed errors |

Aim for roughly **two to five meaningful visible updates** on ordinary work, not a hard message cap. Necessary decisions and failures must never be hidden to meet a number. Existing plan cards are a good starting point.

Only committed state transitions can generate lifecycle notifications. Deduplicate them by mission, revision and transition. Progress text changes an existing status rather than creating another chat message. A reconnected client reconstructs state from a durable cursor or snapshot.

### 8.4 Collapse the middle model

For executable steps (`build`, `verify`, and `write` on a computer), the scheduler does not wake the step's node to compose a prompt. It compiles a **work packet** and starts or continues the coding-agent session directly:

```text
[Goal]         mission goal, one line
[Your part]    the step's brief; its requirements with acceptance criteria
[Constraints]  rendered from the mission (§7.4): where, which branch, what to publish, what not to touch
[Inputs]       dependency results: structured reports, commits, evidence links
[Settings]     agent, model, effort and context as resolved and already applied; do not check them
[Who you are]  the specialist node's charter, preferences and relevant memories
[Report]       call report_result when done; attach_evidence for anything the owner should see
```

The specialist node keeps its identity: its charter, preferences, memories and default agent and model shape the packet. It takes a model turn only when judgement is needed:

- A worker reports `blocked` and the cause might be resolvable without the owner.
- A non-executable step: research, a message or a decision that needs the node's tools.
- The owner addresses the node directly.

This removes one model hop per step, its latency and cost, and the paraphrasing between models. Run start and end move from about a minute of model turns to seconds.

### 8.5 Checks as code

A verifier should leave a **re-runnable check** whenever the subject allows it: a unit test, a script, a Playwright spec or a `curl` with expected output. It records how to run it:

```text
check: { name, command, cwd, expects: exit 0 | output matches | screenshot set, artefacts[] }
```

The runtime runs recorded checks again on each new candidate, before any model is involved. A repair that does not change the result fails fast and costs nothing. Subjective checks (layout, animation feel, writing quality) stay with a model or the owner, attached to screenshots, traces or video.

Checks written into the product's repository are part of the work and follow the mission's publish constraints. Checks kept only for the mission live in the attempt's evidence.

## 9. Reliability and local execution

### 9.1 Transactional scheduling

Keep Postgres as the authority:

- Commit the state transition and its outbox event in one transaction.
- Claim ready work with database-backed ownership and leases.
- Deliver outbox events at least once; consumers deduplicate by operation ID.
- Persist a follow-up before marking the original result delivered.
- Use reconciliation to find stuck transitions and undispatched ready work.

A process restart should resume coordination from committed state. It must not blindly rerun a side effect whose outcome is unknown.

Exactly-once effects cannot generally be promised across a database, a user's computer and an external website. Use effect receipts and provider idempotency keys where supported. If an external effect may have happened but its receipt was lost, inspect its outcome before retrying or ask the user.

Reuse existing device fencing and recovery. Add mission-level delivery guarantees rather than replacing the device protocol. Redis can accelerate wakeups and cross-process events; losing it must not lose the work.

Two specific changes:

- **Wake on completion, not on a poll.** The hosted handler the device posts completion to (`devices/routes.ts`, `jobs/:id/complete`) writes the attempt's end and an outbox entry in the same transaction. The 15-second run watcher stays only as reconciliation.
- **Operation ids reach the consumer.** An outbox key deduplicates rows, not effects. Each effect (a turn, a session start or send, a device tool or browser operation) carries an operation id. The consumer stores that id under its own unique constraint before acting. An effect that started without a recorded result is reconciled with its consumer before anything retries it.
- **A restart resumes; it does not block.** A node turn interrupted before it ran any tool runs again from the start. One that ran tools is reconciled: its tool receipts are read, and it resumes with a note saying what already happened. A plan step is never ended as `blocked` just because the server restarted.

### 9.2 Model and engine capability negotiation

Each adapter should expose:

```text
discover capabilities
validate requested configuration
start / resume / steer / cancel
stream normalised events
request a human decision
collect result and evidence
reconcile after disconnect
```

Advertise support for resumable sessions, steering, tool/approval events, images, attachments, model identifiers, reasoning levels and context settings. Capabilities are versioned and time-stamped.

Keep three records:

- **Requested:** what the user or mission requires.
- **Resolved:** what the adapter actually sends.
- **Observed:** what the provider confirms, or explicitly “not reported”.

Preserve `inherit`, `provider_default` and an explicitly selected value as different states. Omitting effort must not accidentally mean either “keep xhigh” or “reset to default”, depending on the path.

If a mandatory setting is unsupported or unobservable, surface the precise discrepancy once. Do not silently substitute a model, infer a live context setting from a marketing page, or ask the worker to hallucinate its own configuration.

Continue the existing session for the same line of work, provider, device, folder and compatible authority. Keep independent verification separate from the implementation conversation. A missing vendor session triggers a transparent recovery with a checkpoint, not an invisible claim of perfect continuity.

Subscription access should continue through installed, supported tools and their own sign-in. Do not extract vendor tokens or assume a consumer plan includes a raw model API or cloud-agent API. Provider terms, entitlement and rate limits remain provider-specific.

### 9.3 Resource ownership

Reuse the existing folder/job locking. Extend it to actual shared resources:

- Writable checkout/worktree and branch.
- Browser profile and browser page/control lease.
- Development-server port and process.
- Shared document or external side effect where concurrent writes conflict.

Parallel coding on one repository uses runtime-managed worktrees when supported, with explicit integration ownership. The strategy (serial, worktrees or detached snapshots) is the mission's choice. Ensemble imposes no branch or merge workflow and never publishes beyond the mission's constraints. Verification targets a specific commit or immutable candidate snapshot, not “whatever is currently in the shared folder”.

A git worktree is not an OS security boundary. Existing user changes must not be reset or included in an agent's commit accidentally.

### 9.4 Offline and stop behaviour

The hosted node can retain work and report status while the device is offline. It cannot run local tools without an available device.

Offer an always-on user-owned computer as the default path to continuous execution. Another device or cloud executor is an explicit user choice, not a silent fallback.

Stop must propagate to the mission, queued steps, active attempts, browser actions and pending decisions. Fence late completions and late answers. Preserve partial work and explain any external action that already completed. Do not describe cancellation as rollback.

## 10. Browser, credentials and evidence

### 10.1 Browser capability: the largest functional gap

Build a browser broker inside or alongside the existing local runtime. Start with supported Chromium automation and one dedicated profile per owner; add finer separation when needed.

Minimum capabilities:

| Area | Contract |
|---|---|
| Navigation and observation | Navigate, inspect DOM/accessibility state, screenshot, bounded page text |
| Interaction | Click, type non-secret text, upload/download, keyboard input, wait for a condition |
| Session management | Persistent profile, tab ownership, explicit account identity, session expiry |
| Human handoff | Request login, pause agent control, user takeover, explicit return |
| Testing | Deterministic Playwright checks where possible; model-directed exploration where useful |
| Diagnostics | Console/network errors, trace/video, viewport and tested deployment metadata |

Prefer connected-app APIs for structured operations. Use browser interaction when the task is visual or the API cannot perform it.

Never attach to a user's everyday browser profile without explicit setup. Being on the same machine does not grant safe access to its cookies. A coding agent should not receive unrestricted browser debugging access to credential extraction APIs.

A browser action sequence should not hold the user-facing node unavailable for the whole task. Persist progress and allow user steering through the mission.

**Implementation choice.** Run Playwright's Chromium from the local sidecar with a persistent profile in Ensemble's data folder, separate from the user's everyday browser. Expose a small, typed tool set (open, snapshot, click, type, press, wait, screenshot, console and network errors, tabs) through both callers in §6.1. Reusing `@playwright/mcp` behind a filtering proxy is reasonable. Its arbitrary-script tools (evaluate, run code) and raw CDP access must stay off: they can read cookies and stored credentials. Deterministic test suites in the user's repository keep using their own Playwright install; the broker is for agent-directed browsing and evidence.

**Live view.** While a browser lease is active, the broker publishes a small screenshot every few seconds (for example a 50 KB JPEG every 3 s) to the run card through the existing progress channel. It is short-lived in Redis and not stored as evidence. It stops during sensitive steps. This gives most of Grok's "watch the computer" value without remote input. Remote takeover comes later (§10.2).

Full desktop control is a separate later capability: screen capture, input, window selection and OS permission handling vary across macOS, Windows, X11 and Wayland. A terminal transcript is often better evidence than a terminal screenshot; support both where useful.

### 10.2 Login handoff

The login flow is a state transition, not “please paste your password into chat”:

```text
browser needs login
  -> decision(login, exact origin/profile/attempt)
  -> agent observation and control suspended for the sensitive step
  -> user signs in locally, or through an authenticated private takeover
  -> user returns control
  -> broker verifies the expected signed-in state
  -> same step resumes
```

During the sensitive step, stop model-visible screenshots, DOM extraction and sensitive tracing, not just keyboard control. Resume from a sanitised observation. CAPTCHA, MFA and unsupported login flows go to the human; do not bypass site controls.

Local headed takeover is the first milestone. Secure remote/mobile takeover is a later protocol and streaming feature; it is not obtained merely by adding a password input to the website.

**The login chain.** Before asking the user, try the private options in order:

1. **A login saved on the device** for that origin. The credential broker fills it into the page; the model sees neither the value nor the filled field.
2. **A password manager the user connected** (later). The manager approves and fills, as Grok Bot does with 1Password.
3. **A secure form**: the user types the value; it is encrypted for the device (§10.3) and filled by the broker. The user may also save it to the device.
4. **Hand-over** for SSO, passkeys, CAPTCHAs, QR codes or device approvals: the headed window on the computer, later a remote takeover.

One-time codes from a connected mailbox can be read with the user's permission (later). That code does pass through the model, so it is a separate, explicit grant.

### 10.3 Credential isolation

Separate two promises:

- **Compatibility mode:** a user-authorised subprocess gets a scoped secret; values are kept out of ordinary chat and redacted. This is not a guarantee against model-directed code reading them.
- **Isolated credential operations:** the agent receives a reference and can request an approved operation; the credential broker supplies the value outside the agent's readable environment.

Prefer the second for the intended product promise. For example, an authorised API operation names a credential reference and destination; the broker adds authentication, enforces destination/redirect scope, executes it, and returns a sanitised receipt.

Store broker credentials and browser profiles outside the general coding worker's readable boundary, using the OS key store/encrypted store and process or OS isolation as appropriate. Do not inject all saved credentials into all runs.

For remote secret entry, either enter on the device directly or encrypt to an authenticated paired-device key before the payload leaves the browser. The hosted relay then handles ciphertext. Key identity, rotation, revocation and trusted frontend delivery are part of the threat model; TLS alone does not hide a value from the hosted API.

Redaction remains defence in depth. It cannot establish that arbitrary model-controlled code with unrestricted secret-bearing environment access will never disclose a secret.

Use existing Needs Me surfaces for scoped authorisation. Normal authorised work should not be repeatedly refused by invented Node policy. In attended mode, ask for additional scope instead of silently rejecting ordinary work; honour the user's unattended grants. Credential isolation, tenant boundaries, protected runtime controls, OS permissions and vendor requirements remain distinct constraints.

### 10.4 Results the user can actually inspect

Add a run-output/result-attachment contract, backed by existing Files/blob infrastructure where authorised:

```text
producer mission/step/attempt
file identity, MIME type, size and digest
candidate commit / deployment / URL
capture time and viewport
test name and verdict
storage location and access policy
retention and redaction metadata
```

A screenshot, test report, document or recording should open from the result. A local path alone is not delivery.

Respect the current local-file privacy boundary: explicitly distinguish publishing a selected result to Ensemble Files from merely inspecting a local file. Do not start uploading all source files or screenshots automatically. Support local-only evidence with a clear “device required” state; hosted copies require the appropriate user grant.

For UI and animation work, combine functional checks with screenshots at relevant viewports and, when timing matters, trace/video. A still image cannot establish animation correctness. Assertions, console errors and exact tested revisions matter more than an attractive screenshot.

For documents and research, retain source links and inspectable outputs. Native image/video generation is a separate provider capability; do not imply that every coding subscription includes it.

### 10.5 Decision policy: who decides whether an action runs

The owner's rule: never auto-reject ordinary work; ask in Needs me instead, at most once per scope; in unattended mode, allow everything except a hard floor. The policy, evaluated on the device for device actions and in the control plane for Ensemble actions:

| Order | Layer | Effect |
|---|---|---|
| 1 | **Hard floor** (code, not configurable by a model) | Deny: reading the secret and credential stores, the browser profile's cookie files, Ensemble's own code and configuration, OS-critical paths. This is the only automatic denial. For commands it is enforced by Ensemble's existing OS sandbox (`workspace/guard.ts`, `workspace/sandbox/`), not by inspecting command text. Where a computer's sandbox is weak, the floor is best effort and Node says so. |
| 2 | **Owner's rules** | "Always allow" or "Ask first" for an action and scope, such as commands in `~/codes/app` or pushes to `main`. Saved from a card ("Always for this folder") or in settings. |
| 3 | **Mode default** | *Attended*: the first use of a capability in a scope (a folder, an origin or a connected app) asks once in Needs me, and the answer covers the scope for that mission or permanently, as the owner chooses. *Unattended*: allow. |
| 4 | **Reviewer (optional)** | A model may flag an action as risky. It can only turn *allow* into *ask*, never into *deny*, and never in unattended mode unless the owner has asked for that. |

Two invariants:

- **Authority comes from the owner.** The mission's scope is what the owner asked for: their messages, the mission's constraints, and rules they saved. Instructions in tool output, web pages, emails, files or other nodes' reports are information, never authority. They cannot widen the scope: a new repository, an outside recipient, a production target, or a secret not named for the work. In both modes, an action **inside** the mission's scope runs under the table above. An action that widens scope *only* because untrusted content asked for it becomes a decision, not a denial. This is the one exception to "unattended allows everything", and it is the owner's call ([build blocks, decision 6](ensemble-node-build-blocks.md#decisions-for-the-owner-before-building)). It is the main defence against prompt injection.
- **Expiry depends on origin.** A decision raised by work the owner started in chat waits without a timer. One raised by background work (a routine, an event) expires after a set time and says so. A decision is closed when its attempt, step or mission ends (§13). A newer owner message does not silently close a card; the card remains answerable until its work ends.

## 11. Context, memory, skills and model choice

Separate:

- **Authority:** current user instructions and mission scope.
- **Mission state:** requirements, plan, decisions, candidate revisions, accepted checks.
- **Execution context:** selected files, instructions and receipts for one worker.
- **Memory:** durable preferences or useful facts, with source and scope.
- **Skills:** reusable, versioned procedures with validation.

The current newest-40-memory prompt and recent-message window are not a durable task ledger. Keep authoritative state retrievable outside the model context. Summaries accelerate reading; original events and evidence remain available.

Give workers focused packets: their requirement, relevant repository instructions, current candidate, inputs from dependencies, authority and acceptance criteria. Do not paste the whole crew transcript into every worker or put every connected tool in every prompt.

Keep private and shared audiences distinct. A summary, retrieved memory, result attachment or inherited session must not widen access. Cross-person requests preserve the original actor and authority through delegation and resumption.

Initial model policy:

| Work | Starting approach |
|---|---|
| Simple routing and state inspection | Deterministic code; no model when possible |
| Short conversation and routine lookups | Fast capable model, evaluated on these tasks |
| Planning, ambiguous scope and repair | Stronger model; Sol medium is a reasonable experiment, not a guarantee |
| Coding and substantial work | User's selected agent/model/subscription |
| Independent verification | Separate context plus real tools and assertions |
| Vision/computer use | Capability-tested model and broker; text-only models do not become vision-capable through prompts |

Compare Luna, Sol low and Sol medium on the same mission fixtures. Measure accepted outcomes, unnecessary interventions, context preservation, latency and usage. Reduce cost after reliability is demonstrated, not before.

With §8.4 in place, specialist nodes take far fewer model turns. Most remaining turns are the lead's planning, repair judgement and final report, which is where a stronger model pays off. When the node itself does browser work (§6.1), its model must accept images to judge screenshots. Otherwise it works from accessibility snapshots and leaves visual judgement to a vision-capable worker or to the owner.

No fine-tuning, model training, custom foundation model or private model research is required for this plan.

## 12. Delivery sequence and concrete work packages

Advance by acceptance gates, not by counting shipped buttons. Estimates should follow the first vertical slice; a calendar promise now would hide the integration uncertainty.

| Package | Scope and principal locations | Depends on | Exit condition |
|---|---|---|---|
| W0: baseline and replay | Sanitised incident fixtures; existing Node integration tests; trace identifiers | None | Reproduce failed-test-as-done and incomplete-plan cases without production writes |
| W1: typed outcomes | Shared types, `node/brain.ts`, `plans.ts`, `runs.ts`; completion tool/engine result seam | W0 | A failed verification can never release a pass-gated dependency |
| W2: requirement coverage and repair | Mission contract, planner validation, `tools.ts`, `plans.ts`, lead repair handling | W1 | Every requested feature remains accounted for; repair/retest continues in scope |
| W3: execution configuration | `node/sessions.ts`, `workspace/assign.ts`, sessions, engine adapters and remote contract | W0 | Start and continuation preserve explicit model/context choices; observed settings are honest |
| W4: durable transitions | Prisma additions, Node scheduler/outbox, queue and run watcher, reconciliation | W1 | Crash between transition and delivery neither loses work nor duplicates an effect |
| W5: decision lifecycle | Node approvals/secrets and existing run decisions | W1, W4 | Terminal or superseded attempts leave no actionable stale requests; first valid answer wins |
| W6: result delivery | Run evidence, device upload/relay contract, Files integration and Node result metadata | W1, W3 | Selected report/screenshot opens from the mission and identifies its tested revision |
| W7: local browser and login | Local runtime broker, device capabilities, takeover decision contract | W3, W4, W5, W6 | Sign in once, resume the same browser task, return real evidence without chat credentials |
| W8: credential isolation | Existing secret card/store, broker operations, device identity and encrypted entry | W5, W7 | Brokered secrets are absent from worker environment, prompts, traces and results in canary tests |
| W9: controlled parallel work | Workspace resource claims, managed worktrees, immutable verification targets | W2, W3, W4 | Two authorised independent changes do not overwrite each other; integration is verified |
| W10: routines and notifications | Existing scheduler seam, saved routine contract, event filters, quiet delivery | W2, W4, W5 | One reliable workflow can repeat without duplicate firing or notification storms |
| W11: later product breadth | Deeper Ensemble projection, channels, voice, desktop control, demonstrations, shared teams | Proven core | Add each only with its own capability and acceptance tests |

W1 can first extend the existing plan representation with a versioned result contract. Do not wait for a large schema migration to fix the failed gate. W4 can then move authoritative work state out of card JSON while retaining the existing card response shape.

**First engineering batch:** W0 + W1 + the repair path of W2, with W3 alongside it. Do not begin schedules, marketplaces or full desktop automation before this path works.

**First usable product milestone:** W1-W8, with a single reliable implementation/verifier flow and a browser-backed evidence path. More autonomous agents and wider parallelism are not prerequisites.

The previous web-only feature brief was a constraint on that particular coding task. A robust browser, credential and evidence system necessarily requires changes to the shared local runtime and compatible CLI/desktop delivery. A website-only change cannot provide those capabilities.

### Second-pass sequence (the order of record)

The packages above stay as the map of work. The second pass changes the order and adds two packages:

- **New: worker-reported results** (§7.5): `report_result` and `attach_evidence` on the run MCP server, with image and file upload. It joins W1 and W6 and comes before the browser work, because every later capability returns its evidence through it.
- **New: the node's hands** (§6.1): the device tool gateway with command, file and git tools under the §10.5 policy. It comes before the browser broker, which is built on the same gateway.
- **Moved earlier: durable transitions (W4).** Each deploy otherwise breaks running crews (§4.10).
- **Split: W2.** The repair loop goes first, as code over typed outcomes. The validated plan proposal and requirement ledger follow.

The [build blocks](ensemble-node-build-blocks.md) give the resulting order: B0–B14, plus the extension's B15–B21 and C1–C7, grouped into nine milestones. Each milestone ends with a demonstration on testing and is then promoted to production. Rooms with other people (M7–M9) start only after single-person work (M1–M5) satisfies the owner.

### Migration and release discipline

1. Introduce additive schemas and versioned contracts. Keep existing API/card consumers working.
2. Replay sanitised historical events without executing their effects; compare the old interpretation with the new one.
3. Run new missions in the isolated testing environment. Let old active plans drain under their original contract; do not reinterpret a live legacy card halfway through execution.
4. Add protocol negotiation. An old device gets an explicit capability requirement, not a silent degraded promise.
5. Validate one signed-in engine first, then the adapter contract across the remaining supported engines.
6. Publish runtime/backend compatibility before making the website depend on it.
7. Promote approved work through Ensemble testing to production, release affected CLI/desktop components, then promote Node and synchronise the branches. Never copy account data between environments.
8. Rollback must preserve event history and recognise the new contract version. Do not roll back into a worker that might replay an already-completed effect.

No promotion or release is authorised by writing this proposal.

## 13. Acceptance suite: prove the behaviour, not just the plumbing

Keep existing unit and scripted integration tests. Add focused failure cases in those suites, PostgreSQL concurrency/recovery tests where PGlite cannot establish the same behaviour, and a small set of real-engine/local-device scenarios.

| Scenario | Required result |
|---|---|
| Tester exits normally but reports FAIL | Job execution may finish; acceptance fails; dependent feature does not start |
| No structured completion report | Unverified/blocked, never inferred success from prose |
| Four requested features, plan covers two | Remaining requirements remain visibly outstanding; mission cannot succeed |
| Builder groups features despite serial per-feature gates | Plan validation rejects or repairs the decomposition before dispatch |
| Repair is in authorised scope | Existing implementation session receives the failure; independent retest follows |
| Repair repeats the same failure without progress | One useful escalation or changed strategy, not duplicate sessions and chatter |
| Missing authenticated session | Login decision; mocked browser checks cannot satisfy live acceptance |
| User changes reasoning/context during work | New mission revision is applied explicitly; stale queued intent cannot win |
| Resume with explicit model and long context | Configuration survives, or adapter reports the exact unsupported setting |
| Provider does not confirm actual effort/window | Evidence says unknown; no model self-certification |
| Duplicate completion event | One state transition, one next-step dispatch, one notification |
| Crash after plan transition, before dispatch | Outbox recovers the next step exactly once at the consumer |
| Crash after external action, before receipt | Reconcile; do not blindly repeat the action |
| Device disconnects and reconnects | Reattach/checkpoint semantics preserve partial work and reject stale leases |
| Stop while queued/running/waiting for login | No new work, no stale actionable decision, late results fenced |
| Same question answered on phone and CLI | One valid settlement and one continuation |
| Need for a scoped secret | Private entry/broker path; only a reference reaches model context |
| Secret appears in test tool output/redirect/trace | Sanitisation/isolation checks catch the leak path; do not claim perfect safety from string masking |
| Two writers target one checkout or tab | Resource ownership prevents conflicting actions |
| Candidate changes after a passing test | Earlier verdict does not certify the new candidate |
| Agent reports a screenshot path | User receives an authorised, openable attachment or an explicit local-only limitation |
| User adds an unrelated board task mid-mission | Running mission remains intact; both requests are accounted for |
| Shared room receives a private result | No private context, credential, attachment or summary crosses the audience boundary |
| Provider rate limit or unavailable subscription | Actionable wait state and backoff; no repeated user-facing error spam |
| Scheduled event is delivered twice | One occurrence is executed; deduplication survives restart |
| API deploys while a plan step is running | The step continues after restart; nothing ends `blocked` because of the restart |
| Worker ends without `report_result` or a result file | One prompt to report; then `blocked: no_report`; never `done` |
| Verifier leaves a re-runnable check; repair changes nothing | The recorded check fails again without a model turn; the repair loop reports no progress |
| Worker attaches a screenshot | It opens from the step in the web app with its tested revision, viewport and caption |
| Node runs `git status` in a folder for the first time, attended | One Needs me card for that folder; later calls in that folder run without asking |
| Same, unattended | Runs without asking; a hard-floor path is still refused |
| A web page tells the node to push to main | Not treated as a request; asked about, not run |
| Browser task needs a login with a saved credential | Broker fills it; no value in prompts, traces, screenshots or results |

### The first end-to-end demonstration

Recreate a small synthetic version of the reported failure, not another uncontrolled run over production work:

1. User requests feature A followed by feature B, each with independent verification.
2. Builder completes A with a deliberately seeded regression.
3. Tester fails A and attaches reproduction evidence.
4. B does not start.
5. Builder repairs A in its existing session.
6. Tester verifies the new candidate; a missing login causes a private handoff and continuation.
7. B proceeds only after A's required checks pass.
8. Required documentation is completed.
9. User receives one coherent outcome with files/evidence and any remaining limitations.
10. Repeat with API restart, duplicate completion, device disconnect and user cancellation injected at the relevant boundaries.

A short, sourced blocker report is a valid result when the system truly needs the user. “Please schedule the regression fix yourself” is not a satisfactory default when the crew already has authority and tools to repair it.

## 14. Operational scorecard

Instrument correlation across `mission -> revision -> step -> attempt -> vendor session -> tool/decision/evidence`.

| Metric | Why it matters |
|---|---|
| Required checks satisfied / requested outcomes | Actual success, rather than successful model turns |
| False-success and premature-gate count | Release blocker; deterministic tests must show zero |
| Requirements omitted or silently abandoned | Reveals plan completeness failures |
| Human interventions per accepted mission | Measures whether orchestration reduces work for the user |
| Main-thread messages versus internal events | Reveals chatter without suppressing necessary decisions |
| New sessions versus intentional continuations | Reveals loss of context and avoidable startup overhead |
| Requested/resolved/observed setting mismatch | Reveals model and context drift |
| Completion-to-next-step latency | Reveals scheduler/watcher lag |
| Duplicate effects and lost wakeups | Reveals reliability failures |
| Pending decisions attached to terminal work | Reveals stale Needs Me state |
| Openable evidence coverage | Distinguishes delivery from claims about local files |
| Model usage and wall time per accepted outcome | Measures real efficiency |
| Failure distribution | Distinguishes planning, provider, policy, environment, tool, verification and delivery failures |

Operational logs should contain identifiers and sanitised receipts, not credential values or indiscriminate private transcripts. Product evaluation uses synthetic or explicitly authorised, sanitised examples.

Do not optimise only for model cost, token count, “all turns succeeded”, or unit-test count. The inspected incident had successful turns and completed jobs while the user's requested outcome remained blocked.

## 15. What to defer

Defer template marketplaces, agent-owned email, voice calling, teaching by demonstration, enterprise governance breadth and sophisticated cross-person agent negotiations until the core work loop is reliable.

Do not make these prerequisites:

- Training or fine-tuning a model.
- Replacing all of Ensemble's infrastructure.
- A new general coding agent.
- A full desktop automation stack before a useful browser broker.
- Vector search before authoritative mission state and simple retrieval work.
- More hard-coded “never push”, “tester cannot edit”, step-count or session-count rules.

Role defaults can guide a node; user intent and permissions determine what it may actually do. Scheduling constraints prevent collisions, not legitimate work.

The immediate goal is not “half of every competitor's feature list”. It is one repeatable promise: **the node owns the outcome, keeps working through ordinary recoverable failures, and returns evidence without making the user coordinate the workers.**

## 16. Sources and implementation anchors

### Public primary sources, fetched 29 October 2026

| ID | Source |
|---|---|
| G1 | [Grok Bot overview](https://docs.x.ai/grok-bot/overview) |
| G2 | [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration) |
| G3 | [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| G4 | [Approvals, security and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) |
| G5 | [Files and results](https://docs.x.ai/grok-bot/files-and-results) |
| G6 | [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| G7 | [Grok Bot security](https://docs.x.ai/grok-bot/security) |
| O1 | [Introducing dots](https://openai.com/index/introducing-dots/) |
| O2 | [Safety, security and privacy in dots](https://openai.com/index/how-we-build-safety-security-and-privacy-into-dots/) |
| O3 | [Dots tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) |
| O4 | [Dots computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) |
| A1 | [Claude Duet product](https://claude.com/product/claude-duet) |
| A2 | [Introducing Claude Duet](https://claude.com/resources/articles/claude-duet) |
| A3 | [Get started with Claude Duet](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet) |
| A4 | [Managed Agents architecture](https://www.anthropic.com/research/managed-agents) |

### Local implementation anchors

Paths below are relative to the Ensemble repository unless identified as Node. Line numbers refer to the inspected snapshot.

| Concern | Evidence |
|---|---|
| Existing backend boundaries | `docs/35_ENSEMBLE_NODE.md:1-27`; Node `docs/01_IMPLEMENTATION_GUIDE.md` |
| Original acceptance/review design | Node `docs/design/pre-v0/06_CREWS_DELEGATION_AND_PLANS.md:27-75` |
| Prose determines step completion | `apps/hub-api/src/node/brain.ts:443-457` |
| Gate and plan status model | `apps/hub-api/src/node/plans.ts:26-62,216-303` |
| Step/report summary truncation | `apps/hub-api/src/node/plans.ts:260-268,394-434`; `node/runs.ts:61-77` |
| Process-local coordination and recovery | `apps/hub-api/src/node/queue.ts:20-41,107-115,247-259` |
| Completion-to-follow-up window | `apps/hub-api/src/node/runs.ts:45-61` |
| Plan-transition-to-dispatch window | `apps/hub-api/src/node/plans.ts:216-255` |
| Start/continuation configuration | `apps/hub-api/src/node/sessions.ts:54-93,263-291,408-438,485-541`; `workspace/assign.ts:116-139` |
| Hosted secret relay | `apps/hub-api/src/node/node-secrets.ts:154-169` |
| Secrets exposed to subprocess environment | `apps/hub-api/src/lib/run-secrets.ts:53-66` |
| Current context and memory selection | `apps/hub-api/src/node/brain.ts:75-80,242-307` |
| Live events | `apps/hub-api/src/node/events.ts:1-35` |
| Cooperative crew test | `apps/hub-api/src/node/node.integration.test.ts:471-536` |
| Device recovery, evidence and local-file policy | `docs/25_REMOTE_TASKS_ON_YOUR_COMPUTER.md:23-38,64-108` |
| Engine capabilities and subscription boundaries | `docs/30_ENGINES.md:22-28,102-105,154-160,186-209` |
| Existing durable execution and decisions | `docs/05_MODULE_TASK_ORCHESTRATOR.md:5-65` |
| Synchronous device relay (second pass) | `apps/hub-api/src/devices/file-relay.ts:14,22-56`; `devices/code-routes.ts:1-10` (human-only terminal and Code tab) |
| Run MCP server in every engine (second pass) | `workspace/engines/claude-code.ts:218-220`; `codex.ts:11,121`; `copilot.ts:181-198`; `acp.ts:12`; `cursor.ts:222-248`; `workspace/engines/registry.ts:26`; `scripts/ensemble-ask-mcp.mjs` |
| Completion and evidence contract (second pass) | `apps/hub-api/src/remote/contract.ts:57-72,110-134,238-272` (20,000-character summary); `remote/files.ts:90,126-145` (text files only) |
| Job queue and wake-up latency (second pass) | `workspace/worker.ts:108,163,218` (1.5 s poll); `node/runs.ts:15,88-100` (15 s poll) |
| Restart recovery ends plan steps (second pass) | `apps/hub-api/src/node/queue.ts:247-259` |
| Briefs carry copied constraints (second pass) | `apps/hub-api/src/node/brain.ts:131` (lead persona); `node/tools.ts:259-280` (`node_delegate`) |
| Deploys (second pass) | `infra/deploy/ensemble-api.service`; `infra/deploy/testing/deploy.mjs`; `infra/deploy/ensemble-autodeploy.timer` |

The authorised account observations in section 4 are a sanitised case study, not a public dump of account records. Keep any future replay fixtures synthetic; do not commit production conversations or credentials.
