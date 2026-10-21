# 04 · Nodes and models

> **Superseded design (pre-v0, 19 Oct 2026).** Written for a separate Node API with its own database and an Ensemble client. v0 moved Node's backend into Ensemble's hub-api instead ([01 §2](../../01_IMPLEMENTATION_GUIDE.md#2-architecture)), so the tables, routes, env vars and E-items below are not the implementation. Keep it for the ideas it holds (autonomy levels, plans, routines, skills, peer requests); the current behaviour is in Ensemble's `docs/35_ENSEMBLE_NODE.md`.

Design, 19 Oct 2026. Scaffold: `packages/shared/src/nodes.ts`, `models.ts`; `apps/node-api/src/brain/*`; `packages/prompts`.

## 1. Anatomy of a node

| Field | Meaning |
|---|---|
| `slug`, `name`, `avatar`, `role` | Identity. Handle is `@slug` in your rooms and `@you/slug` in group rooms. Roles: manager, engineer, tester, docs, researcher, assistant, custom |
| `charter` | Persona, responsibilities, working style, rules — written by the owner (templates provide good defaults). Becomes `AGENTS.md` in the node's run folder on the computer |
| `chatModel` | The voice: reads the room, decides, calls tools, writes the reply |
| `plannerModel` | Optional stronger model for managers' plans and hard decisions |
| `worker` | Engine (`claude-code`, `codex`, `cursor`, `ensemble`), job kind (`code`, `research`), engine model, effort, Ensemble run profile |
| `computer` | Preferred computers (ordered), failover policy, folder labels and repositories it may use |
| `ensembleSpaceId` | The Ensemble space it reads and writes (default: the space approved at sign-in) |
| `autonomy` | Per-action levels ([11 §2](11_APPROVALS_AUTONOMY_AND_SAFETY.md#2-the-autonomy-matrix)) |
| `budget` | Daily credits, concurrent jobs, job minutes, messages per hour |
| `skillIds` | Ensemble Skills the node loads on demand |
| status | `active`, `paused`, `archived` |

Design guidance borrowed from Grok Bot's docs: **narrow, single-purpose nodes build better context than one catch-all node.** Node suggests spinning off a focused node when one keeps receiving a recurring kind of work.

## 2. Three model roles

```text
           ┌──────────── node ────────────┐
 message → │ chat model (small, every msg) │ → reply / tool calls
           │   └─ planner (managers, hard) │ → plans, briefs
           └──────────────┬────────────────┘
                          │ run_on_computer / delegate
                          ▼
           worker engine on the owner's computer (heavy, only for real work)
```

| Role | Runs | Typical models (Oct 2026) | Cost character |
|---|---|---|---|
| **Chat** | Every turn | GPT‑6 Luna (included, 1×), Claude Haiku 5.5 (Claude plan or key), DeepSeek V4 Flash (included, ~2×), Gemini 3.5 Flash-Lite (key) | $0.10/$0.50 per MTok class; most turns are short |
| **Planner** | Manager plans, re-plans, reviews | Claude Sonnet 5.5, GPT‑6.1 Sol (~20× Luna), Grok 4.7 | Used a few times per request |
| **Worker** | Inside an Ensemble job on the computer | Claude Code (opus/sonnet), Codex (gpt-6.1-sol, gpt-6-astra, gpt-5.3-codex), Cursor's agent, Ensemble's agent on a High/Max tier | Usually the person's existing plan; no Node cost |

**How Grok Bot and Dots do it** ([research](../../research/grok-bot.md), [research](../../research/chatgpt-dots.md)): Grok Bot hides models behind Cursor's router (cheap model for simple requests, frontier for complex; subagents with faster models; a separate Cloud Agent VM for heavy coding). Dots runs the conversation on GPT‑6 Astra, splits work among background agents and hands bounded jobs to ChatGPT Work or Codex. Neither lets the person choose the conversational model. Node makes each role explicit and user-chosen, defaulting to the cheap-front/heavy-worker split that Anthropic explicitly recommends (Haiku 5.5 "pairs well with Opus 5.5/Sonnet 5.5 as a subagent").

**When a node uses the planner.** `propose_plan`, re-planning after a failed step, and reviewing a finished delegation against acceptance criteria run on `plannerModel` when set. Phase 1 implements this as a second gateway call with the planner choice for those tools' turns (`purpose: "node.plan"`); everything else stays on the chat model.

## 3. Where the chat model runs

Node holds **no provider keys**. `brain/gateway.ts` sends every model step to Ensemble (E2), which funds it from the provider in the choice:

| Provider in the choice | Funded by | Runs on |
|---|---|---|
| `ensemble` | Included Ensemble credits (20,000/month default; reservations; global ceiling) | Ensemble's server (Azure deployments) |
| `anthropic`, `openai`, `google`, `xai`, … | The person's API key saved in Ensemble | Ensemble's model runtime |
| `claude-code`, `codex`, `cursor-agent`, `copilot-cli` | The person's AI subscription | **The person's computer**, through Ensemble's assistant-turn relay with Node as the tool host (E2b, Phase 2) |

E2 is a **single step**: Node sends system prompt, messages and tool schemas; Ensemble returns text and tool calls; Node's brain runs the tools and loops. Subscription agents run their own loop on the computer, so E2b gives the computer's MCP bridge Node's tool endpoint (per-turn token) instead of executing tools itself — the same mechanism Ensemble already uses for its assistant on subscriptions (`subscriptions/relay.ts`), with a different tool host.

If the computer is offline, a node on a subscription chat model falls back to the person's configured fallback (default: included GPT‑6 Luna) and says so; it never silently borrows another person's credits.

## 4. A turn

`apps/node-api/src/brain/turn.ts`, queued by `brain/queue.ts` (durable `turn_jobs`, one running turn per node).

1. **Trigger:** a routed message, a delegation, a job update, an answered approval or a routine (`reason`).
2. **Context** (`brain/context.ts`): system prompt = `NODE_SYSTEM` (+ `MANAGER_ADDENDUM` for managers, + `REPRESENTATIVE_ADDENDUM` in cross-owner rooms) with charter, skills index, active memory (node/account/room scopes), room roster, open work, computer status, autonomy summary, time. The conversation goes in as **one transcript message** (`#seq Name (@handle): text`), last 40 messages visible to the owner, followed by why the node was woken. Stable guidance first, changing state last, for provider prompt caching.
3. **Loop:** up to `NODE_TURN_MAX_STEPS` (default 8). Each step: model call with tools; each tool call is validated (zod), authorized ([11 §2](11_APPROVALS_AUTONOMY_AND_SAFETY.md#2-the-autonomy-matrix)) and run through its service. Results are capped at 6,000 characters. The last step has no tools, forcing a final answer.
4. **Ends** when the model answers without tools, calls a terminal tool (`stay_silent`, `ask_owner`), or a call is held for approval.
5. **Posting:** the final text becomes one message in the room/thread. In a cross-owner room the reply itself passes the `room.reply` → `room.post_external` check; when that is "ask", the drafted text becomes an owner-only approval and is posted, for the owner, only after approval.
6. **Record:** `node_turns` stores provider, model, `PROMPTS_VERSION`, steps, tool calls with outcomes, tokens, credits, outcome (`replied`, `silent`, `held`, `error`).
7. **Resume after approval:** a turn woken by an approved held call runs that exact call first, exactly once, then continues (`resumeFromApproval`).

## 5. Tools

### 5.1 Node tools (`brain/tools/node-tools.ts`)

| Tool | Autonomy class | What |
|---|---|---|
| `stay_silent` | — | End without posting |
| `delegate` | `crew.delegate` | Delegation to another node in the room (cross-owner targets need their owner's approval) |
| `propose_plan` | `plan.execute` | Managers only: plan DAG; starts ready steps |
| `run_on_computer` | `computer.code` / `computer.research` | Ensemble job on the owner's computer with node files and run tools |
| `work_status`, `stop_work` | — | Inspect or stop a delegation and its job |
| `finish_delegation` | — | Assignee closes with outcome + summary |
| `request_changes` | `crew.delegate` | Follow-up delegation with feedback (max 2 rounds) |
| `ask_owner` | — | Private question card with options; ends the turn |
| `request_peer` | `peer.request` | Work request to another person's node |
| `remember`, `recall` | `memory.write` / — | Memory |
| `create_routine` | `routine.manage` | Schedule or trigger |

Planned: `load_skill` (read an Ensemble Skill body), `schedule_followup` (one-off self wake-up, Dots-style), `react`, `post_artifact`, `ensemble_how_to` (load another Ensemble playbook's tools).

### 5.2 Ensemble tools

Through E3 a node gets the **Ensemble assistant's own tools** (`hub_*`, `apps_*`, calendar tools…), executed by Ensemble with the owner's token, the node's space and Ensemble's write policy. Reads are `ensemble.read`; ordinary writes `ensemble.write` (undoable); always-held writes (connected apps, settings, assignments, workflows) `ensemble.write_sensitive`. A write Ensemble holds for Apply comes back as `held` and becomes an owner approval (`ensemble_write`) instead of failing.

Phase 1 offers a fixed allowlist (`ENSEMBLE_TOOL_ALLOWLIST` in `app.ts`: surface read, tasks list/create/update, page blocks read/edit, skills list/read, connections list, `apps_search`/`apps_read`). Phase 2 replaces it with Ensemble's own **playbook routing**: E3 accepts the message text and returns the routed tools (≤ 2 playbooks preloaded, as the assistant does), and `ensemble_how_to` loads more mid-turn. Node keeps its own tool count per request well under Ensemble's 128-schema cap.

## 6. Guardian review (Phase 3)

A separate cheap model reviews actions before they run when the owner sets a class to "auto with review": shell-touching delegations, connected-app writes, external posts, browser actions with logins. It sees the proposed call, the requester and the room; it can pass, hold for the owner, or block with a reason. This mirrors Grok Bot's Auto Review and Dots' Auto-review. Hard floors ([11 §4](11_APPROVALS_AUTONOMY_AND_SAFETY.md#4-hard-floors)) never depend on it.

## 7. Evaluation

Every turn is a row in `node_turns`. Phase 1 adds an evaluation harness (scripted rooms, `ScriptedGateway`, opt-in real models like Ensemble's `assistant-eval.ts`) scoring: correct silence, correct responder, tool choice, plan validity, escalation correctness, tokens per resolved request. Results are stored per `PROMPTS_VERSION` and model so prompt or model changes are compared on the same rooms.
