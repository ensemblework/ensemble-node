# 06 · Capabilities and roadmap

Plan, 19 Oct 2026. Bar set by the owner: **at least Grok Bot + ChatGPT Dots combined, plus more — especially in task management, delegation and using Ensemble.** Sources: [Grok Bot](research/grok-bot.md), [Dots](research/chatgpt-dots.md). Phases: [01 §7](01_IMPLEMENTATION_GUIDE.md#7-phases).

## 0. What v0 already covers

The matrix below was written before v0 and its phase labels (P0–P4) are the original plan. v0 ships these rows today: persistent named nodes with signature avatars (shape, colour and eyes) and instructions (unique names); many nodes per person (24); templates, and crews built from suggestions and existing nodes; choosing the chat model (included models, own API keys, AI plans on a paired computer); terminal, files and coding agents on your own computer and subscriptions (several computers): the node drives agent sessions itself, starting one, queueing the next message, steering or replacing the run going on and stopping it, chooses the session for the line of work, and keeps to its own sessions, with the work off the board unless you ask for a task; plus opt-in read-only file reads in shared folders; pausing a node, which stops its runs and says what it stopped; one Needs me shared with Ensemble and the CLI; secrets typed into a secure box, encrypted in the browser for the computer's own key, and used by runs as `$NAME` or by reference only; sign-ins handed to you on a card when a node's or a run's browser needs your account (the login saved on the computer, signing in there, typed on the card encrypted for that computer, or controlling that browser from Node on your phone, encrypted end to end), the tab paused for everyone else until then; temporary helpers (read-only by default, or allowed their own agent session), each a step of its parent's plan, whose rooms show as threads (brief and report) under the message that asked, in the conversation they were asked in, and which you can keep as lasting nodes, with how many may work at once per node; nodes that make nodes and crews when asked, proposing them on a card first unless you let them; routines: work a node does on a schedule in any time zone, when tasks or pages change in Ensemble, or when a webhook calls, reporting always, only when something needs you, or never, with Run now, pause, a history of runs and each run's card; a fast default model at low thinking; rooms with other people (requests to join, 1–3 nodes each with a lead, up to 10 people unless the creator raises their own limit, at most 50), each with a shared Room and every person's own My crew: only a lead you name answers in the Room, within its owner's rules for that room (status, how much of it, shareable items, what to ask first, a monthly budget), asking its owner on a card before sharing anything else; Ask my nodes and Share to room; `@leads status` status cards; away with a note and presence; peer requests (questions, shares, reviews of an exact candidate, work), sent by you or drafted by your lead for you to send, that the person asked accepts as asked or with their own words for their lead (which stay theirs; the room's card shows only what was asked), always, or declines with a note only the requester reads; a space for the room's work, linked by its creator and offered to each person, with a Board where requests for work become proposed tasks with who asked, started as private work with a shared result or as a shared run (and a steward's proposals started or declined), with your own plan for a task on its row; private notes from your lead of what changed for you there, and a catch-up when you come back; results drafted for you to post into the room with their media and onto their task; contracts that tell the people whose work uses them what changed, a decisions log confirmed with ✅, and a steward for meeting notes; @mentions and `@everyone`; sensible handling of unaddressed messages (DM node, crew lead; nobody in a room with other people until a lead is named); crew plans: one node answers in a crew, the lead hands work out as ordered steps that run quietly and reports once, with a live plan card that keeps whether a step ran apart from whether it passed, holds the steps after a failed check, and shows attempts, checks, the requirements asked for and the evidence runs attached (`node_delegate`); session cards to steer, queue, replace or stop an agent session and edit its queue, to read what the agent was told, and to hand the session to another node (or give one no node manages to a node); a Sessions page listing every agent session, those started in the Hub or the CLI too, each with who manages it; plans whose builds work in parallel (each in its own worktree or copy, brought together by an integration step), with what each attempt built or tested and checks a later change made stale; approvals inside a room visible only to their owner; reactions, replies, pins, search, people-only / nodes-only views, deleting your own messages, export, retrying or editing a message that was not sent; file attachments (upload, choose from Ensemble Files, drag and drop, paste; nodes read their owner's files, pictures too when their model sees images); per-node memory you can view, add and delete; browsing and capture on your own computer: screenshots and videos (with their posters and length) that a node shows in the conversation once checked, captures that may show something private held on a card until you preview and send or discard them, a live picture of a run's browser tab on its card, each node's captures in its settings, and what each computer can capture; draft-then-post for shared rooms; stop; activity view; Needs me and connected apps from Node; web client. Partly: per-action control (Ensemble's write policy plus the shared-room rule, not yet a per-node matrix); skills (Ensemble's playbooks and skills apply to node turns); mobile (installable web app, no push yet).

## 1. Parity matrix

Legend: ● has it · ◐ partly · — no. Node column = the phase that delivers it.

### Agents and identity

| Capability | Grok Bot | Dots | Node |
|---|---|---|---|
| Persistent named agents with avatar, description | ● | ● | P1 (avatars generated/uploaded P2) |
| Many agents per person | ● | ◐ (one primary) | P1 (12 per person) |
| Narrow single-purpose agents encouraged; agent suggests spinning off one | ● | — | v0: temporary helpers for side tasks, kept as lasting nodes when you choose; nodes make lasting nodes and crews when asked |
| Templates / role gallery / marketplace | ● | ◐ (specialist dots, enterprise) | P1 templates · P3 marketplace |
| Duplicate an agent; share as template | ● | — | P2 |
| Sidebar sections, pin, hide | ● | — | P2 |
| Choose the conversational model | — | — | **P0** |
| Choose the worker model/engine | — | ◐ (in Work/Codex) | **P1** |

### Compute and execution

| Capability | Grok Bot | Dots | Node |
|---|---|---|---|
| Works while your devices are off | ● (cloud VM) | ● (cloud computer) | ◐ P1: needs a running computer; "always-on box" guide; failover |
| Browser with persistent logins | ● | ● | **v0 (the browser on your computer keeps one profile per owner; a page that needs your account asks you on a card: your saved login, signing in on the computer, typed on the card encrypted for that computer, or controlling its browser from here, end to end; no model sees it. Screenshots and videos are evidence, held for you to check first when they may show something private)** |
| Terminal and files | ● | ● | **P1 (your real machine, your repos)** |
| Use your own computer | ◐ (opt-in, per-command) | ◐ (one computer, desktop app open) | **P1, primary path, several computers** |
| Watch the agent's screen live / take over | ● | ● | **v0 for the browser (a live picture of a running run's tab on its card, paused while signing in or with a secret on screen; taking over a sign-in's tab, or a running run's tab from its live view, from Node, encrypted end to end between your browser and your computer); the desktop beyond the browser is not** |
| Secret input never seen by the model | ● | ● | **v0 (secure box encrypted in the browser for your computer's key; `$NAME` in agent runs, or by reference only with `secret_http` and git)** |
| Heavy coding handed to a coding agent that opens PRs | ● (Cloud Agent) | ● (Codex) | **P1 (Claude Code / Codex / Cursor on your plan)** |
| Parallel background workers | ● (per-bot screens, subagents) | ● (background agents) | **v0: jobs per node, and a plan's builds in worktrees of one repository** |

### Collaboration

| Capability | Grok Bot | Dots | Node |
|---|---|---|---|
| Group chats with several agents | ● (2–6) | ◐ (Slack threads) | **P0/P1 (≤8 nodes, 16 people)** |
| @mention routing, @everyone | ● | ● (Slack) | P0 |
| Unaddressed messages handled sensibly | ● (self-select) | — | P0 rules + P2 relevance router |
| Threads, reactions | ● | ● (Slack) | P1 threads · P2 reactions |
| Agent-to-agent hand-offs | ● | — | **P1 structured delegations + plans** |
| Admin switch for agent-to-agent messaging | ● | — | P1 (per room) |
| Several humans with their own agents in one room | ◐ (Team Bot = one shared bot) | ◐ (owner only) | **v0: leads, each person's My crew, peer requests** |
| Approvals inside the group, visible to the owner only | — (never in groups) | — | **v0 (in My crew)** |
| Shared team agent with private per-person chats | ● (Team Bot) | — | P4 (team nodes) |

### Memory, skills, proactivity

| Capability | Grok Bot | Dots | Node |
|---|---|---|---|
| Per-agent memory | ● | ● | P1 |
| View / edit / delete individual memories | ◐ | — | **P1** |
| Shared/team memory | ● (Team Bots) | — | P1 (crew, room, account scopes) |
| Skills / reusable procedures | ● | ● | P1 (Ensemble Skills) · P2 structured |
| Teach by demonstration | ● (≤10 min recording) | — | P3 |
| Schedules with timezone | ● (≤50/bot, ≥5 min) | ● | **v0: routines (presets or cron, any time zone)** |
| Event triggers (Slack, email, GitHub, Linear, Sentry, PagerDuty, webhooks) | ● | ◐ (explicit monitoring) | ◐ v0: Ensemble task and page changes, and webhooks (anything that can call one) · P4 (more) |
| Test a routine now | ● | — | **v0 (Run now)** |
| Self-scheduled follow-ups | — | ● | P2 |
| Proactive read-only research | ◐ | ● | P3 |
| Auto-pause routines after long inactivity | ● | — | P2 |

### Control and safety

| Capability | Grok Bot | Dots | Node |
|---|---|---|---|
| Per-action rules (auto / ask / never …) | ● | ● (4 behaviors) | **P1 per node, per action, 4 levels** |
| Allow once / for this task / always | ● | ◐ | P1 (engine permissions) |
| Independent reviewer model | ● (Auto Review) | ● (Auto-review) | P3 (guardian review) |
| Non-overridable floors | ◐ | ● | P1 |
| Draft-then-send for outbound messages | ● | ● | P2 (`room.post_external` + external channels) |
| Unattended approvals expire | ● (~10 min) | — | P2 |
| Stop now / pause | ● | ● | P1 |
| Activity feed / audit | ● (action recording, OTel) | ● (activity view, compliance API) | P1 ledger · P2 activity feed · P4 export |
| Mobile push for approvals | ● | ● | P1 (PWA) |

### Integrations and clients

| Capability | Grok Bot | Dots | Node |
|---|---|---|---|
| Many app integrations (MCP-based) | ● | ● (4,000+) | P1 via Ensemble's connectors and vendor MCP (E3) |
| Agent-owned email address | ● | — | P4 |
| Slack / Teams channels | ● (Team Bots) | ● / ◐ | P4 |
| X `@bot` tagging, voice calls, SMS | ● / ● / — | — / ● / soon | P4 (voice notes P3) |
| Web client | — | ● | **P0** |
| Desktop / iOS / Android | ● | ● | PWA P1 · native P4 (desktop: Ensemble's app) |
| Public developer API for agents | — | — | P4 (A2A Agent Cards, Node MCP) |

## 2. Where Node goes beyond both

1. **Your computer, your subscriptions, your choice of models.** No VM per user or per agent; the work runs where your code, tools and logins already are, often on the AI plan you already pay for. Chat, planner and worker models are chosen per node.
2. **Ensemble-native work.** Every delegation can be a task on your board; results are pages, runs with traces and changed files, decisions in Needs me; everything links back. Nodes operate Ensemble with the assistant's own typed tools (create/update tasks, edit pages precisely, manage skills, read connected apps), with Undo.
3. **Real delegation, not just chat.** Plans as DAGs with acceptance criteria, dependency-ordered execution, review loops capped at two rounds, follow-ups instead of reopening, depth limits, and a manager that reports once.
4. **Multi-person collaboration through agents.** Each person brings a representative; requests route by responsibility; each person approves privately inside the shared room; nodes speak "for" their owner only with approval; crews stay private.
5. **Answer anywhere.** The same decision closes in Node, Ensemble on the web, the phone, or `ensemble needs` in a terminal.
6. **Memory you can see.** Every remembered fact is a row you can edit, scope and delete.
7. **Parallel engineering on one repository** with runtime-managed worktrees per node.
8. **Transparent costs.** Per-node budgets, credits by purpose, turns recorded with model and prompt version.
9. **Open seams.** Typed Ensemble API, MCP, ACP for coding agents, A2A for outside agents (planned).

## 3. Ideas backlog

Grouped; each is a candidate, not a commitment. Promote by writing a design in `docs/design/`.

### Task management with Ensemble
- **Room ↔ project binding:** a group room mirrors an Ensemble project; delegations become tasks, plan steps become subtasks with dependencies, the board shows which node owns what.
- **"Assign to node" from the Ensemble board:** drag a task to a node's avatar; the node picks it up with the task page as the brief (E8 + E4 `task.assigned`).
- **@node in Ensemble pages** (E9): "@docs update this page for the new API" in a comment.
- **Morning standup:** each manager posts a 5-line standup from the board (done/doing/blocked), cross-owner rooms get one combined standup.
- **Definition-of-done templates per project** (acceptance criteria the manager always adds).
- **Deadline-aware planning:** the manager reads due dates and calendar availability (Ensemble calendar tools) and warns early.
- **Weekly recap page** per crew written into Ensemble.

### Delegation and orchestration
- **Plan simulation:** before approval, show estimated duration/cost per step from past `node_turns` and job evidence.
- **Re-plan on failure** with a diff of the plan for the owner.
- **Stall detection** (no progress for N turns → re-plan or escalate).
- **Specialist borrowing:** a manager asks another person's node for a bounded task through a peer request, with a price/time estimate.
- **Escalation ladder:** worker → manager → owner, with timeouts and a default safe action.
- **Steer a running job:** "also update the README" reaches the running engine session (Claude Code streaming input, Codex turn steering) via Ensemble.

### Collaboration
- **Client portal room:** a room where the client sees only their representative and status cards; everyone else's nodes are invisible to them.
- **Handoff notes:** when a person is away, their representative tells requesters and holds work; "out of office" routing to a delegate person.
- **Decision log per room:** approved decisions become room memory automatically.
- **Meeting assist:** Ensemble meeting notes → action items → delegations, with owner approval.

### Computers and execution
- **Computer pools:** several computers per person with capability tags (GPU, macOS for iOS builds); nodes request capabilities.
- **Cost-aware engine choice:** cheap engine for small changes, strong engine for big ones, by the manager.
- **Preview environments:** the tester starts the app locally, records a short screen capture or screenshots for the room.
- **Wake-on-LAN** for a sleeping home machine from an always-on box.

### Intelligence and learning
- **Learning from reviews:** when the owner edits a plan or rejects work, a memory proposal captures why.
- **Per-node scorecards:** success rate, cycle time, approvals needed, cost — surfaced to the owner with suggestions ("Tester rarely needs approval for X; lower to notify?").
- **Prompt and model A/B** on evaluation rooms before switching defaults.

### Channels and reach
- Native mobile with widgets and lock-screen approvals; Slack/Teams/Telegram bridges; an email address per node; voice notes in and out; browser extension "send this page to a node".

### Trust and governance
- **Organization policies** (Ensemble workspaces): which engines/models, which autonomy ceilings, which external rooms.
- **Signed approvals** with passkeys for high-risk actions (pushes to protected branches, payments).
- **Audit export** and OpenTelemetry for teams.

### Ecosystem
- **Template marketplace** (crews, nodes, skills) with ratings and safety review.
- **A2A Agent Cards** for nodes; MCP server for Node itself (rooms and delegations as tools for other agents).

## 4. Templates

`templates/nodes/<id>.md` = YAML frontmatter + the charter as Markdown; `templates/crews/<id>.yaml` = node list, manager, room title and routing. Loaded and validated at API start (`apps/node-api/src/nodes/templates.ts`; a test checks every crew references known node templates and includes its manager).

| Node template | Role | Chat model | Worker |
|---|---|---|---|
| `manager` | manager | included GPT‑6 Luna; planner Claude Sonnet | Claude Code, research |
| `feature-engineer` | engineer | GPT‑6 Luna | Claude Code `opus`, code |
| `tester` | tester | GPT‑6 Luna | Codex `gpt-6.1-sol`, code; never pushes |
| `docs-writer` | docs | GPT‑6 Luna | Claude Code `sonnet`, code; Ensemble pages |
| `researcher` | researcher | GPT‑6 Luna | Ensemble's agent, research |
| `personal-assistant` | assistant (representative) | Claude Haiku on the person's plan; planner Sonnet | Ensemble's agent, research |

| Crew template | Nodes |
|---|---|
| `software-team` | manager, feature-engineer, tester, docs-writer |
| `research-desk` | manager, researcher, docs-writer |

Candidates: `client-delivery` (PA + manager + feature + tester), `ops-desk` (incident triage, CI watcher, release manager), `content-team` (researcher, writer, editor), `personal-chief-of-staff` (PA + calendar/email triage on Ensemble connectors).

## 5. Roadmap at a glance

| Phase | Theme | Headline features |
|---|---|---|
| P0 | Foundations | Link sign-in, DMs, rooms/messages/SSE, turn loop on Ensemble models |
| P1 | Single-owner MVP | Crews, plans, delegations, computer jobs, approvals + push, Ensemble actions, memory, audit |
| P2 | Many people | Group rooms with people, representatives, router, owner-only cards in shared rooms, peer requests, OAuth, subscription chat models, worktrees, routines + triggers, activity feed |
| P3 | Depth | Browser broker + logins + take-over, guardian review, teach by demonstration, @node in Ensemble, node identity on tasks, semantic memory, evaluations, marketplace |
| P4 | Reach | Native mobile, channels (Slack/Teams/Telegram/email), voice, A2A, team nodes, enterprise controls |
