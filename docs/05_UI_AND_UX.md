# 05 · UI and UX

Chat-first teammates with familiar messenger navigation. Ensemble's flavour is Satin Gold on a near-black petrol night, the Woven Chorus mark, Figtree, and Ensemble's own cards (tasks, runs, approvals).

## Principles

- **Chat first.** Every screen leads back to a conversation. The composer is the biggest control on the page.
- **Recognisable signatures.** Nodes show the actual model's vendor mark, with their own accent colour. Agent runs show the agent's mark. A status halo, not a moving character, indicates thinking; reduced motion keeps it still. Unreported models use Ensemble's neutral identity.
- **What needs you is never buried.** Approvals are owner-only cards in the conversation, mirrored in the Activity panel with a badge.
- **Privacy you can see.** Anything only you can see is marked with a lock and the private (violet) tint: Only‑me messages, drafts, approval cards, error notices, run cards in shared rooms.
- **Honest status.** "Thinking…", the reply being written, tool chips and run states come from the server, never from timers.

## Conversations

| Kind | Who is in it | Made from |
| --- | --- | --- |
| Direct chat (DM) | You and one of your nodes | Every node gets one when it is made |
| Crew | You and nodes you pick (up to 24), one of them the lead | New → Crew |
| Room | You and other people (up to 10, counting open requests), each bringing 1–3 of their own nodes, one of them their lead | New → Room, then requests to join |

## Screens

