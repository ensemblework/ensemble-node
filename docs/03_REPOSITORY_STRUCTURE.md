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
│   │       ├── connections/     connected apps, the same list as in Ensemble
│   │       ├── activity/        approvals, runs, turns, computers, credits (mobile)
│   │       └── settings/        account, credits, links to the pages above and to Ensemble, sign out
│   ├── components/
│   │   ├── chat/                room view, message (actions, reactions, replies, tools a reply used) and cards,
│   │   │                        run card and its work log (run-card.tsx, work-log.tsx), the session parts of a run
│   │   │                        card (session.tsx: settings, queue, controls), a worker's report (report.tsx),
│   │   │                        evidence gallery and lightbox (evidence.tsx), plan card (plan-card.tsx), helper
│   │   │                        threads (helper-thread.tsx), the "Working on" strip (work-strip.tsx), composer, attachments
│   │   │                        (attachments.tsx: paperclip menu, Files picker, shelf, drop and paste; also on the
│   │   │                        start page), files on a message (file-chips.tsx), rich text and code blocks
│   │   │                        (code-block.tsx), settings drawer (DM, crew, room), search panel, pinned bar and drawer
│   │   ├── shell.tsx            collapsible recent-chat sidebar, phone sheet, layout, auth guard, ⌘K search
│   │   ├── routines.tsx         routines: the list, the form (schedules in a time zone, events, webhooks),
│   │   │                        a webhook's token shown once, runs and a run's card; a node's routines
│   │   ├── model-picker.tsx     every model a node can use, grouped (included, own keys, AI plans)
│   │   ├── node-picker.tsx      my nodes as checkboxes with a Lead radio
│   │   ├── email-chips.tsx      emails as chips
│   │   ├── invites.tsx          the requests-to-join inbox
│   │   ├── needs-me.tsx         Ensemble's Needs me: run approvals and agents' questions
│   │   ├── secret-box.tsx       a node's request for a secret: password box sent straight to the computer
│   │   ├── decision-answer.tsx  answering a Needs me card (shared by Needs me and run cards)
│   │   ├── activity.tsx, credits.tsx, connect-computer.tsx (computer lists, links to pair one), turnstile.tsx
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
│   │   ├── plan.ts, session.ts, evidence.ts, threads.ts, work.ts, routines.ts
│   │   │                        pure helpers (tested): a plan card's statuses, outcomes, held steps, attempts and
│   │   │                        ledger; a session's settings, actions, queue edits and its agent's name and id;
│   │   │                        which evidence shows inline and which only downloads; helper threads, where they
│   │   │                        show and what a helper may do; what is working in a room; a routine's schedule
│   │   │                        presets and cron, the form's checks and what it sends, runs in words, time zones
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

`e2e/chat-ui.mjs` is the isolated local browser fixture for chat navigation, live arrivals and responsive interaction; `e2e/runtime-cards.mjs` is the same for plan, session and work cards, evidence, helper threads and stopping work; `e2e/routines.mjs` for Routines. Usage is in [05](05_UI_AND_UX.md#browser-regression).

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
