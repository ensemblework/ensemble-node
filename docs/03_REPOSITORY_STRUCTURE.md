# 03 · Repository structure

```
ensemble-node/
├── apps/node-web/               the website (Next.js 15)
│   ├── app/
│   │   ├── page.tsx             landing (signed in → /chat)
│   │   ├── health/route.ts      /health: the commit this build was published from
│   │   ├── login/               sign in / create account (email, providers, Turnstile)
│   │   ├── welcome/             onboarding: verify, account, first node or crew, connect a computer (links to Ensemble)
│   │   └── (app)/               signed-in shell (sidebar, activity panel, live stream, ⌘K search)
│   │       ├── chat/            home: ask a node, requests and approvals banners, your nodes, recent conversations
│   │       ├── r/[roomId]/      a conversation: messages, cards, search, pins, filters, composer
│   │       ├── n/[nodeId]/      a node: look, charter, model, files on my computer, shared-room rule, memory, pause, delete
│   │       ├── new/             create a node, a crew (from suggestions and existing nodes) or a room (with requests to join)
│   │       ├── requests/        requests to join rooms: accept with 1–3 nodes and a lead, or decline
│   │       ├── search/          search every conversation
│   │       ├── computers/       Computers & Needs me: paired computers, shared folders, Ensemble's Needs me
│   │       ├── routines/        routines by node: pause, run now, edit, delete, runs and a run's card
│   │       ├── sessions/        my agent sessions: who manages each, Hand to… / Give to…, a session's panel
│   │       ├── connections/     connected apps, the same list as in Ensemble
│   │       ├── activity/        approvals, runs, turns, computers, credits (mobile)
│   │       └── settings/        account, credits, links to the pages above and to Ensemble, sign out
│   ├── components/
│   │   ├── chat/                room view, message (actions, reactions, replies, tools a reply used) and cards,
│   │   │                        run card and its work log (run-card.tsx, work-log.tsx), the session parts of a run
│   │   │                        card (session.tsx: settings, queue, controls), a worker's report (report.tsx),
│   │   │                        evidence gallery and lightbox (evidence.tsx), captures held for the owner to check
│   │   │                        (held-captures.tsx), a run's live view (live-view.tsx), plan card (plan-card.tsx), helper
│   │   │                        threads (helper-thread.tsx), the "Working on" strip (work-strip.tsx), rooms with
│   │   │                        other people: their cards (room-cards.tsx: a request and its owner's card, a
│   │   │                        disclosure, status cards, a node's proposal) and each person's own side
│   │   │                        (room-people.tsx: the trust sheet, shareable items, away, a new request), the room's
│   │   │                        work (room-board.tsx: the Board; room-work.tsx: the offer to join its space, the one
│   │   │                        question when work starts, the lead's notes, the catch-up, results, decisions;
│   │   │                        room-space.tsx: linking its space, closing my tasks, the steward), composer, attachments
│   │   │                        (attachments.tsx: paperclip menu, Files picker, shelf, drop and paste; also on the
│   │   │                        start page), files on a message (file-chips.tsx), rich text and code blocks
│   │   │                        (code-block.tsx), settings drawer (DM, crew, room), search panel, pinned bar and drawer
│   │   ├── shell.tsx            collapsible recent-chat sidebar, phone sheet, layout, auth guard, ⌘K search
│   │   ├── routines.tsx         routines: the list, the form (schedules in a time zone, events, webhooks),
│   │   │                        a webhook's token shown once, runs and a run's card; a node's routines
│   │   ├── sessions.tsx         sessions: search, each with who manages it and Hand to…, one opened
│   │   ├── model-picker.tsx     every model a node can use, grouped (included, own keys, AI plans)
│   │   ├── node-picker.tsx      my nodes as checkboxes with a Lead radio
│   │   ├── email-chips.tsx      emails as chips
│   │   ├── invites.tsx          the requests-to-join inbox
│   │   ├── needs-me.tsx         Ensemble's Needs me: run approvals and agents' questions
│   │   ├── secret-box.tsx       a node's request for a secret: password box encrypted for the computer, its route and key
│   │   ├── login-box.tsx        a sign-in card: the saved login, signing in on the computer, a login typed and
│   │   │                        encrypted for the computer, opening its browser here, Not now
│   │   ├── takeover-view.tsx    controlling a tab of the computer's browser: the picture, input, Paste, I'm done
│   │   ├── decision-answer.tsx  answering a Needs me card (shared by Needs me and run cards)
│   │   ├── activity.tsx, credits.tsx, connect-computer.tsx (computer lists, what each can capture, links to pair one), turnstile.tsx
│   │   ├── node-avatar.tsx      Node signature faces, shape/colour/eyes and thinking state
│   │   ├── model-logo.tsx       canonical local model/vendor and agent marks
│   │   ├── connector-logo.tsx, tool-icon.tsx
│   │   │                        shared local vendor logos and generic tool fallbacks
│   │   ├── brand.tsx, ui.tsx    mark; buttons, fields, switch, drawer, menus, toasts, External (new-tab links)
│   ├── lib/
│   │   ├── api.ts, config.ts    Ensemble API client (credentials: include), downloads, uploads to Files with
│   │   │                        progress and cancel; URLs and links into Ensemble
│   │   ├── environment.ts       testing or production; refuses a build that mixes them (tested)
│   │   ├── conversations.ts     cross-kind recency, live previews and read/snapshot reconciliation (tested)
│   │   ├── model-brand.ts       actual model/provider signature identity (tested)
│   │   ├── connector-logos.ts   catalog aliases, asset metadata and connector tool identity (tested)
│   │   ├── hooks.ts             queries, mutations, the event stream
│   │   ├── live.ts              who is thinking / writing right now (text batched per frame, per room)
│   │   ├── jump.ts, toast.ts    open a conversation at a message; short notes on screen
│   │   ├── entity-text.ts       node replies name records by title, not id (tested)
│   │   ├── seal.ts, secret.ts   the sealed box (WebCrypto; identical to Ensemble's shared-types seal.ts, checked
│   │   │                        against the same seal-vectors.json) and the secret card's route, words and answer
│   │   ├── login.ts             the sign-in card: how a typed login travels, sealed for the computer, and its words
│   │   ├── takeover.ts, takeover-channel.ts
│   │   │                        a takeover session (secret sealed for the computer, frames, numbered input, end)
│   │   │                        and its channel (WebCrypto; identical to Ensemble's shared-types takeover.ts,
│   │   │                        checked against the same takeover-vectors.json) (tested)
│   │   ├── plan.ts, session.ts, evidence.ts, threads.ts, work.ts, routines.ts, rooms.ts, room-work.ts, trust.ts, cards.ts, captures.ts
│   │   │                        pure helpers (tested): a plan card's statuses, outcomes, held steps, attempts and
│   │   │                        ledger; a session's settings, actions, queue edits and its agent's name and id;
│   │   │                        which evidence shows inline and which only downloads, held and kept files, a
│   │   │                        video's poster, length and shape, why a file could not be read; helper threads, where they
│   │   │                        show and what a helper may do; what is working in a room; a routine's schedule
│   │   │                        presets and cron, the form's checks and what it sends, runs in words, time zones;
│   │   │                        a room's Room and My crew (which tab a message is in, each tab's unread and marker,
│   │   │                        a live reply's tab, Share to room), status cards, away, a peer request's states and
│   │   │                        checks; a room's work (its space, the Board's groups and task words, work modes, page
│   │   │                        roles, the lead's notes, digests, results, decisions);
│   │   │                        a lead's trust settings (defaults, merging, what changed); owner cards in words;
│   │   │                        why a capture is held, a paused live view, a live picture's details, what a
│   │   │                        computer can capture
│   │   ├── text.ts, markdown.ts, chat.ts, models.ts, crew.ts, ensemble.ts, decisions.ts, work-log.ts, attachments.ts
│   │   │                        pure helpers (tested): chat filters, reactions, days, search highlights, emails,
│   │   │                        what a message sends and a retry sends again, the attachment shelf and pasted
│   │   │                        files, who may open a file on a message,
│   │   │                        model groups, crew drafts and unique names, connection status, how a Needs me
│   │   │                        card is answered and which run it belongs to, a run's steps as a work log
│   │   └── types.ts             what /api/node/* and the Ensemble routes Node reads send
│   └── public/
│       ├── brand/              Ensemble mark
│       ├── providers/          canonical model/agent marks, provenance and licence notices
│       └── connectors/         vendor assets, provenance manifest and licence/trademark notice
├── docs/                        these guides; research/; design/pre-v0/
└── .github/                     workflows/test-web.yml (testing: checks, publish node-test),
                                 workflows/ci.yml (checks for main), workflows/deploy.yml and
                                 actions/vercel-deploy (publish main on Vercel)
```