| Screen | What it has |
| --- | --- |
| Landing `/` | Wordmark, "AI teammates that work on your own computer", a floating cast of nodes, four feature tiles, and a line on accounts: an existing Ensemble account is used as it is (connected apps, computers, trusted folders, credits); signing up on Node creates the Ensemble account. Signed-in visitors go to `/chat`. |
| Sign in `/login` | Provider buttons from `/api/auth/status`, email and password, create account with Turnstile, forgot password → Ensemble. |
| Welcome `/welcome` | Steps: verify (code) → you're in Ensemble (one account, the three apps, shared credits) → first node or a crew suggestion → connect a computer (a sentence and links to Ensemble's pairing page and the download, live detection, open requests to join). |
| Home `/chat` | A start composer with a labelled node selector and attachments (sends to that node's DM, then opens it), requests and approvals banners, compact node cards (signature, name, role and model), recent conversations. |
| Room `/r/:id` | One header on phones, with back-to-chats, a model signature or group icon, clickable conversation name/details, a DM model menu, search and More. More holds author filters, pins, Activity, export and settings. The timeline has day labels, a new-messages divider, honest thinking/writing rows, jump-to-latest with a count, and the composer. |
| Settings drawer | DM: the node's model and a link to its page. Crew: rename, every node with Lead, Make lead and Remove, all your nodes with Add. Room: rename (creator), each person with their nodes (only public fields for other people's), your lead and Make lead, add up to 3 of yours, remove (never your last one: leave instead), "what you handle here", requests to join (creator: invite by email, pending / accepted / declined with "ask again after", Withdraw), leave or delete. Export as Markdown. |
| Node `/n/:id` | Name, accent colour, role and instructions; the model supplies the signature. Model and permissions save as they change: read-only computer access (off by default) and shared-room posting (ask first / post on its own). Memory list, pause/resume and delete. Stored legacy shape/eye values are retained by the API, not offered as inactive controls. |
| New `/new` | Node (template, name, role, model). Crew: name, a suggestion that fills in proposed new nodes (rename, change role and model, remove, "Add a node", "Use your Manager instead"), your existing nodes as checkboxes, one lead across both. Room: name, 1–3 of your nodes and your lead, emails as chips (up to 9), then the result for each email. |
| Requests `/requests` | Requests to join rooms: room, who asked, how many people. Accept → pick 1–3 nodes and a lead; Decline. Live, with a badge in the sidebar. |
| Search `/search`, ⌘K / Ctrl+K | Every conversation, or one (the room's search button). Every word must match; All / People / Nodes. A result opens the conversation at that message, loading earlier pages when needed, and highlights it. |
| Computers & Needs me `/computers` | Ensemble's Needs me: run approvals (Approve / Reject) and questions from agents, answered as on a run card (below); an editor's own multiple-choice questions, and ones someone else must answer, link to Ensemble. Your nodes' approval cards. Paired computers with their shared folders; links to pair one in Ensemble. |
| Connections `/connections` | What is connected in Ensemble (connected as…, needs consent, error, public data only) and what can be connected, with Manage / Connect opening Ensemble. Nodes read everything connected and write only after approval. |
| Activity (panel on wide screens, `/activity` on phones) | Waiting for you, computer runs (open the task in Ensemble), recent turns with credits, computers, credits meter. |
| Settings `/settings` | Account (it is the Ensemble account, used as is), credits, links to Computers & Needs me, Connections, Requests and Search, computers, links to Ensemble's settings, sign out. |

The sidebar is one recent list across direct chats, crews and rooms, sorted by the newest message, including pending sends. All / Unread / Groups and Search chats narrow it without changing server data. Each row keeps its timestamp, preview, typing or private indicator, and unread count. Refused sends are marked Not sent. A DM tooltip names its node's model. New conversation and full message search sit at the top; Your nodes, Invites, Computers & Needs me, Connections and account settings sit below. The Needs me badge includes node proposals as well as computer-run questions; phones retain an attention dot on back-to-chats. Live changes update the preview immediately, not after a bootstrap refetch.

On desktop Collapse conversations becomes a 68 px rail with recent signatures and navigation; Expand restores the 304 px list. `node.sidebar-collapsed` remembers the choice in this browser. The Activity panel is closed initially; its own toggle and `node.activity-open` preference restore it when wanted. Neither preference contains conversation content.

## Model and agent marks

`components/model-logo.tsx` and `lib/model-brand.ts` resolve the actual model first, then a known provider/agent when no model identifies the maker. GPT/Codex, Claude, Gemini, Grok, GitHub Copilot, Cursor and the other supported vendors use local canonical SVGs, shared with the Hub. Model pickers use the same marks as nodes, search results, mentions, settings and run cards; source group icons do not stand in for a model.

`public/providers/manifest.json` and `NOTICE.txt` retain provenance and identification-only trademark notices. The Grok SVG is from LobeHub/lobe-icons under its included MIT licence. A public node exposes no private model choice: without reported model/provider fields it keeps Ensemble's mark rather than guessing. Node names and accent colours distinguish teammates using the same model.

## Connector logos

`ConnectorLogo` and `lib/connector-logos.ts` are the shared brand renderer and resolver. Connections use the catalog API's `logo` key (falling back to its ID for older responses), not the display name. Native connector tools and catalog MCP tool names use the same assets in completed replies, live tool chips and approval cards. Generic Ensemble tools stay generic; `apps_search` does not identify a service, so it keeps its wrench. Custom MCP names, including ones named after a vendor, are never treated as proof of that vendor's identity.

Assets are local under `public/connectors/`, reused from Ensemble's brand library with per-image provenance in `manifest.json` and licences/trademark attribution in `NOTICE.txt`. Wispr Flow and Zotero use real vendor marks rather than the Hub library's older placeholder lettermarks. This does not add integrations: the API catalog still controls what can be connected.

Tiles have fixed dimensions and contained, unmodified aspect ratios. A neutral white backing keeps black and coloured marks readable in both themes; small chat marks use 16 px tiles and connection rows use 36 px. Adjacent connection names make row logos decorative; standalone/tool logos have accessible names. Unknown logos use initials, custom MCP and CSV use explicit generic icons, and failed image loads retain the same tile with an accessible "logo unavailable" fallback. Branding does not replace connection status text, approval controls or tool-failure indicators.

## The model picker

One picker everywhere a model is chosen: new nodes, new nodes in a crew, the node page, and the DM header's model menu. Groups: **Included with Ensemble** (Everyday and Step-up, with relative credits), **Your API keys** (per provider), **Your AI plans on ‹computer›**. The bootstrap carries the included models, so the picker opens at once; own keys and AI plans come from `/api/node/models` when it opens. A filter box appears for long lists, and the server's problems show at the bottom.

## Attachments

Both composers (a conversation's and the start page's) take files (`components/chat/attachments.tsx`, rules in `lib/attachments.ts`):

- **Adding:** the paperclip opens **Upload from this computer** and **Choose from Files**. Files can also be dropped on the composer (it shows "Drop to attach" while files are held over it; a file dropped elsewhere on the page is ignored, so the draft is never lost) or pasted. A picture that comes with copied rich text (the clipboard also has HTML with text in it, or RTF, as Word, Excel and web pages add) is ignored; a pasted screenshot is named "Pasted image ‹date› ‹time›".
- **Upload:** a file from the computer goes to the person's Ensemble Files at once (`POST /api/documents`, `summarize: false`) with real progress, before the message is sent. A file larger than the server keeps (`usage.maxFileBytes` from `GET /api/documents`: 25 MB on the hosted plan) is refused before it is read; any other refusal (a program, an empty file, quota) shows the server's own words.
- **Choose from Files:** the person's Files, newest first, searchable by name (`GET /api/documents?q=`). Each row shows kind, size and the date and time it was added, so files with the same name can be told apart. Picking one attaches it without uploading again; picking it again takes it off.
- **The shelf** above the text box has a chip per file: a thumbnail for pictures from the computer (a local preview), name, size, and while uploading the percentage, a progress bar and **Cancel**. Ready files have **Remove** (the file stays in Files). A failed upload shows why, with **Retry** and **Remove**. Up to 8 files per message; the same file is not added twice; a note says what was left out.
- **Sending** waits while a file uploads or after one failed, and says so next to the paperclip. A message may be files only. The paperclip's hint says who can read them: in a DM or crew, the nodes read the text of documents and see pictures when their model reads images; in a room with other people, nodes read files only from their own owner's messages, and others see a file's name but cannot open it.

## Messages and cards

- **Your messages** sit on the right in a gold-tinted bubble; Only‑me ones are violet with a lock.
- **Node messages** sit on the left with the model signature and node's name; someone else's node retains its owner label. Repeated handles are omitted from message headers. Markdown subset: headings, lists, code, quotes, bold, links (bare and `[label](address)`); known `@handles` are highlighted.
- **Records by title.** A node names Ensemble records by title, never by id (`lib/entity-text.ts`, the same rules as Ensemble's [docs/11 §4.1](https://github.com/ensemblework/ensemble/blob/main/docs/11_HOW_THE_ASSISTANT_WORKS.md#41-records-by-title-ids-for-machines)). A record link (`[@Draft brief](ensemble://task/…)`) shows its label and opens the record in Ensemble; a room opens here. A bare id of a record the message names (its `data.refs` and its tool chips' `refs`) shows as that record's title, linked; records with the same title get their kind, due date or a number. Unknown ids, code, quotes and links stay as written, ids stay when someone in the turn asked for them (`data.showIds`), and what people write is never changed. Conversation previews, pins, reply quotes and Copy read the same way (`readableBody`). Text being written holds back a half-written id, using the turn's `refs` frame and its tool calls.
- **Code blocks** show the fence's language and a copy button above the code, which scrolls sideways instead of wrapping, also on a phone (`components/chat/code-block.tsx`).
- **Message actions** appear on hover or focus, or after a long press on a phone: react (the eight reactions), reply, copy, pin or unpin (only messages everyone in the room can read), delete (your own). Reactions show under the message with counts; yours are highlighted and the tooltip names who reacted.
- **Replies** quote the original above the message; the quote goes to it. While you reply to a private message, the composer is Only me.
- **Deleted messages** read "Message deleted".
- **Files on a message** (`components/chat/file-chips.tsx`) sit under its words as chips with kind, name and size. Your own link to the file in Ensemble's Files (`/files/:id`, new tab), and your pictures show a thumbnail read with your session (`GET /api/documents/:id/original`) once the chip is near the screen. Someone else's show only the name, kind and size with a lock; the tooltip says only that person can open it and your nodes see its name only. A message with only files previews as "📎 name" or "📎 3 files" in lists, pins and quotes.
- **Not sent:** a message the server refused stays with its reason, **Retry** (the same words, files and clientId, so nothing is uploaded again and the server keeps one copy) and **Edit** (back into the composer with its files, and its reply when that message is loaded).
- **Tools a reply used** fold into one line under it, "Used 4 tools · Search tasks, Read page, Assign to agent +1 · 1 failed", which opens into the tool chips: what the node did in Ensemble ("Create tasks · Added “Draft brief”."), each linking to the item in the Hub. A reply that used one tool shows that chip alone. They are shown only where nobody else reads.
- **Approval card** (owner-only): "@node wants to do this for you" with each held call as Ensemble describes it, by record titles, keeping its line breaks (pick some with checkboxes when there are several) → Approve / Discard; or "Post this in “Launch” for you?" with an editable draft → Post / Discard. States: Waiting for you, Applying…, Approved, Partly applied, Posted, Discarded; errors keep the card pending.
- **Run card** (`components/chat/run-card.tsx`): a run on your computer, shown like a coding agent's own app.
  - **Status line:** task title, status pill and, while it runs, **Stop** (after a confirm; only for the person whose computer runs it). Under it the engine (Claude Code, Codex, Cursor, GitHub Copilot and Ensemble's other engines, or Ensemble's agent), the model, the thinking level, the computer and the time so far, ticking while it runs. Then the latest progress line.
  - **Needs you:** the run's own cards from Ensemble's Needs me (`detail.jobId` is this run) and its run approvals, one at a time ("1 of 2"). A permission shows its command with Allow once and Deny, plus Allow for this run when the run is not on a paired computer (a paired computer takes answers from the web once only, and a push is confirmed each time). A question shows its options with the recommended one marked, a box for your own answer when the agent allows one, and "Skip, let the agent decide". Risky ones ask to confirm first; ones that only that computer may approve offer Deny here. The same answers work on the Computers & Needs me page (`components/decision-answer.tsx`). "Answer it in Needs me" shows only when the run waits on something not listed here.
  - **Work log:** "Working · 23 tool calls" (or "Worked for 4m 20s") opens the engine's trace (`components/chat/work-log.tsx`, `lib/work-log.ts`). Consecutive tool calls fold into one line ("Read 1 file, ran 2 commands, edited 1 file") with their time and failures; the group the run is working in stays open. Each call has an icon for its kind (command, edit, read, search, web, MCP tool, question, subagent, thinking), its command in monospace or its target, its duration, and a red mark when it failed; it opens to the command (with copy), the lines removed and added, the input and the output. Thinking stays folded to its first line. The engine's own messages and milestones (asked you, restarted, decided on its own) sit between groups. The newest 12 items show first; "Show earlier" adds 30 at a time.
  - Then the files the run changed with +/− counts, the summary (Markdown) or the error, and "Open the task in Ensemble".
- **System lines** (joined, left, brakes) are centred and muted.

## Live behaviour

One EventSource per tab (`/api/node/events`, with credentials). `node.message` / `node.message.updated` merge into every loaded list by id or clientId and update the sidebar preview immediately. Reactions and old edits do not move a conversation or increment unread counts. `node.status` drives the status halo and typing preview. `node.frame` (owner only) streams text, tool names and known records (`refs`); `lib/live.ts` buffers text once per animation frame for that room, while sidebar busy state changes only at start/stop. `node.room` refreshes the list and pins; `node.invite` refreshes invites; `node.needs` re-reads pending cards immediately (60-second poll fallback).

The timeline follows new messages and resized/streaming content only while already at the bottom. Reading earlier work keeps its position and offers a counted jump-to-latest. Older-page loads preserve the anchor. Pending sends and their confirmed copies share the same clientId render key, avoiding duplicate bubbles or repeated entrance animations. Only new arrivals get a short entrance, disabled with reduced motion.

Unsent text and its Only me state survive switching conversations in tab memory, scoped by account and room; they are not written to browser storage. Attachments and reply targets are not part of these text drafts. Read updates are debounced per room, so switching chats cannot cancel the previous room's update. Bootstrap refreshes preserve newer live previews and read markers; failed read writes restore the prior marker and report an error.

Run cards read the job when visible and every 2.5 seconds while active and visible/open; trace steps load only while the work log is open. Ended runs are read once. A changed run message refreshes both immediately. Reconnects refresh open messages and Needs me, retaining earlier pages.

## Links

Links that leave Node (Ensemble, ensemblework.com, vendors, links in messages) open in a new tab; a link to a room opens here. Sign-in with a provider stays in the same tab, because it returns to Node.

## Responsive and installable

Phones open Chats as a left sheet; selecting a conversation closes it and opens that group's timeline, not a separate form. A conversation uses one header with back-to-chats; other pages retain the global menu/Search/Activity bar. From 768 px the collapsible sidebar is fixed; from 1024 px Activity can be opened on the right. Drawers trap keyboard focus, close on Escape/backdrop and restore the opener. The web manifest makes it installable to a Home Screen (start URL `/chat`). `public/sw.js` is ready for web push (v1).

The conversation scrolls independently of its header and composer. On phones the shell and drawers follow the visual viewport when the keyboard opens; the composer includes the bottom safe area. Form fields use at least 16 px text to avoid Safari's focus zoom. Long names, model/computer metadata, answers and message text wrap within their cards, while fenced code and tool output retain their own horizontal scrolling. The model menu stays inside the phone viewport. Drawers scroll their own content and keep Close in a sticky header.

`InfoTip` makes longer model/permission explanations available on hover, focus or tap, without permanent paragraphs. Errors, privacy labels and approval controls stay visible.

## Browser regression

`e2e/chat-ui.mjs` runs a stateful local API/SSE fixture, never a hosted account or model. Start `pnpm dev` on an unused port, then run it with `NODE_WEB`, `CHROME_PATH` and, when Playwright is supplied externally, `PLAYWRIGHT_MODULE` (the absolute module entry). `NODE_CHAT_SHOTS` optionally saves evidence outside the repository. It exercises five widths, dark/light themes, cross-kind recency, rail persistence, group opening, streaming/scroll anchoring, optimistic sends and private text-draft restoration.

## The testing website

`node-test.ensemblework.com` looks the same, with a **Testing** label next to the wordmark (`components/brand.tsx`), "Ensemble Node Testing" as the page title and installed app name, and a no-index robots tag (`lib/config.ts`, `NEXT_PUBLIC_ENSEMBLE_NODE_ENV=testing`). Its links into Ensemble open the testing Hub, "Download Ensemble" opens the testing CLI's `cli-testing-latest` release, and the computer commands it shows name the testing CLI (`ensemble-test browse on`; `CLI_COMMAND` and `ENSEMBLE_LINKS` in `lib/config.ts`). Its accounts are the testing Ensemble's ([04](04_DEPLOYMENT_AND_DNS.md#hosting-data-and-accounts)).
