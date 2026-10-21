# 03 · Repository structure

```
ensemble-node/
├── apps/node-web/               the website (Next.js 15)
│   ├── app/
│   │   ├── page.tsx             landing (signed in → /chat)
│   │   ├── login/               sign in / create account (email, providers, Turnstile)
│   │   ├── welcome/             onboarding: verify, account, first node or crew, connect a computer
│   │   └── (app)/               signed-in shell (sidebar, activity panel, live stream)
│   │       ├── chat/            home: ask a node, your nodes, recent rooms
│   │       ├── r/[roomId]/      a room: messages, cards, composer
│   │       ├── n/[nodeId]/      a node: look, charter, model, shared-room rule, memory, pause, delete
│   │       ├── new/             create a node, a crew or a room
│   │       ├── activity/        approvals, runs, turns, computers, credits (mobile)
│   │       └── settings/        account, credits, computers, links to Ensemble, sign out
│   ├── components/
│   │   ├── chat/                room view, message and cards, composer, rich text, room settings
│   │   ├── shell.tsx            sidebar, layout, auth guard
│   │   ├── activity.tsx, credits.tsx, connect-computer.tsx, turnstile.tsx
│   │   ├── node-avatar.tsx      node faces (shape, colour, eyes; breathing while thinking)
│   │   ├── brand.tsx, ui.tsx
│   ├── lib/
│   │   ├── api.ts, config.ts    Ensemble API client (credentials: include) and URLs
│   │   ├── hooks.ts             queries, mutations, the event stream
│   │   ├── live.ts              who is thinking / writing right now
│   │   ├── text.ts, markdown.ts pure helpers (tested)
│   │   └── types.ts             what /api/node/* sends
│   └── public/brand/            Ensemble mark
├── docs/                        these guides; research/; design/pre-v0/
└── .github/workflows/ci.yml
```

## Where a change belongs

| Change | Where |
| --- | --- |
| A screen, a card, styling | `apps/node-web` |
| What a node can do, routing, approvals, runs, a route, a table | Ensemble: `apps/hub-api/src/node/` (+ Ensemble `docs/35_ENSEMBLE_NODE.md`) |
| A new Hub tool nodes should have | Ensemble's assistant registry: every Hub tool is a node tool too |
| The CLI's Node tab | Ensemble: `apps/cli/src/tui/node.ts`, `app.tsx` |
| Sign-in behaviour | Ensemble: `routes/auth*.ts` (Node only calls them) |
