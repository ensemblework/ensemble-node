# Ensemble Node: the node as manager, and rooms with people

**Status: Proposed.** 29 October 2026. Extends [Reliable work before more agents](ensemble-node-runtime-plan.md) (“the plan”) and its [build blocks](ensemble-node-build-blocks.md). Part A covers one owner with many agents and is built first, inside milestones M2–M5. Part B covers rooms where several people bring their own nodes. It is built after Part A works well (milestones M7–M8). Part B is designed now so that Part A does not paint it into a corner.

## 1. What the owner asked for

| # | Requirement | Where |
|---|---|---|
| R1 | The node is the manager of agent sessions: steer the run going on, stop it and send something else, stop only, or queue the next message to run when the current one ends. | §4 |
| R2 | A node can do at least everything the Ensemble assistant does (tools, skills, playbooks), and much more. | §5 |
| R3 | A node can ask for an API key or other secret through a special input box, not the chat. The value works but is never shown to a model. | §6 |
| R4 | A node can browse the web on the owner's accounts, on the owner's own computer, without taking over their everyday browser. | §7 |
| R5 | A node sends screenshots and videos: of web pages, of an app on `localhost`, of a desktop app it built (an Electron app on Ubuntu), of an animation. It sends them only once it has checked the result works. | §8 |
| R6 | The node is mainly a communicator that hands creative and coding work to coding agents, but it also works itself: browsing, reports, Markdown files. | §9 |
| R7 | A node can create temporary helpers, which talk only to it and appear inside the chat (read-only for the owner, opened and closed in place, not in the sidebar). It can also create normal nodes. | §10 |
| R8 | A node is always available to talk. A question while it works gets an answer without stopping the work, unless the owner asks it to stop. | §3 |
| R9 | A node can ask the owner to sign in while it browses. | §7, build blocks B11, B21 |
| R10 | Rooms with real people. Each person brings 1–3 of their nodes with one lead. Public talk is human↔human or human↔lead only. Each person can talk privately to their own nodes in the room. | §13, §14 |
| R11 | People may ask each other's leads for clarification or status, but cannot give another person's nodes work. Such a request goes to that node's owner for permission, privately. | §15, §16 |
| R12 | A separate space in each room where a person works with their own nodes, which can read the public conversation. | §13 |
| R13 | A shared Ensemble space for the room: board, assigned tasks, pages, diagrams, files, meeting notes. Every member's nodes can use it and know who is working on what. A task assigned to a collaborator reaches their nodes; their lead reports back, with screenshots or video. | §17, §18 |
| R14 | Nodes reach every space their owner can, while the Ensemble assistant stays in one space per conversation. | §5.2 |

## 2. What exists today

Build on these; do not rebuild them.

| Area | Today | Gap |
|---|---|---|
| Session control | `node_session_start`, `node_session_send` (queue, steer, replace), `node_session_stop` (drop or keep queued) and `node_sessions`. Queued messages are durable job rows. Steer interrupts the run and resumes the same agent conversation with the update. | The run card only has **Stop**. The node cannot act on a message while busy (R8). Nothing watches for stuck runs. |
| Turn concurrency | One turn at a time per node (`queue.ts`). A message during a running turn waits for it. | R8 needs a conversation that stays free while work runs. |
| Assistant parity | Node turns run Ensemble's assistant loop with every Hub tool (about 120), playbooks and skills. Two tools are replaced by session tools. | Parity is not tested. A node works in one space (`NodeAgent.spaceId`, or the owner's own). |
| Secrets | A secure card: the value goes to the computer and becomes `$NAME` in agent runs. | The hosted API sees the value, and every run gets every secret (plan §4.7; B7, B12). |
| Browser | None in the local runtime. | B10, B11, B21. |
| Screenshots and video | None anywhere. No ffmpeg, no virtual display, no recording. | §8 (B19, B20). |
| Helpers | `node_helper` creates a read-only helper in its own task room. Limits: 4 working per node, 8 per owner. | R7 wants helpers that can work, shown inside the chat. |
| New nodes and crews | `node_create` and `node_create_group`, in owner-only chats, up to 24 nodes. | Fine as it is; adds a proposal card (§10). |
| Rooms with people | Up to 10 people. Each picks 1–3 nodes and one representative to join. There is a private toggle ("only you and your own nodes"), and a separate private conversation per member. Turns from non-owners hold writes for the owner. Shared rooms use draft-then-post. | Mentioned non-lead nodes answer publicly, representatives answer unaddressed messages, and nodes can wake other nodes. R10 forbids all three. No structured requests across people; no shared space. |
| Shared spaces | A space is a `users` row. Up to 2 members (viewer or editor) and per-item shares. `Task.assigneeAccountId`. A member's agent runs execute on their own computer, visible to the space. Live presence. | Member limit too low for rooms. No binding to rooms. No events to nodes. |

## Part A — One owner, many agents

## 3. The node: one voice, many hands

### 3.1 Lanes

A node runs in **lanes**. Lanes run in parallel; turns within a lane run in order.