`e2e/chat-ui.mjs` is the isolated local browser fixture for chat navigation, live arrivals and responsive interaction; `e2e/runtime-cards.mjs` is the same for plan, session and work cards, evidence, helper threads and stopping work; `e2e/routines.mjs` for Routines; `e2e/rooms-v2.mjs` for rooms with other people; `e2e/rooms-v3.mjs` for the work of a room with other people; `e2e/needs-me.mjs` for Needs me; `e2e/sessions.mjs` for Sessions; `e2e/captures.mjs` for held captures, a run's live view, posters and what a computer can capture. Usage is in [05](05_UI_AND_UX.md#browser-regression).

## Where a change belongs

| Change | Where |
| --- | --- |
| A screen, a card, styling | `apps/node-web` |
| A pure rule the screens share (filters, names, groups, statuses) | `apps/node-web/lib/*.ts`, with a test next to it |
| What a node can do, routing, approvals, runs, a route, a table | Ensemble: `apps/hub-api/src/node/` (+ Ensemble `docs/35_ENSEMBLE_NODE.md`) |
| A new Hub tool nodes should have | Ensemble's assistant registry: every Hub tool is a node tool too |
| The CLI's Node tab | Ensemble: `apps/cli/src/tui/node.ts`, `app.tsx` |
| Sign-in behaviour | Ensemble: `routes/auth*.ts` (Node only calls them) |
| Hosting, environments, deploys, CI | `.github/workflows/`, `.github/actions/vercel-deploy/`, `apps/node-web/lib/environment.ts`, the Vercel projects ([04](04_DEPLOYMENT_AND_DNS.md)) |
