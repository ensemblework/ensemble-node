# Research: xAI Grok Bot (snapshot 19 Oct 2026)

> Research snapshot gathered for Ensemble Node planning on 19 Oct 2026 from xAI/Cursor documentation and press. Product details change quickly; re-check the cited pages before relying on a number. Sections 1–13 are condensed; section 14 and the feature checklist are complete. Comparison and decisions: [../06_CAPABILITIES_AND_ROADMAP.md](../06_CAPABILITIES_AND_ROADMAP.md).

## 1. Core concept
- **Bot** = persistent named teammate: job desc, memory, own conversation, avatar [ov]. Beta launched **Aug 11, 2026** [intro] ([TheNextWeb](https://thenextweb.com/news/spacexai-grok-bot-ai-agents-cursor)); codename **"Sand"** [tnw2].
- Runs on **Cursor's** cloud; parent self-refers as **"SpaceXSI"**; press report SpaceX's $60B Cursor/Anysphere deal closed ~Aug 2026 — consistent across sources, not independently verified by me [tc][ov].
- **"Chief of staff"** = a usage pattern, not a distinct feature [intro].

## 2. Compute model
- **One cloud computer per user** (not per bot); **Firecracker microVM** isolates users [ov][secfaq]. Within an account, bots share files/logins/browser — "personalities and workspaces, not compute" [tae].
- **Local execution** (own Mac/PC): opt-in desktop toggle to run/read/move files locally. Tri-state **Ask every time**(default)/**Always allow**/**Never allow**, global or per-computer; per-command approval persists even when "allowed"; admin-cappable [apsp][sec][tae].
- **Route egress through desktop**: toggle sends the *cloud* computer's traffic via the user's desktop IP (not reverse); per-desktop; stops in 5 min if Enterprise disables **Allow Local Egress Routing**(default on); separate from the Team-Setup VPN-client path ([settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications); [private-networks](https://docs.x.ai/grok-bot/private-networks))[tae].
- No on-prem/BYO-image; US-only hosting; shared static egress IPs [sec].

## 3. Models / subagents / Cloud Agent
- No model picker — "Cursor manages model selection… no fixed vendor set guaranteed" [sec]. Default pool: **Grok 4.7/4.6/4.5 + Composer 2.5** [lcp][tp]. Grok 4.7 = flagship, 500k ctx, **May 2026** cutoff ([developers/models](https://docs.x.ai/developers/models)).
- Reasoning/non-reasoning Grok 4.20 + **grok-4.20-multi-agent-0309** ("agents collaborate in parallel…deep research") exist but **not confirmed** to power Grok Bot ([model page](https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309)).
- Auto Review reviews **"delegation such as Cloud Agent and subagent launches"** — confirms native subagents [sec]. Platform pattern: parent→subagents w/ isolated context, **fg/bg** modes; built-ins **Explore**(faster model, parallel search), **Browser**(MCP, filters DOM) ([cursor.com/docs/subagents](https://cursor.com/docs/subagents)).
- **Cursor Router**("Auto"): classifies requests, simple→fast/cheap, complex→frontier; modes **Cost/Balance/Intelligence**; **Grok 4.6 required enabled** as cost-efficient backbone ([cursor-router](https://cursor.com/docs/cursor-router)).
- Heaviest escalation: Bot can hand a whole coding task to a separate **Cloud Agent** VM (opens PRs) — distinct from in-context subagents [tae][fr].

## 4. Multi-bot mechanics
- **Unaddressed msgs**: participating bots self-select who responds (no forced all-reply); `@bot`/**Reply** routes to one specifically [cc].
- **Bot-to-bot hand-off**: async msg, receiver wakes/handles/replies later, visible to human; used for owner-splits, specialist review, blockers, unattended work [cc]. Admin switch **"Messaging Between Bots"**(default on) disables it team-wide.
- **Group exclusions**: approvals, secret/login requests, email/Slack drafts never appear in-group (1:1 only); bot→bot hand-offs in-group are text-only [cc].
- **Team Bots**: one shared bot, private per-teammate convo+memory; owner edits shared plugins/secrets/skills/files instantly for all; bot acts **as the signed-in teammate** (never lends access); own Slack handle; **"Publish to Team"** offers Copy vs. Start-fresh [tb].

## 5. Memory & Skills
- Per-bot memory = stable prefs/facts/summaries, **not authoritative** — re-check sources for consequential calls ([bots](https://docs.x.ai/grok-bot/bots))[ov]. Isolated per bot by default; shared files/sessions/hand-offs bridge bots; Team Bots add team-memory + private notes [tb].
- **Skill fields**: when to use it, inputs/access, steps, validation, output, approval needs [sra]. One private-skill library across a user's own bots (`/`-ref'd); also installable as packaged skills from the marketplace.
- **Teach-by-demonstration**: records visible screen only (no mic), **≤10 min**, yields a *draft* skill needing added rules/approvals; staged rollout [sra].

## 6. Routines & triggers
- Up to **50 routines/bot**; **20 run records**/routine; schedules **≥5 min apart**; delete immediate/no undo [sra]. New routine waits for next slot; **Test** acts for real now [rt].
- Triggers: Slack (mention/phrase/reaction/any-msg; channel or all), inbound email (sender/domain allow-list, not subject-filterable, needs auth-pass), GitHub, Linear, Sentry, PagerDuty, webhook (own URL+key) [rt][ae].
- Broad triggers = top cause of fast usage burn; idle routine spends nothing [rt]. Auto-pause after long inactivity [sra].

## 7. Human-in-the-loop
- Approval card shows proposed op+inputs: **Allow once/Always allow/Deny**, same on iPhone [apsp]. **Auto Review** = independent model gate over shell/connector calls, computer use, automation *writes*, Cloud/subagent delegation — **excludes** memory writes & most settings [sec][secfaq].
- Rules: **Ask first**(always stops) vs **Allow automatically**(proceeds unless flagged); Ask-first wins; Enterprise can lock team rules, personal rules only tighten further [sec].
- Unattended-work approvals (routine/trigger/bot msg) expire **~10 min** → "Expired"; chat approvals wait indefinitely [apsp].
- **Take-over**: **Take over/Take control** → user completes password/2FA/CAPTCHA/payment in the live browser → **"I'm done"** returns control; masked secret card hides values from transcript/model [apsp].
- Mid-task message redirects the turn; **"Stop now"** halts immediately, doesn't undo completed actions [cc].

## 8–10, 12. Integrations/Clients/Outputs/Admin
- See checklist for connectors/MCP/channels/OS/admin. New numbers: attachments ≤**6/msg**, **25MB** img/doc/audio, **200MB** video [fr]; agent email ≤**50 recipients**, ≤**10 attach**(10MB ea/25MB tot) [ae]; OS min iOS18+/Android9+ ([mobile](https://docs.x.ai/grok-bot/mobile)).

## 11. Pricing & usage
- **X Subscription**: Free $0 · Plus $8/mo · **Premium $30/mo**(4×) · **Super $100/mo**(15×) · **Ultra $200/mo**(50×); Bot on **Premium+ only**; Teams = same per-seat, mixable ([x-subscription/pricing](https://docs.x.ai/x-subscription/pricing))[tc][tp].
- Shared **weekly** pool (Grok chat/Imagine/Voice/Bot+Cursor); 3rd-party models billed separately ([usage-limits](https://docs.x.ai/x-subscription/usage-limits)). Trial = **usage credit** (steps+tokens, not msgs), also 7-day boxed ([plans](https://cursor.com/help/grok-bot/plans)).
- Legacy map: Pro$20→Premium$30; Pro+$60→Super$100; Ultra$200→Ultra$200; Teams Std$40/u→Premium-seat$30; Teams Prem$120/u→Super-seat$100 [lcp].
- SuperGrok link = usage **grant**, non-stacking; tier-equiv only: Pro=SuperGrok=XPremium+(low)/Pro+=SG Plus/Ultra=SG Heavy(high) — **no official standalone SuperGrok price found** ([supergrok](https://cursor.com/help/grok-bot/supergrok)).
- **Cursor Token Rate** = flat **$0.25/M tokens**, 3rd-party-models only [tp]. Launch-day: macOS+iOS only, Enterprise waitlisted [intro].

## 13. Limitations & failure modes
- Self-disclosed: "no fixed vendor set guaranteed"; no per-bot boundary within an account; model-allowlist "not guaranteed"; injection defenses "reduce, not eliminate"; no dedicated egress-IP/on-prem/PIT-restore [sec][secfaq].
- Bugs: Zoom broken (err 4700); SharePoint app-level perms broken (AADSTS50011, use delegated) ([connect-plugins](https://cursor.com/help/grok-bot/connect-plugins)).
- ⚠ Sibling CLI **Grok Build** caught uploading entire git repos+secrets to GCS (~27,800× excess), despite "zero transmission" marketing (researcher "Cereblab"); Musk promised deletion, unaudited ([The Verge](https://www.theverge.com/ai-artificial-intelligence/965600/spacexai-grok-build-repository-upload)) — diff. product, trust-context only. Broader brand: EU called X-data training "very likely" unlawful; ~¼ of EU firms reportedly banned Grok [tnw3].
- ⚠ Cursor's neutrality pledge vs. post-acquisition single-vendor incentive, "no contractual weight once merger closes" [tnw2]. Rivals named: **Claude Cowork**(Anthropic), **ChatGPT Work**(OpenAI/GPT-5.6) [tnw2].
- ⚠ deeperinsights.com: **8.0/10**; multi-bot coord. "inconsistent" at scale; "thin safety docs" ([review](https://deeperinsights.com/ai-review/grok-bot-review/)). composio.dev: real confusion vs. Grok Build/plain-Grok plugins ([list](https://composio.dev/content/best-grok-bot-plugins)).

**References:** [ov]=[overview](https://docs.x.ai/grok-bot/overview) · [sec]=[security](https://docs.x.ai/grok-bot/security) · [secfaq]=[security-faq](https://docs.x.ai/grok-bot/security-faq) · [tae]=[teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) · [apsp]=[approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) · [cc]=[chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) · [sra]=[skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) · [tb]=[team-bots](https://docs.x.ai/grok-bot/team-bots) · [fr]=[files-and-results](https://docs.x.ai/grok-bot/files-and-results) · [lcp]=[legacy-cursor-plans](https://cursor.com/docs/account/pricing/legacy-cursor-plans) · [tp]=[teams/pricing](https://cursor.com/docs/account/teams/pricing) · [ae]=[agent-email](https://cursor.com/help/grok-bot/agent-email) · [rt]=[routines](https://cursor.com/help/grok-bot/routines) · [intro]=[introducing-grok-bot](https://x.ai/news/introducing-grok-bot) · [tnw2]=[TheNextWeb/Sand](https://thenextweb.com/news/cursor-sand-ai-agent-claude-cowork-rival) · [tnw3]=[TheNextWeb/GrokBuild](https://thenextweb.com/news/grok-build-uploaded-entire-git-repositories-secrets) · [tc]=[TechCrunch](https://techcrunch.com/2026/10/13/spacexsi-bundles-x-premium-grok-and-cursor-into-one-subscription/)
---

## 14. UX notes (onboarding, creation flow, templates, avatars, naming) — *continued*

- **Onboarding flow**: sign in with Cursor account (SSO-aware) → short intro to Bots/shared computer/routines → app asks which tools you use (shapes suggestions only, connects nothing automatically) → background computer setup → **"Meet a future teammate"** screen suggesting a first Bot ([docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started); [cursor.com/help/grok-bot/onboarding](https://cursor.com/help/grok-bot/onboarding)). New users land on a default Bot literally named **"Grok Bot"** before creating any of their own ([cursor.com/help/grok-bot/onboarding](https://cursor.com/help/grok-bot/onboarding)).
- **Bot creation flow**: **New → Create new Bot** (or `Cmd/Ctrl+N`), or type a name first and choose **"Create '<name>' Bot."** The app creates a Bot named **"New Bot"** and opens its chat immediately; the user then opens the Bot menu / clicks its name to set **name, label, description, and avatar** via **Edit Profile** ([docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots); [cursor.com/help/grok-bot/edit-bot](https://cursor.com/help/grok-bot/edit-bot)). xAI explicitly recommends **narrow, single-purpose Bots** over one catch-all assistant — "Focused Bots build more useful context than one catch-all Bot" — and even has existing Bots *suggest* spinning off a new focused Bot when a job should have a long-lived owner ([docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)).
- **Recommended first-task structure** (explicitly documented prompt-engineering guidance for new users): state the **Outcome**, **Sources** (apps/sites/files/conversations), **Constraints** (what to avoid / when to ask), **Deliverable**, and **Review point** ([docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)).
- **Templates / role gallery**: the **"Meet a future teammate"** onboarding screen and the **Marketplace** sidebar section both surface pre-built/shareable Bot configurations; xAI's own **use-cases** doc effectively doubles as a role gallery with eight named starter roles and ready-to-adapt prompts: **Sales Outbound, Talent Scout, Paid Media, Expense Manager, Product Performance, Bug Reproduction, Account Health, Chief of Staff** ([docs.x.ai/grok-bot/use-cases](https://docs.x.ai/grok-bot/use-cases)). mem0.ai's secondary hands-on account separately describes being offered "a feedback-clustering Bot, an overnight Bot that preps your morning digest, or an inbox-triage Bot" as suggested templates during setup ([mem0.ai/library/llms-and-models/grok-bot-guide](https://mem0.ai/library/llms-and-models/grok-bot-guide)) — consistent with, but not identical wording to, the official use-cases list, so treat the exact template roster as illustrative rather than exhaustive/official.
- **Avatars**: three creation modes — stock **"Bot"** character shapes/colors, text-to-image **"Generate,"** or **"Upload"** a custom image (<25 MB) — accessible from the Bot's detail pane or (on mobile) **Select from Gallery / Generate / Remove Photo** ([cursor.com/help/grok-bot/edit-bot](https://cursor.com/help/grok-bot/edit-bot)).
- **Naming constraints**: documented specifically for the **agent-email** feature (lowercase letters/digits/dots/hyphens/underscores, must start/end alphanumeric, ≤64 characters, reserved words like `support`/`admin`/`billing`/`security`/`help`/`info`/`team`/`cursor`/`grok`/`xai` disallowed, globally unique and permanent) ([cursor.com/help/grok-bot/agent-email](https://cursor.com/help/grok-bot/agent-email)); general Bot *names* have no documented format restriction beyond being freely editable text.
- **Organization UX**: sidebar **sections** to group Bots by project/client/business (drag/right-click **Move to new section**, rename sections; syncs between desktop and iOS v1.2.0+); **Pin** keeps active Bots at top; **Hide from sidebar** / **Hidden Bots** list removes clutter without deleting history or pausing routines; right-click menu also offers **Mark as Unread**, **Rename Bot**, **Copy conversation ID**, and **Delete** ([cursor.com/help/grok-bot/how-to](https://cursor.com/help/grok-bot/how-to); [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)).
- **Duplicate** vs. **Share as template** vs. **Team Bot** are three distinct, clearly-differentiated copy mechanisms (see §4–5) — the docs invest real effort in explaining what each does and doesn't carry over (config vs. memory vs. computer/logins) ([docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots); [docs.x.ai/grok-bot/team-bots](https://docs.x.ai/grok-bot/team-bots)).
- **Conversational, no workflow-builder UI**: a recurring, explicit marketing/docs theme — "Other AI tools may ask you to set up and build workflows and routines first. With Grok Bot, simply message a Bot to take on a task and it gets it done" — positioned as the core UX differentiator versus automation-builder competitors ([x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)). Even routines/skills are created by *asking* the Bot in plain language rather than through a form-based builder ([cursor.com/help/grok-bot/routines](https://cursor.com/help/grok-bot/routines)).
- **Voice as a first-class input**: dictation (`Cmd/Ctrl+D` on desktop, "Start dictation" on mobile), live two-way **voice chat**, and the Bot can reply with a **voice memo** (playable, with an expandable transcript) ([docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration); [docs.x.ai/grok-bot/mobile](https://docs.x.ai/grok-bot/mobile)).
- **Multi-account support** on desktop: **Switch account** / **Add account** from the account menu, with Settings listing every saved account ([docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)).
- **Personalization**: Appearance (**Follow System / Light / Dark**) and **Language** (20+ languages including English, Spanish, French, German, Japanese, Korean, Simplified/Traditional Chinese; mobile's list is shorter than desktop's) ([docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)).

---

## Feature checklist

*(Flat list, one capability per line, for a competitor feature matrix. "⚠" marks items that are secondary-sourced or not fully/officially confirmed; everything else is cited to an official source above.)*

**Core model & identity**
- Persistent, named AI "Bot" with avatar, label, and free-text job description
- Conversational creation (no workflow-builder UI required)
- Narrow/single-purpose Bot pattern explicitly recommended over one catch-all assistant
- Bot description = durable rules; chat message = one-time instructions (explicit UX distinction)
- Duplicate a Bot (copies config/skills/routines/avatar, not memory/history)
- Share a Bot as a public or team-only template link (importable as an independent copy)
- Marketplace for discovering/importing shared Bot templates
- Delete, pin, hide/unhide, and sidebar-section-organize Bots
- Rename Bot, add label, copy conversation ID (sidebar quick actions)

**Compute / architecture**
- One persistent cloud computer per **user** (not per bot), shared across all of that user's Bots
- Per-Bot "screen" on the shared computer enabling true multi-bot parallelism
- One computer-use task per Bot at a time (serialized per screen)
- Full browser + terminal/shell + filesystem on the hosted computer
- Shared `/workspace` filesystem for cross-bot file handoff
- Persistent, signed-in browser sessions shared across a user's Bots
- Per-user hardware-isolated Firecracker microVM (strong tenant isolation)
- No compute isolation *between* a single user's own Bots (shared logins/files/creds)
- Background/async execution — continues after closing the app or laptop
- Computer update / recover / reset lifecycle with different data-loss guarantees per action
- Enterprise bulk computer recreate/terminate/delete (dashboard + Admin API, up to 1,000 members/call)
- Enterprise auto-termination of computers idle 30+ days (opt-in)
- Daily encrypted backups of the control plane to a separate recovery facility
- Optional local-desktop execution capability (separate from the hosted computer), gated per-command by default
- Optional routing of the cloud computer's network egress through the user's own desktop
- Enterprise private-network connectivity via admin-distributed scripts (Tailscale/Cloudflare Tunnel patterns)
- Enterprise destination allowlisting (3 modes: allow-all / defaults+allowlist / allowlist-only)
- Shared static egress IP ranges (no dedicated per-customer IPs)
- US-only data residency today; no on-prem or bring-your-own-image deployment
- Prompt-injection mitigations: untrusted-data tagging of external content + model-independent controls

**Models**
- No end-user model picker for the agent itself; backend-managed model routing
- First-party model pool centered on Grok 4.7 / 4.6 / 4.5 + Cursor's own Composer 2.5
- Explicit "no fixed vendor set guaranteed" disclosure (vendor mix can change)
- Separate reasoning vs. non-reasoning first-party model variants available in the platform
- A dedicated "multi-agent" first-party model variant exists in the vendor's lineup (purpose: parallel deep research) ⚠ not confirmed to power Grok Bot specifically
- Fast/cheap-vs-frontier request-level model routing (classifier-based "Auto" router) at the platform level
- Subagent delegation with isolated context windows and optionally different/faster models per subagent
- Foreground (blocking) vs. background (async) subagent execution modes
- Heavier delegation path to a fully separate coding-agent VM ("Cloud Agent"), not just an in-context subagent
- Enterprise model allowlist (best-effort, not strictly enforced)

**Multi-bot collaboration**
- Group chats with 2–6 Bots per group
- `@mention` routing to a specific Bot, or unaddressed messages let Bots self-select a responder
- `@everyone` broadcast to a whole group
- Threaded replies and lightweight emoji reactions on individual messages
- Asynchronous bot-to-bot direct messaging / task hand-off (independent of the human)
- Shared computer (files/browser/shell) as an implicit cross-bot context channel
- Admin-level kill switch for all bot-to-bot messaging ("Messaging Between Bots")
- "Chief of staff + specialists" is a supported *usage pattern*, not a distinct system role
- Team Bot: one shared Bot, many private per-teammate conversations, shared team memory/plugins/skills
- Per-teammate privacy guarantee on Team Bots (owner can't read teammates' chats, and vice versa)
- Team Bot plugins act using the *current* signed-in teammate's own account/permissions, never another member's
- Public template vs. Team-only template sharing, with default differing by plan (Enterprise defaults Team-only)
- Org/team workspaces with centralized billing, admin dashboard, and group-based policy

**Memory & personalization**
- Durable per-bot memory of stable preferences, facts, and work summaries (explicitly not an authoritative data source)
- Memory/context isolated per Bot by default; shared files/sessions/hand-offs are the cross-bot bridge
- Separate team-wide memory layer for Team Bots, additive to each person's private context
- Skills: reusable, structured instruction sets (trigger conditions, required access, steps, validation, output, approval boundaries)
- One shared private-skills library across all of a user's own Bots
- Packaged/installable skills distributed via the plugin Marketplace
- Teach-by-demonstration: record a live browser workflow (≤10 minutes, no audio) and auto-draft it as a skill
- Knowledge/context files attachable directly in chat or stored in the shared workspace

**Triggers & scheduling**
- Natural-language routine creation (no cron syntax required)
- Timezone-aware scheduling (auto-detect or manual per Bot)
- Minimum 5-minute spacing between scheduled routine runs
- Up to 50 routines per Bot; 20 most recent run records retained per routine
- "Test run" to execute a routine immediately and safely preview behavior (performs real actions)
- Event-based triggers: Slack (mention/keyword/reaction/any-message, scoped by channel), inbound email, GitHub, Linear, Sentry, PagerDuty, generic webhooks
- Per-routine unique webhook URL + key
- Routines continue running while the client app/device is fully closed
- Automatic pause-and-confirm for routines during long user inactivity (usage-protection safeguard)
- Emergent proactive behavior (follow-ups, nudges) driven by memory + routines, not a separate toggle

**Human-in-the-loop**
- Per-action approval cards (Allow once / Always allow / Deny) shown before sensitive actions run
- Independent model-based pre-action review layer ("Auto Review") separate from user approvals
- Auto Review governs: shell commands, plugin/connector calls, computer use, automation writes, and sub-agent/Cloud-Agent delegation
- Personal "Ask first" / "Allow automatically" rule system, with "Ask first" always winning on conflict
- Enterprise-enforced, locked team-wide Auto-review rules layered under personal rules
- ~10-minute expiry on approval requests generated by unattended work (routines/triggers/other bots)
- Editable-draft-then-explicit-send pattern for all outbound email/Slack messages (never auto-sent, even from routines or instructions embedded in received content)
- Live, watchable computer screen with click/type/navigation visibility
- "Take over" / "I'm done" handoff for passwords, passkeys, 2FA, CAPTCHAs, payment/identity steps
- Masked, model-invisible "secure secret" input card for supported credential requests
- Mid-task redirection via a new chat message (interrupts/steers the current turn)
- Hard-stop "Stop now" cancellation (does not undo already-completed actions)
- Mobile push notifications for results, questions, and approval requests

**Integrations / connectors**
- Native plugin/connector system built on MCP (Model Context Protocol) under the hood
- Confirmed native connectors: Gmail, Google Calendar, Google Drive, Google Docs/Sheets/Slides, Slack, Notion, SharePoint, Salesforce, GitHub, Jira, Linear, Databricks, Datadog, Hex, Statsig, Gong, X/Twitter
- Agent-owned email address (`you@mail.grokbot.com`) with inbound/outbound mail handling
- Read-only, no-login public X search/read baseline capability
- Browser-based "computer use" fallback for any site/app lacking a clean connector or API
- Enterprise MCP server allowlist
- Enterprise connector (plugin) allow/block policy, independent of network policy
- `@`-attach a connector and `/`-reference a saved skill directly in the composer
- Inbound channel: tag `@bot` on X to hand a post to your own Bot (region-restricted)
- Inbound channel: Slack handle/app specifically for Team Bots
- ⚠ Broader long-tail app reach via a third-party meta-connector (e.g., Composio) exposing hundreds/1,000+ apps through one plugin (secondary-sourced)
- No confirmed general-purpose developer API for creating/scripting Bots themselves (only admin/computer-management APIs exist)
- Enterprise/Organization Admin API for bulk computer and policy management

**Clients**
- Desktop apps: macOS (Apple silicon + Intel), Windows (x64 + Arm64), Linux (x64 + Arm64, `.deb`/`.rpm`/AppImage)
- Mobile apps: iOS (iPhone + iPad), Android
- No confirmed standalone web client
- Full feature parity gap on mobile: no teach-by-demonstration; no routine editing/testing (view/pause/resume only)
- Native dictation and live two-way voice chat on both desktop and mobile
- Voice-memo replies from the Bot, with transcript
- System share-sheet integration (iOS: photo/file/link/text; Android: text only)
- Cross-device conversation and routine sync tied to one signed-in account
- 20+ language UI localization with system-follow option

**Outputs / artifacts**
- Wide input-format support (images, audio, video, PDF, Office formats, CSV/JSON/YAML/code, HTML/email, Jupyter)
- Rich inline result cards (files, images, links, tool outputs) previewable without leaving the chat
- Direct Cloud-Agent-driven PRs/branches in connected GitHub/GitLab/Bitbucket/Azure DevOps repos
- Recommended "facts vs. assumptions vs. completed vs. pending-approval vs. open questions" output structuring
- Evidence-preservation guidance (source links, timestamped screenshots, action logs)
- Iterative artifact revision in place (vs. disconnected duplicate files)

**Pricing / plans**
- Usage bundled into one shared weekly pool across Grok chat/Imagine/Voice/Bot and Cursor coding usage
- Tiered individual plans gating Grok Bot access (Premium/Super/Ultra; not Free/Plus)
- Per-seat team pricing mirroring individual tiers, with mixed-tier teams supported
- Legacy Cursor plan + SuperGrok/X Premium+ account-linking path still supported (non-stacking, "best grant wins" logic)
- Usage-credit-based (not day-count) free trial, metered by agent steps/tokens
- Prepaid top-up credits with optional Auto Top-up and a configurable monthly spending cap
- Flat infrastructure surcharge ("Cursor Token Rate") specifically on third-party-model requests
- Enterprise custom/contract pricing via waitlist/sales

**Admin / enterprise / security / compliance**
- Organization-wide enable/disable switch, with group-scoped access management
- Enterprise network destination allowlisting, including per-directory-group policy and a team-wide lock
- Enterprise-distributed setup scripts run on every hosted computer, with team-managed secret injection
- Enterprise private-network client installation pattern (BYO VPN/zero-trust client)
- Enforced, locked org-wide Auto-review rules layered beneath personal rules
- Enterprise bulk VM lifecycle management (recreate/terminate/delete) via dashboard and API
- Action Recording (sanitized action-level telemetry, 90-day retention) separate from Audit Logs
- OpenTelemetry export of recorded actions and (opt-in) redacted conversation content to a customer-run collector
- SAML 2.0 SSO (Okta/Entra/Google Workspace/OneLogin) and SCIM 2.0 provisioning/deprovisioning
- Group-based policy overrides that can only widen (never narrow) capability, except network policy
- ISO/IEC 27001 and ISO/IEC 42001 certification coverage (held by the Cursor entity, Grok Bot in scope)
- Data Processing Agreement–governed deletion (within 30 days of written direction)
- Privacy Mode (no training on customer data) with legacy-mode incompatibility requiring migration

**Known gaps / risk flags (for competitive positioning)**
- ⚠ Sibling product (Grok Build CLI) had a confirmed, independently-verified repository/secret exfiltration incident contradicting its own "zero transmission" marketing claim
- ⚠ Broader Grok brand has reported EU regulatory data-training concerns and notable European enterprise bans
- No standalone purchase path — Grok Bot cannot be bought independent of a qualifying Grok/Cursor subscription tier
- Self-disclosed "no fixed vendor set guaranteed" — buyers cannot contractually pin a specific model
- Multiple connectors (Zoom, SharePoint app-level auth) have open, unresolved bugs per official docs
- Reviewer-observed coordination inconsistency in larger multi-bot group setups (beta-stage behavior)
- No confirmed Telegram, iMessage, Discord, or Microsoft-Teams-as-a-chat-channel support
- No confirmed standalone web client
- No confirmed general developer/creation API — integration depth for third parties is limited to connectors/MCP and admin APIs
- Strategic/ownership overhang: parent-company consolidation (SpaceX/xAI/X/Cursor) raises questions (reported in press, not officially confirmed by xAI) about long-term model-neutrality of the underlying platform