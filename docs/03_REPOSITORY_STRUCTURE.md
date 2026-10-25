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
│   │       ├── connections/     connected apps, the same list as in Ensemble
│   │       ├── activity/        approvals, runs, turns, computers, credits (mobile)
│   │       └── settings/        account, credits, links to the pages above and to Ensemble, sign out
│   ├── components/
│   │   ├── chat/                room view, message (actions, reactions, replies) and cards, composer, rich text,
│   │   │                        settings drawer (DM, crew, room), search panel, pinned bar and drawer
│   │   ├── shell.tsx            sidebar, layout, auth guard, ⌘K search
│   │   ├── model-picker.tsx     every model a node can use, grouped (included, own keys, AI plans)
│   │   ├── node-picker.tsx      my nodes as checkboxes with a Lead radio
│   │   ├── email-chips.tsx      emails as chips
│   │   ├── invites.tsx          the requests-to-join inbox
│   │   ├── needs-me.tsx         Ensemble's Needs me: run approvals and agents' questions
│   │   ├── activity.tsx, credits.tsx, connect-computer.tsx (computer lists, links to pair one), turnstile.tsx
│   │   ├── node-avatar.tsx      node faces (shape, colour, eyes; breathing while thinking)
│   │   ├── brand.tsx, ui.tsx    mark; buttons, fields, switch, drawer, menus, toasts, External (new-tab links)
│   ├── lib/
│   │   ├── api.ts, config.ts    Ensemble API client (credentials: include), downloads; URLs and links into Ensemble
│   │   ├── environment.ts       testing or production; refuses a build that mixes them (tested)
│   │   ├── hooks.ts             queries, mutations, the event stream
│   │   ├── live.ts              who is thinking / writing right now (text batched per frame, per room)
│   │   ├── jump.ts, toast.ts    open a conversation at a message; short notes on screen
│   │   ├── text.ts, markdown.ts, chat.ts, models.ts, crew.ts, ensemble.ts
│   │   │                        pure helpers (tested): chat filters, reactions, days, search highlights, emails,
│   │   │                        model groups, crew drafts and unique names, Needs me modes, connection status
│   │   └── types.ts             what /api/node/* and the Ensemble routes Node reads send
│   └── public/brand/            Ensemble mark
├── docs/                        these guides; research/; design/pre-v0/
└── .github/                     workflows/test-web.yml (testing: checks, publish node-test),
                                 workflows/ci.yml (checks for main), workflows/deploy.yml and
                                 actions/vercel-deploy (publish main on Vercel)
```

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