| Lane | One per | Runs | Rules |
|---|---|---|---|
| **Conversation** | Node × room thread (public, or the owner's private thread) | Short turns that answer messages | Always available. A turn aims to finish in seconds: under about 30 seconds and a handful of tool calls. Anything longer becomes work. It is the only lane that writes chat messages. |
| **Work** | Piece of work the node does itself (§9) | Longer sequences of model turns with tools: browsing, writing, research, checking | Runs in the background with its own context. It reports through its mission (status, results, evidence, questions), never through chat. It can be steered, paused and stopped. |
| **Sessions** | Coding-agent session | The owner's coding agent on their computer | Unchanged: Ensemble jobs. The node manages them (§4). |
| **Helpers** | Helper | The helper's own conversation and work lanes | Reports only to its parent (§10). |

So a long browse-and-write task never blocks a question. The owner asks, the conversation lane answers within seconds from the current state of the work, and the work carries on.

### 3.2 Every piece of work is a mission

A one-off request ("browse these three sites and write a comparison") is a one-step mission. A crew plan is a mission with many steps. Both use the same machinery: outcomes, attempts, evidence, decisions and durable transitions (plan §7, blocks B1–B6). The executor of a step is one of:

| Executor | Used for |
|---|---|
| `self` | The node's own work lane (§9) |
| `session` | A coding-agent session (§4) |
| `helper` | A temporary helper (§10) |
| `node` | Another of the owner's nodes (a crew step) |
| `person` | A person, through a shared task (Part B) |

The conversation lane creates missions; it never runs them. It creates one-step missions itself. A request that needs a plan gets a **planning turn** on the planning model (§3.7), run in a work lane, which proposes the plan with `node_plan` (B6). The plan card opens from it, and the conversation lane stays free meanwhile.

### 3.3 The work board: what the conversation lane knows

Each conversation turn receives a compact, code-built **work board** instead of a long transcript:

```text
Missions (active):  title · status · current step · last event · waiting on
Sessions:           agent · computer · folder · running "…" · queued: 2
Own work:           title · progress line · started · next check-in
Decisions waiting:  what · since
Results not yet told to the owner
```

That is enough to answer "how's it going?", "what is Claude doing right now?", or "use the dark theme instead". The conversation lane can read details with tools (`node_work`, `node_sessions`) when it needs more.

### 3.4 One voice

Only the conversation lane writes in the chat. When work finishes, a `work.ended` event wakes the conversation lane, which sends one message: the result, its media and anything that needs the owner. For simple completions, code posts a result card without a model turn. Progress edits cards in place and never adds messages. This keeps the owner's rule: about two to five messages per request and no chatter.

### 3.5 Interruptions and stop

| Situation | Behaviour |
|---|---|
| New owner message while a conversation turn is running, before any mutating tool was dispatched | Abort that turn and start again with both messages. Coalescing keeps answers coherent. A tool's intent is recorded *before* it is dispatched, so "dispatched" is known exactly. |
| Same, once a mutating tool was dispatched | The turn becomes non-abortable. It finishes (it is short), and the new message is answered next. An outcome left unknown by a crash is reconciled, never repeated blindly (B4). |
| New owner message while work runs | Answered by the conversation lane at once. The work continues unless the message says otherwise. |
| A correction meant for running work ("use Postgres, not SQLite") | The conversation lane steers it: a note into the work lane's inbox, or a `steer` to the session. |
| **Stop** (a button, or a message that is only a stop command) | A deterministic stop path, with no model. It stops what is in focus (the current turn, a work item, a session, a mission) or everything with "Stop all". Late results are fenced (B5). |
| Work needs a decision the owner has not given yet | As in Duet, everything that does not depend on it continues. The question waits in Needs me and is asked once. |

### 3.6 Lanes never race on the same thing

Lanes run in parallel, but **commands on one target are serialised**. A target is a session, a mission, a work item, a card, or a device resource such as a browser tab, a folder or a port.

- Each target has a sequence and a revision.
- Steer, stop, queue, report and deliver are applied in order, with a compare-and-set on the revision.
- A command based on stale state is rejected, and that lane re-reads the target.

Two other rules prevent races:

- **Device resources** use claims (B13's model, introduced earlier where needed).
- **Memory writes** are append-only, with the source lane recorded.

**Placing the plan's turns in lanes.** Crew step turns and `self` steps run in work lanes. The lead's plan report and every chat message or card go out through **one delivery outbox per thread**, in order, from the origin conversation lane. A user never sees two lanes answer at once.

### 3.7 Models per lane

| Lane | Default | Why |
|---|---|---|
| Conversation | A fast model (Luna, or Sol low) | Short turns that answer, route and steer. Latency matters most. |
| Planning and repair judgement | Sol medium until the B0 evaluation says otherwise | Quality matters most. |
| Own work | The node's work model, chosen per node or mission | Depends on the task. It needs vision for visual checks. |
| Coding | The owner's agent and model | Unchanged. |

The owner can set a talk model and a work model per node.

**Availability needs capacity.** Lanes alone do not guarantee that the node answers: three running work turns can use up the provider's concurrency or rate limit.

- Part of the talk model's capacity is reserved for conversation.
- New work turns are not started when capacity runs low.
- A conversation turn that meets a rate limit or a slow provider falls back to another configured model, or replies from the work board without a model ("Working on it: … Ask again in a moment").
- The B15 tests cover saturated concurrency, rate-limit errors and slow streams.

### 3.8 Evidence that this is the right shape

Dots: "You can keep talking to your dot while background agents work." Grok Bot: "A direct message from you takes priority over background work and can redirect the current turn." It also names a primary bot as the main point of contact that coordinates the others. [O3, O4, G2, G-bots]

## 4. The node as manager of agent sessions

### 4.1 Operations

| Operation | Effect | Exists |
|---|---|---|
| **Queue** | Runs after what the session is doing and what is already queued | Yes |
| **Steer** | Changes the run going on: it is interrupted and resumes at once in the same agent conversation with the update. Queued messages stay after it. | Yes |
| **Replace** ("stop and send this instead") | Stops the run, drops what is queued, sends this | Yes |
| **Stop** | Stops the run; queued messages are dropped or kept, as asked | Yes |
| Reorder or cancel a queued message | Edits the session's queue. Queue order is stored as explicit positions, separate from `continueFromJobId`, which stays the true resume ancestry. That link is set when a queued job is claimed, under a per-session lock, to the job that actually ran before it. | New |
| Take over a session | The node adopts a session started in the Hub or CLI that no node owns | Partly (unowned sessions are usable) |
| Answer the agent's question | §4.5 | New |
| Hand a session to another node | Changes the session's owner, with the owner's agreement | New |

**How steering works per engine.** No engine is typed into while it runs. Every steer is interrupt-and-resume: the run is stopped and a new run continues the same conversation (`--resume`, `thread/resume` or `session/load`). The update reaches the agent within seconds, and the work done so far is kept. If an engine later offers live input to a running turn, the adapter can use it behind the same operation.

### 4.2 From the chat and from the card

Both paths call the same API, and the node always knows what happened:

- **Chat.** "Tell it to also update the README" makes the conversation lane steer the session in focus: the one most recently active in this thread or mission. If two are equally likely, it asks one short question.
- **Session card.** Shows the status, the current message, the queue (reorder, cancel), a live log tail and buttons for **Steer…**, **Queue…**, **Stop and send…** and **Stop** (keep or drop the queue). These act at once, without a model. The node's work board records the action, so it is never surprised.

### 4.3 Watching runs

A code-only watchdog reads run progress and raises an **attention** event to the conversation lane (not the chat) when:

- there is no progress for a set time (Ensemble's automatic carry-on already retries engines stuck for 10 minutes; the watchdog raises attention after that);
- the same error repeats;
- tokens are spent with no file changes;
- files outside the mission's folder or constraints change;
- the agent asks something the node can answer (§4.5).

The node then decides whether to steer the agent, ask the owner, or leave it alone. The owner hears only when the node decides they need to.

### 4.4 What the owner sees

One session card per session in the thread, updated in place. Opening it shows the agent's transcript and changed files. At the end the node sends the outcome in one message (§3.4).

### 4.5 Answering the agent's questions

Agent questions reach Ensemble through `ask_person` and permission hooks.

- **Questions of fact** ("which branch?", "which folder?", "is dark mode required?"): the node may answer only with a fact stated in the mission (its requirements, its constraints, or the owner's own words in it), quoted with a link to its source. It records "answered by @node from <source>". Memory and inference are not enough.
- **Never answered by the node:** permissions, widening the scope, security, cost, anything destructive, or choices the mission leaves open. These go to the owner. Unanswered questions from one folder are coalesced into a single Needs me item.
- **Permissions** (run a command, write outside the folder) follow the decision policy (plan §10.5). The node does not approve beyond the owner's rules.
- The owner can turn auto-answers off for a node.

## 5. Everything the assistant does, in every space

### 5.1 Parity

A node turn already uses the assistant loop with all Hub tools, playbooks and skills. Make this a contract:

- A test asserts that every assistant tool is available to nodes, apart from the two replaced by session tools.
- Playbook routing and user skills apply to node turns as they do to assistant turns.
- Write policy, Apply and Undo behave the same, attributed to the node acting for its owner.

"Much more" is everything else in this design and in the plan: sessions, missions, own work, device tools, browser, capture, helpers, nodes, crews and rooms.

### 5.2 Every space the owner can open

The assistant stays one space per conversation, which is intended. A node acts for its owner across **every space the owner can open**: their own spaces and spaces shared with them as a member.

- **Explicit target.** Hub tool calls take an optional `space` (id or name). The default is the room's bound space (Part B), then the node's home space.
- **A delegated identity, not a copy of a browser's.** The gateway uses a distinct internal identity: `via = node`, `accountId` = the owner, `userId` = the target space, `access` = the owner's current role there.
  - It is checked again on every tool call and every Apply, so a membership revoked mid-turn takes effect at once.
  - It installs the same request scope a member request gets, so `guestMayUse`, owner-only tools and the private-apps rule apply unchanged.
  - It never passes browser-only gates such as the terminal, space management, sharing or passkeys.
  - A space owner's connected apps stay private to them.
- **Per-space records.** Conversation history, tool receipts, Undo entries and retained results are kept per source space. Revoking access to a space removes them from the node's later context, and Undo is attributed in the right space.
- **Cross-space overview.** A read-only `node_overview` lists tasks assigned to the owner, due items and active runs across all their spaces. That answers "what am I working on?".
- **Audience limits** (Part B §16). In a turn started by someone other than the owner, only the room's shared space is reachable.

## 6. Secrets the model never sees

The owner types the value into a masked card, never the chat. The model gets a reference, `secret://NAME`. The value is then used without passing through any model:

| Use | How the value is applied | Block |
|---|---|---|
| A coding agent's environment (compatibility) | Only the secrets the step names, injected into that run's environment. Output is redacted. | Today; scoped in B7 |
| A command the node runs | `computer_run({ …, secrets: ["NAME"] })` puts them in that command's environment only, inside the sandbox | B9 |
| An API call | `secret_http({ ref, url, … })`: the broker adds authentication on the device; destinations are allow-listed per secret | B12 |
| A website login | The broker fills the field in the Ensemble browser | B11 |
| Entry from a phone | Encrypted in the browser for the device's key; the hosted API relays ciphertext only | B12 |

Honest wording on the card: in compatibility mode a program the agent runs can read the variable. Brokered use avoids that.

## 7. Browsing on the owner's accounts

- **A dedicated Ensemble browser on the owner's computer** (B10), not their everyday Chrome. It is a Playwright Chromium with its own persistent profile, headless by default and shown on screen when the owner needs to act. Signed-in sessions persist across tasks.
- **"On my account"** means the owner signs in once in the Ensemble browser: on the computer (B11), or from the phone through remote takeover (B21). Grok Bot and dots work the same way: their browsers do not inherit the user's own sessions.
- **Do not import cookies from the everyday browser.** It is fragile (cookie encryption differs by operating system) and gives an agent far more than it needs.
- **Sign-in during a task.** The broker or the worker raises `login_required`, the work pauses, the owner signs in by hand or through a saved or secure-form login, and the same step resumes (plan §10.2).

## 8. Screenshots and video of anything

### 8.1 Targets

The **capture service** runs in the local sidecar. It has two callers: the node's device tools and a coding agent's run MCP server (plan §6.1). Linux first, then macOS; Windows later.

| Target | Screenshot | Video | Notes |
|---|---|---|---|
| Web page or `localhost` app | Playwright: viewport, full page or one element; device emulation | Playwright video recording, or frame-stepped (§8.3) | Headless is fine. `computer_run` starts the dev server and waits for its port. |
| **Electron app** | Playwright's Electron support launches the app and screenshots its windows; it can also check the DOM | The same launch can record video | On Linux it runs on a virtual display (§8.2), so the owner's screen is untouched |
| Any other GUI app (GTK, Qt, Tauri, Java, a game) | A virtual display; a single-frame grab of the app's window (found by its process id) | `ffmpeg` recording that display | Software rendering; heavy 3D may be slow (§8.3) |
| The owner's real desktop | Opt-in, later. X11: direct grab. Wayland (Ubuntu's default): the desktop portal asks the user's consent. macOS: needs the Screen Recording permission. | Same | Privacy-sensitive; only on request |
| Terminal | Prefer the transcript (text is better evidence); render to an image when asked | A terminal recording converted to video | |

### 8.2 Virtual displays

For desktop apps on Linux, the sidecar starts a private virtual display (Xvfb) for each capture session, at a chosen resolution (default 1920×1080). It launches the app with that display, captures it, and tears it down afterwards. This:

- works the same under X11 and Wayland desktops, because it is its own X server;
- never takes over or records the owner's real screen;
- runs while the owner uses the computer, and when it is locked or headless.

**Finding the window.** Each virtual display gets a minimal window manager. The app's window is found by process id where the toolkit sets it, otherwise by title or as the only top-level window on that private display. With one app per display, the whole display is a safe fallback. For Electron, Playwright returns the windows directly.

**Cleanup.** Each capture session holds a lease. A janitor in the sidecar ends displays, apps and recordings whose lease expired or whose owner process died, including after a crash. This is part of B19 itself, not of B13.

On macOS there is no comparable virtual display: capture the app's window with the system's screen capture, which needs the Screen Recording permission once. If permission is denied, the node says so once, with the steps to grant it, and falls back to app-internal screenshots where the app has them.

**What works where:**

| | Linux X11 or Wayland desktop | Headless Linux | macOS | Windows |
|---|---|---|---|---|
| Web, `localhost` | Yes | Yes | Yes | Later |
| Electron | Yes (virtual display) | Yes (virtual display) | Yes (window capture) | Later |
| Other GUI apps | Yes (virtual display) | Yes (virtual display) | Window capture, with permission | Later |
| Real desktop | Later, with consent | — | Later, with permission | Later |

### 8.3 Smooth video of animations

Real-time recording drops frames when the computer is busy, especially without a GPU. For animations, record **frame by frame with controlled time**:

1. Freeze time:
   - JavaScript timers and animation frames through Playwright's clock control;
   - CSS animations and transitions by pausing them and **seeking** with the Web Animations API (`document.getAnimations()` and `currentTime`);
   - canvas or WebGL code that reads its own clock, through a small hook the agent adds (`window.__ensembleSeek(t)`).
2. Step one frame (1/60 s), take a screenshot, and repeat.
3. Encode with `ffmpeg` at the requested frame rate, with explicit frame timestamps.

The result is exact and smooth whatever the load. The test checks frame count and timestamps, not that every frame differs (animations have still moments). Real-time recording remains for interactive flows. Animation tools that render video themselves (Remotion, Manim, Blender) attach their own output.

### 8.4 Media pipeline

- `ffmpeg` converts recordings to a format every phone plays, with a poster frame and a short, small preview (WebP or GIF) for the chat.
- **Codecs and licences.** Use the system's `ffmpeg` and its H.264 encoder when present (MP4). Otherwise use a downloaded LGPL build that writes VP9 in WebM, which current phone browsers play. Which builds Ensemble may download is a licensing check before B19 ships.
- Limits: two minutes by default, which the owner can raise; no audio unless asked.
- Delivery goes through B7's evidence upload, with the same rules: an owner-only audience, MIME sniffing, and no credential files. Retention follows the mission, and the owner can delete any item.

**Privacy of what is captured.** A screenshot can show a password, a one-time code, an API key or a private message. Before any capture goes to a model or leaves the computer:

- **Masking at source.** Password and one-time-code fields, and elements the worker or owner marks sensitive, are masked when the screenshot is taken (Playwright's masking). Tabs in a login or takeover state are never captured (B11, B21).
- **A local scan.** Saved secret values are matched, and OCR runs on images and sampled video frames for key-like strings. A hit is blurred where possible; otherwise the capture is held.
- **Sensitive origins.** The owner can mark origins (banking, email) as never captured, or always previewed first.
- **Uncertainty means hold.** A capture that cannot be checked is kept on the computer with a preview card for the owner. It is not sent and not shown to a model.

### 8.5 Confirm before sending

"Once it opens and it works as intended" is checked in code first, then by a model:

1. **Process checks:** the app is still running after a few seconds; a window appeared with the expected title; no crash in its output.
2. **Image checks:** the screenshot is not blank or uniform; the expected text is present (accessibility tree for web and Electron, OCR otherwise).
3. **Functional checks:** for web and Electron, scripted assertions against the acceptance criteria (§8.5 of the plan: checks as code).
4. **A vision judgement** against the acceptance criteria, by a model that accepts images: the verifier's or the node's work model.

Only then does the node send the media, saying what was checked. If a check fails, it is a failed verification, and the repair loop (B2) runs before the owner sees anything.

### 8.6 Setting up the computer

Capture needs a few programs on the computer: Playwright's browsers, `ffmpeg`, Xvfb and a window lookup tool on Linux. `ensemble capture setup` checks for them and installs what it can without administrator rights: Playwright's browsers, and a static `ffmpeg` in Ensemble's data folder. For system packages (`xvfb`), it shows the exact command for the owner to run once. The computer reports `capture` capabilities so a node knows what it can do there.

### 8.7 Worked example: an Electron app on Ubuntu

> "Make me a small Electron app that shows my GitHub notifications. Send me a video when it works."

1. The conversation lane creates a mission: build, verify, deliver a video.
2. A build step goes to the owner's coding agent with the packet (B8). The agent scaffolds, codes and runs `npm start` under a virtual display, using `capture_*` through the run MCP server to look at its own work.
3. A verify step: Playwright launches the Electron app on a virtual display. It checks the window, the DOM and the absence of console errors, then records a 20-second video of the main flow.
4. A failure means a repair attempt and a retest (B2).
5. On pass, the conversation lane sends one message: "Done. The app lists your notifications and refreshes every minute. Checked: window opens, list renders, refresh works, no console errors." With it come the video and a screenshot, plus where the code is.

## 9. The node's own work

The node does work itself when it needs no coding: browsing and research, reading and summarising, writing a report as an Ensemble page or a Markdown file on the computer, checking a site, running a command. That work runs in a **work lane** (§3.1) as a mission step with `executor: self`, using:

- Ensemble's tools (pages, files, tasks, web search, connected apps);
- device tools (B9) and the browser (B10);
- capture (B19), for screenshots in its report.

It produces evidence and an outcome like any other step. Rule of thumb: the node writes, reads, browses and checks; coding agents build.

## 10. Helpers and new nodes

### 10.1 Temporary helpers

| | Today | Proposed |
|---|---|---|
| Talks to | Its parent only | Same |
| Can do | Read-only Ensemble tools | What its parent grants for this work, never more than the parent has: `read`, `computer` (device tools and browser), `sessions` |
| Where the owner sees it | Its own task room | **Inline in the parent's chat**: a collapsible thread under the message where it was made ("@scout, helper of @lead · working · 4 messages"). Open or close it in place. It is read-only for the owner and not in the sidebar. |
| Reports | By mentioning the parent | As a mission step (`executor: helper`): outcome, evidence, summary. The parent speaks to the owner (§3.4). |
| Ends | After 3 quiet days | When its work ends, plus a short grace period. The owner can **Stop**, **Delete**, or **Promote to node**, which keeps its charter and memories. |
| Limits | 4 working per node, 8 per owner | The owner's own settings. The defaults stay, as concurrency limits, not product walls. |

A helper cannot create helpers or nodes unless its parent's owner allows it, which prevents runaway fan-out.

### 10.2 New nodes and crews

`node_create` and `node_create_group` stay. The node proposes a card (name, role, charter, models, which crew) and the owner confirms. The owner can let a node create nodes without asking. New nodes appear in the sidebar.

## 11. Sign-in while browsing

Covered by the plan (§10.2) and blocks B11 (on the computer) and B21 (from the phone). The work lane pauses at `login_required`. The conversation lane tells the owner once, with a **Sign in** card. The work resumes when the broker confirms the signed-in state.

## Part B — Rooms with people and their nodes

The owner's description of rooms was a starting point, open to change. This part keeps its core (each person brings their own nodes, public talk stays human-centred, work on someone's agents needs their consent). It adds what the comparators teach and several ideas of our own. The goal is collaboration that is positive and easy, not a set of walls.

### What the comparators do for groups

| | Grok Bot | ChatGPT dots | Claude Duet |
|---|---|---|---|
| Several people with their own agents in one place | No. Group chats hold one user and their bots (2–6). Bots on a local computer cannot share a group with teammates' shared bots. | No. One dot per person. It can join a Slack or Teams channel; teams of dots are a future direction. | No. One person. |
| A bot the whole team can use | **Shared bots**: each person's chat with it is private. It acts for the person it is answering, on their computer, with their accounts (asking first) and their usage. Collaborators chat; Managers also edit it. | Specialist dots in enterprise plans | No |
| Approvals in a group | Only the person whose message the bot is answering can approve | Through the owner | The owner, later if they are away |
| Sharing private context | Personal memory stays personal; the bot may save team facts and says so | The dot **privately asks what you are comfortable sharing** before it replies in a channel | Not applicable |
| Handing work between people's agents | In a Slack thread, a shared bot can hand work to the asking person's own bots | Not documented | Not applicable |
| Waiting for approvals | Card waits (chat) or expires (background) | Card waits | **Finishes the rest of the task** and brings the approval back later |

[G-shared, G-teams, O-channels, A3]

Nobody offers what is described here: several people, each with their own agents, in one room around a shared workspace. It is a genuine differentiator for Ensemble. The patterns to keep are:

- a bot acts for one person, and only that person approves;
- privately ask before sharing;
- personal memory stays personal, while shared facts are visible and announced;
- non-blocking approvals.

### Our additions

| Idea | What it gives |
|---|---|
| **Work across people goes through the board** | A request for another person's agents becomes a *proposed task* assigned to that person in the shared space, not a side-channel. Status, discussion, evidence and history live where the team already looks (§15). |
| **Interface contracts** | When two people's features meet (an API and its UI), a contract page in the shared space states the interface. Each lead watches it. A change prompts the other side's lead to tell its owner and offer to adapt their code, with approval (§17.3). |
| **Catch-up digest** | When you return to a room, your lead privately gives you a short digest: what changed, what was asked of you, decisions made, results delivered. You need not scroll (§18). |
| **Room decisions log** | Decisions people confirm in the room become entries on a shared page. All nodes read it as shared memory. Personal node memories stay personal (§17). |
| **Trust per collaborator** | Each person decides what their lead may do for each collaborator without asking: answer status, share titles, run a review on request (§15). |
| **Cross-person review** | Akash can ask for Ben's tester to verify his candidate. With Ben's approval, it runs on Ben's computer against Akash's commit and reports through the board. Independent review across teams, on request. |
| **Room steward** (optional, later) | A shared node owned by the room's space, in the style of Grok's shared bots. Anyone can ask it, and it acts for the asker. It keeps meeting notes, the decisions log, the digest and board tidiness. It is a neutral facilitator, not anyone's representative (§17.4). |
| **Away handling** | When a person is away, their lead says so and answers status within its disclosure scope. Work requests wait for the person (§16). |

## 12. Principles

1. **A node always acts for its owner, and only its owner.** Its data access, computer, subscriptions, credits and authority are its owner's in every room. Grok Bot states the same rule for connected accounts: they act as the person the bot is acting for.
2. **Public talk is human↔human or human↔lead.** Nodes never talk to other nodes in public. A lead posts publicly only to answer a person who addressed it, or because its own owner asked it to.
3. **Across people, requests are structured, not chat.** A question to another person's lead is answered within what that lead may disclose. A request for work becomes a private request to the lead's owner.
4. **Every person has a private lane with their own nodes.** Their nodes read the public room. Nothing private crosses into public without the owner.
5. **Shared work lives in a shared Ensemble space.** The room is the conversation; the space is the work.
6. **Four principals, recorded on every turn and mission.** They are distinct and never inferred from each other:

   | Principal | Meaning |
   |---|---|
   | Data authority | Whose access the node uses: always its owner |
   | Billing | Whose credits or subscription pay |
   | Execution device | Whose computer runs it |
   | Approver | Who may approve its decisions |

   A request from someone else spends nothing of yours without your opt-in:
   - status answers are built by code at no model cost (§18);
   - free-form answers to other people use your lead's model only if your trust settings allow it, within a per-room budget you set;
   - work starts only when you accept it.

## 13. Room structure

| Part | Contents |
|---|---|
| **People** | 2–10 people. Each joins with 1–3 of their nodes, exactly one of them their lead. The creator invites; the invitee must pick or create their nodes to join (as today). |
| **Room** tab (public) | People and leads. Messages, replies, peer-request cards and delivered results. |
| **My crew** tab (private, one per person) | The person, all their nodes in the room, and their missions, plan cards, sessions and helpers for this room's work. Their nodes read the Room tab. Nobody else sees it. |
| **Board** tab (optional) | The bound shared space's board for this room (§17) |

**The composer.** In the Room tab, every message, and every reply to a message, has two choices: **Send to everyone** or **Ask my nodes**. The second posts in My crew with a quote of the Room message, so the owner can ask "@builder what does Ben mean here?" without leaving the room. From My crew, **Share to room** posts a result publicly, either as the owner or through their lead.

This replaces today's single timeline with a private toggle. The data model stays close: private messages are already `visibleTo: [owner]`; the tab is a view of them.

## 14. Routing in the Room tab

| Message | Who answers |
|---|---|
| A person, mentioning nobody | Nobody. It is human↔human. Each lead reads it, and if it asks something of its own owner, notes that privately in its owner's My crew as a suggestion, without posting. |
| A person mentions a lead | That lead answers publicly, for its owner and within its disclosure scope (§16). Work requests become peer requests (§15). |
| A person mentions their own non-lead node | Goes to their My crew (private). |
| A person mentions another person's non-lead node | Routed to that person's lead, with a hint that only leads answer in public. |
| `@leads status` | One status card built by code from each person's status card (§18), without a model turn per lead. |
| A lead's message | Wakes nobody. |
| A system card | Wakes nobody. |

Compared with today:

- non-lead nodes no longer answer publicly;
- representatives no longer answer unaddressed messages;
- node mentions no longer wake nodes.

The bot-streak and depth brakes stay as safety nets that should never trip.

## 15. Questions and work across people

A **peer request** is a record, not a chat thread:

```text
PeerRequest
  room, from (person, and their node if relayed), to (person, through their lead)
  kind:     question | work | share
  text, references (tasks, pages, files)
  status:   open → answered | awaiting_owner → approved | declined → done
  mission:  the target owner's mission, when work is approved
  visible:  requester sees status and public answers; target owner sees everything
```

| Kind | Flow |
|---|---|
| **Question** ("Is the billing API ready?") | The target lead answers from its disclosure scope (§16). If the answer needs something private, it asks its owner privately ("Ben asked X. May I share Y?") and then answers, or says it cannot share. |
| **Work** ("Can your node add CSV export?") | It becomes a **proposed task** in the room's shared space, assigned to the target person, with the requester, the ask and its references. With no shared space bound, it is a private card to the target owner instead. Nothing runs without the target owner. Their lead tells them once, privately: who asked, what, which of their nodes would do it, and roughly what it costs. Choices: **Accept** (the task becomes theirs, and they can start it with their nodes now or later), **Edit**, **Decline with a note**, or **Always accept requests like this from this person**. Accepting creates a mission in their My crew with `requestedBy` and `deliverTo: <room>`. The result is attached to the task, and their lead posts it publicly with evidence. |
| **Share** ("send me the screenshot") | Like a question, for an artefact. Sharing a private artefact asks the owner. |
| **Review** ("ask Ben's tester to check my build") | A work request whose subject is the requester's candidate, pinned to an immutable commit or URL. The target owner confirms the exact candidate. On acceptance, the requester grants read access to that commit only. The target's verifier then runs on the target's computer: inside the sandbox, with no secrets, with network limited to what the test needs, and on a clean checkout. It reports pass or fail with evidence on the task. The repair loop stays on the requester's side. |

**Who may propose a task.** A proposed task needs both requester and assignee to be current editors of the room's shared space. Otherwise the request stays a private peer-request card.

**Trust per collaborator.** Each person sets, per collaborator (or for everyone in a room), what their lead may do without asking:

| Setting | Options | Default |
|---|---|---|
| Status | answer · ask me | answer, at the status card's level (§18) |
| Share artefacts from the shared space | answer · ask me | answer |
| Share anything else | ask me · never | ask me |
| Work requests | ask me · accept kinds I choose (for example reviews) | ask me |

These are the owner's choices, not product limits.

The requester's own lead may draft and relay requests: "@my-lead ask Ben's lead whether the API is ready" creates the peer request, attributed to the person. Leads never negotiate with each other in public.

## 16. Disclosure: what a lead may say to other people

Authority follows **where the answer goes**, not who asked. **Every turn whose output goes to the Room tab is room-bound**, even when the lead's own owner asks it in public. Owner-wide access exists only in My crew and the owner's direct chat. For a private answer, the owner asks in My crew and shares the result with **Share to room**, which is their own act.

- Room-bound and owner-wide turns keep separate conversation histories, caches and tool receipts, keyed by room, lane, audience, principal and space.
- A turn can never move its output to a wider audience than it started with.

A room-bound turn is limited by the tool gateway, not by the prompt:

| Context | Reachable |
|---|---|
| The room's public history | Yes |
| The room's bound shared space | Yes, with the owner's role there |
| The owner's status card (§18) | Yes, at the detail level the owner chose |
| Items the owner marked shareable in this room | Yes |
| The room's decisions log (§17.2) | Yes |
| The owner's other spaces, private lanes, memories, missions and computer | **No.** The lead asks its owner privately (one card) |
| Writes anywhere | Held for the owner (as today) |

This removes "the model decided what is safe to reveal" from the trust path. The turn's context window never contains private data, so the model cannot leak it. The owner's trust settings (§15) decide whether something reachable is answered directly or asked about first.

**When the owner is away** (no presence, or a status they set), their lead says so ("Ben is away until 18:00"), answers status within its scope, and leaves work requests for Ben. Following Duet, a question to the owner never blocks the rest of a task: work that does not depend on the answer continues, and the question waits.

## 17. A shared Ensemble space for the room

### 17.1 Binding, access and events

**Binding.** The room's creator binds a space they own, or creates one ("Room space"). People who join the room are offered membership as editors. Accepting is explicit, because members see the space's work (Ensemble's sharing rules).

**What it holds.** Ensemble's existing features: the board with tasks assigned to people (`assigneeAccountId`), pages, diagrams, plots, files and meeting notes, and live presence. Members' agent runs in the space execute on their own computers and are visible to the space, as today.

**Nodes in the space.**

- Each person's nodes act as that person in the space, with their member role. The same route policy applies (§5.2).
- Items a node creates carry the node and the person ("by @builder for Ben").
- The owner's private connected apps never reach the shared space, by Ensemble's rule.

**Events reach the right lead.** The space emits events: a task assigned to a person, a status change, a comment that mentions a person or node, a page edit on a watched page. Each person's lead subscribes for its owner, and code filters and batches the events. Example:

> Akash assigns "CSV export" to Ben.
>
> 1. Ben's lead tells Ben once, in his My crew: "Akash assigned you CSV export. Start it with @builder?"
> 2. Ben says yes. A mission starts in Ben's My crew, on Ben's computer and subscriptions, in the shared space.
> 3. Its result (commit, screenshots, video) is attached to the task, and the task moves to Done.
> 4. Ben's lead posts in the Room: "CSV export is done", with a screenshot and a link to the task.

**How shared is the work.** Accepting a shared task asks one explicit question, because a run in the shared space shows its transcript, code, files and evidence to every member:

| Choice | Run lives in | Members see |
|---|---|---|
| **Private work, shared result** (default) | The assignee's own space | The result, evidence and status the assignee delivers to the task |
| **Shared run** | The shared space | Everything about the run, as Ensemble shows members' runs today |

**Leaving a room** atomically revokes that person's room capabilities, event subscriptions, trust grants given to them, and pending deliveries to them. Membership of the shared space is a separate question asked at the same time. Every event and every result delivery re-checks access at the moment it happens.

### 17.2 Shared memory: the decisions log

Nodes keep personal memories, as today. A room also has a **decisions log**: a page in the shared space. A decision enters it only when a person confirms it: a ✓ on a message, "log this", or accepting a lead's suggestion "Shall I log: the API returns cents, not decimals?". Every member's nodes read it. A node never writes personal facts about its owner into it, and announces each entry it proposes, following Grok's team-memory rule.

### 17.3 Interface contracts

When two people's work meets (an API and the UI that calls it, a schema and its importer), either person can mark a page in the shared space as a **contract**: the interface in prose, types or an example. Leads of people whose tasks link the contract watch it:

1. A change to the contract (a page edit, or a commit touching a linked file) creates one event per watching person.
2. Their lead tells them privately what changed and what it affects in their open work, and offers to adapt it ("Steer @builder to use the new field?").
3. Nothing changes without that person's consent.

This turns the most common cross-team failure, a silent interface drift, into a single, early, actionable message.

### 17.4 The room steward (optional, later)

A node owned by the room's shared space rather than by a person, like a Grok shared bot:

- **Acts for whoever asks it.** It uses that person's role in the space, and their usage and computer if work is needed. Only the asker approves. Its writes never exceed the asker's role.
- **Proactive chores have a sponsor.** The room's creator, or a member who agrees, sponsors them within a budget they set. They are limited to the steward's own pages: notes, the decisions log, digests, and board suggestions that people accept.
- **Keeps the room tidy.** It drafts meeting notes from a call or a thread, keeps the decisions log, writes the catch-up digest (§18), and keeps the board in order: stale tasks, missing owners, duplicates.
- **Speaks only when addressed**, like a lead, and has no private access to anyone.

It is optional because each person's lead can already do most of this for its own owner. It earns its place in rooms of four people or more.

## 18. Awareness: who is working on what

Each person has a **status card** per room, built by code: tasks in the shared space assigned to them and in progress, their missions for this room (titles and status), and presence. The owner chooses how much their lead may share: **nothing**, **titles** (default) or **details**.

Leads answer status questions from it. `@leads status` renders all status cards at once without any model turn.

**Catch-up digest.** When a person opens a room after being away, their lead offers a private digest in My crew, a few lines long:

- what changed in the room and its space;
- what was asked of them, with any proposed tasks waiting;
- decisions logged;
- results delivered by others.

It is built from events, and a model only writes the summary text. It replaces scrolling back through the room.

## 19. Worked example: two people, two features

1. Akash creates a room and invites Ben, with Akash's @lead and @builder, and Ben's @ben-lead and @tester.
2. The room is bound to a new shared space. Akash creates tasks "Billing page" (assigned to Akash) and "CSV export" (assigned to Ben).
3. Each lead tells its owner privately. Each owner starts their missions in their My crew. The missions run on their own computers.
4. In the Room, Ben asks, "@lead is the billing API stable?" Akash's lead answers from the shared task and its own status card.
5. Ben asks, "@lead can your builder add an invoice download too?" That is a work request. It becomes a proposed task "Invoice download", assigned to Akash. Akash's lead tells him privately, and he accepts and starts it with @builder.
6. Akash marks the page "Billing API" as a contract. Later, Akash's builder adds a field. Ben's lead tells Ben privately and offers to steer his builder to use it. Ben agrees.
7. When the invoice download is done, Akash's lead posts in the Room, "Invoice download is ready", with a video and a link to the task.
8. Ben asks for Akash's tester to review his CSV export. Akash's lead asks Akash, who accepts. The review runs on Akash's computer against Ben's commit and attaches a pass with screenshots to Ben's task.
9. Ben is away the next morning. Akash asks "@ben-lead status?" and gets Ben's status card. When Ben returns, his lead gives him a five-line catch-up digest.

Nobody's nodes talked to each other in public. Each person approved work on their own resources. Everything that matters is on the board and the decisions log, not buried in chat.

## 20. Changes needed in Ensemble

| Change | Why |
|---|---|
| Raise the shared-space member limit (2 today) and the contact limit (5) to cover room sizes, as the owner's choice | A room of 10 people needs a space for 10 people. |
| Space events for nodes: task assigned, status changed, mention, watched page edited | §17 |
| Actor attribution "node for person" on items, comments and runs | §17 |
| A node gateway that builds member requests (§5.2) | Every space |
| Room ↔ space binding stored on the room | §17 |
| Peer-request records and cards (questions, shares) | §15 |
| A **proposed** task state with requester, and accept, edit and decline actions for the assignee | §15: work across people goes through the board |
| Page roles "contract" and "decisions log", with watchers | §17.2, §17.3 |
| Nodes owned by a space, acting for whoever asks (the room steward) | §17.4 |

## 21. Risks and open questions

| Risk | Mitigation |
|---|---|
| Prompt injection from another person's message or a shared page | Content from others is information, never authority (plan §10.5). Audience-bound turns (§16). Work always needs the owner. |
| Notification noise in busy rooms | Unaddressed messages wake nobody. Events are batched per person. Status comes from cards, not chatter. |
| One person's runs reveal code to the room | Shared-space runs are visible by design; the mission's `space` constraint makes the choice explicit when the work starts. |
| A lead answering beyond its disclosure | Enforced by the gateway (§16), not prompts. |
| Cost surprises | The four principals (§12) are explicit. Approval cards show the executing node, computer and rough cost. Free-form answers to others use a per-room budget the owner sets. |
| Screenshots leaking private data to a room | Capture masking and scans (§8.4). Evidence keeps its mission's audience; sharing to the room is an explicit act. |
| Two people's builders editing the same repository | Resource claims and worktrees (B13), and integration through the shared task. |
| Proposed tasks used as spam | Only room members can propose. The assignee's trust settings decide what reaches them, and declines are one tap with an optional note. |
| The decisions log drifting from reality | Entries need a person's confirmation; a superseding decision links the old one. |

Open questions for the owner, also in the build blocks' decision table:

1. Should a lead ever answer an unaddressed public question it is sure concerns its owner, or always stay silent (recommended: silent; note it privately)?
2. Default status detail for rooms: titles (recommended) or nothing?
3. Should joining a room imply joining its shared space, or stay a separate choice (recommended: separate, offered at join)?
4. Should work requests always become board tasks (recommended), or may a person turn that off for a room and receive private cards instead?
5. Should rooms get a steward by default from four people upwards, or only on request (recommended: on request)?

## 22. Where this lands in the build order

| Block | Content | Milestone |
|---|---|---|
| B15 | Lanes: always-available conversation, work lanes, one voice, stop path | M2 |
| B16 | Session manager: card controls, queue editing, focus, watchdog, answering agent questions | M2 |
| B17 | Assistant parity and every space | M3 |
| B18 | Helpers that can work, shown inline; node proposals | M3 |
| B19 | Capture: browser, localhost, Electron, any GUI app on a virtual display, frame-stepped animation, media pipeline, setup | M4 |
| B20 | Media in the conversation and confirm-before-send | M4 |
| B21 | Remote browser takeover from the phone or web | M5 |
| C1–C3 | Audience-bound turns, rooms v2, peer requests with trust settings | M7 |
| C4–C6 | Shared space binding and proposed tasks; events, status cards and catch-up digest; results into the room and tasks, cross-person review | M8 |
| C7 | Contracts, the decisions log and the room steward | M9 |

Details, contracts and acceptance tests are in the [build blocks](ensemble-node-build-blocks.md).

## 23. Sources

Fetched 29 October 2026, in addition to the plan's §16.

| ID | Source |
|---|---|
| G-bots | [Grok Bot: create and manage Bots](https://docs.x.ai/grok-bot/bots) (primary Bot as the main point of contact) |
| G-shared | [Grok Bot: shared Bots](https://docs.x.ai/grok-bot/shared-bots) |
| G-teams | [Grok Bot for teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) |
| O-channels | [Dots: channels](https://learn.chatgpt.com/docs/dots/channels) |
| O4 | [Dots: computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) (keep talking while threads run; private sign-in; takeover) |
| A3 | [Get started with Claude Duet](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet) (quiet thread, Tasks tab, finishing work around pending approvals) |
| E28, E29 | Ensemble `docs/28_ENSEMBLE_SPACES.md`, `docs/29_SHARING.md` (spaces, members, shares, runs in a shared space, presence) |
