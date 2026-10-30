import type { EntityRef } from "./entity-text";
/** What Ensemble's `/api/node/*` routes send (Ensemble docs/35). */

export type AvatarShape = "orb" | "square" | "spark" | "hex" | "leaf" | "compass";
export type Avatar = { shape: AvatarShape; color: string; eyes: "dot" | "line" | "wide" };

/** `parentNodeId`: a temporary helper's node (it works in a read-only task room and reports to that node). */
export type NodePublic = { id: string; ownerId: string; slug: string; name: string; role: string; avatar: Avatar; status: "active" | "paused"; parentNodeId?: string | null };
/** What a helper may do: read (the default), run its own agent sessions, or use the computer's tools too. */
export type HelperGrant = "read" | "sessions" | "computer";
export type NodeFull = NodePublic & {
  charter: string;
  provider: string | null;
  model: string | null;
  runProfileId: string | null;
  /**
   * computerWork "ask": starting work on the owner's computer waits for an approval card (default: on its own).
   * `grant`: what a helper may do, as its parent granted (read when not said). `createNodes`: nodes and
   * crews it makes are proposed on a card (ask, the default) or made at once (auto). `helpers`: helpers
   * working at once (4 when not said; 0: no limit; the account allows twice this).
   */
  autonomy: { sharedRooms?: "ask" | "auto"; computerFiles?: boolean; computerWork?: "auto" | "ask"; answerAgentQuestions?: boolean; grant?: HelperGrant; createNodes?: "ask" | "auto"; helpers?: number };
  /** How long its chat model thinks, when the model takes a level (default low: nodes answer fast). */
  effort?: "low" | "medium" | "high";
  templateId: string | null;
  createdAt: string;
};

/** `lead`: in a crew, the crew's lead; in a room, this person's lead node (their representative). */
export type NodeMember = { id: string; kind: "node"; handle: string; accountId: string; representative: boolean; lead: boolean; node: NodePublic | NodeFull };
export type PersonMember = { id: string; kind: "person"; handle: string; accountId: string; role: string; name: string; responsibility: string | null; me: boolean };
export type Member = NodeMember | PersonMember;

/**
 * plan: a lead's plan for its crew, with its steps; cards of the steps carry its id in `planId`.
 * request: a peer request's public card in a room with other people, updated in place.
 */
export type MessageKind = "text" | "approval" | "run" | "status" | "error" | "plan" | "request";

export type PlanStepStatus = "waiting" | "working" | "done" | "blocked" | "skipped" | "stopped";
export type StepKind = "build" | "verify" | "write" | "research" | "other";
/** Who does a step: another node, the node's own work lane, an agent session, or a helper. */
export type StepExecutor = "node" | "self" | "session" | "helper";
/** A step's result, separate from whether it ran: unknown until reported, unverified when nobody reported. */
export type StepOutcome = "unknown" | "done" | "pass" | "fail" | "blocked" | "unverified";
/** `done` is the status of plans made before outcomes existed: they ended. */
export type MissionStatus = "draft" | "running" | "reporting" | "succeeded" | "partially_completed" | "failed" | "stopped" | "done";

/** One check a worker ran (Ensemble's node/report.ts). */
export type Check = {
  id?: string;
  name: string;
  verdict: "pass" | "fail" | "blocked" | "skipped";
  detail?: string;
  evidence?: string[];
  rerun?: { command: string; cwd?: string; expects: "exit_0" | { outputMatches: string } };
};
/** What a build produced and a verification tested: a commit, or a content hash when nothing was committed. */
export type Candidate = { repo?: string; folder?: string; branch?: string; commit?: string; contentHash?: string; url?: string };
export type AttemptReason = "first" | "repair" | "retest" | "nudge";
export type Attempt = { n: number; reason: AttemptReason; outcome: string; summary: string | null; checks?: Check[]; candidate?: Candidate; startedAt: string | null; endedAt: string | null };
export type BlockedBy = "needs_owner" | "login_required" | "missing_access" | "environment" | "no_report" | "no_progress" | "unknown";
/** What a worker reported at the end of its work: on a run card (`data.report`) and in a step's attempts. */
export type StepReport = {
  outcome: "done" | "pass" | "fail" | "blocked";
  summary: string;
  checks?: Check[];
  subject?: Candidate;
  evidence?: Array<{ kind: string; ref: string; caption?: string }>;
  blockedBy?: BlockedBy;
};

export type RequirementStatus = "open" | "in_progress" | "accepted" | "failed" | "deferred" | "cancelled";
export type Requirement = { id: string; text: string; status: RequirementStatus; acceptance: Array<{ id: string; text: string; mandatory: boolean }> };

/** How a plan's builds share its folder (Ensemble docs/35 §8.15), and how an integration step combines them. */
export type ParallelMode = "serial" | "worktrees" | "snapshots";
export type IntegrateHow = "merge" | "rebase" | "patch";
/** A plan's constraints, written once for every step (contract 3): the fields the card shows. */
export type PlanConstraints = {
  computer?: string;
  folder?: string;
  repos?: string[];
  branch?: string;
  publish?: "none" | "commit" | "push" | "pr";
  order?: "serial" | "parallel_ok";
  parallel?: ParallelMode;
  integrate?: IntegrateHow;
  notes?: string[];
};
/** A check's pass that a later change in the same place no longer covers: what it tested, the step that changed it, and to what. */
export type StaleAfter = { step: string; handle: string; candidate: string; at: string; tested?: string };

/** How a step's agent runs go, as the owner asked. */
export type StepRun = { agent?: string; model?: string; effort?: string; context?: "default" | "long_context" };

/** A plan step. Fields after `endedAt` come with outcomes (contract 2 and later); older cards leave them out. */
export type PlanStep = {
  id: string;
  nodeId: string;
  handle: string;
  name: string;
  brief: string;
  after: string[];
  status: PlanStepStatus;
  result: string | null;
  progress: string | null;
  startedAt: string | null;
  endedAt: string | null;
  kind?: StepKind;
  executor?: StepExecutor;
  verifies?: string | null;
  requirementIds?: string[];
  run?: StepRun;
  /** Waiting, but an earlier step failed, is blocked or unverified: `heldBy` is that step's id. */
  held?: boolean;
  heldBy?: string | null;
  outcome?: StepOutcome;
  attempt?: number;
  attempts?: Attempt[];
  sessionId?: string | null;
  /** An integration step: the builds it brings in (step ids). */
  integrates?: string[];
  /** A check that passed, after which another step changed what it tested. */
  staleAfter?: StaleAfter | null;
};

/** The routine whose run started a mission (`data.routine` on its card): `trigger` is the routine's "when" in words. */
export type PlanRoutine = { id: string; runId: string; title: string; notify: RoutineNotify; trigger?: string };

/**
 * A plan card (`kind: "plan"`): Ensemble's projection of a mission. `kind: "self"` is a node's own
 * piece of work, one step. Contract 1 cards have only the type, lead, status and steps.
 */
export type PlanData = {
  type: "plan";
  version?: number;
  contract?: number;
  missionId?: string;
  kind?: "plan" | "self";
  leadNodeId: string;
  leadHandle: string;
  leadTurnId?: string | null;
  originRoomId?: string;
  originPrivate?: boolean;
  status: MissionStatus;
  goal?: string | null;
  constraints?: PlanConstraints | null;
  requirements?: Requirement[];
  deferred?: Array<{ requirementId: string; reason: string }>;
  steps: PlanStep[];
  /** A routine's run: its card is listed with the routine, not in the chat (its message's `planId` is the routine's id). */
  routine?: PlanRoutine | null;
};

/** Agent settings of a run, as asked (`requested`), as sent to the engine (`resolved`) and as the engine said (`observed`). */
export type RunSettingValues = { agent?: string; model?: string; effort?: string; context?: string; fast?: boolean | string };
export type RunSettings = { requested?: RunSettingValues | null; resolved?: RunSettingValues | null; observed?: RunSettingValues | null };

/** A queued message of an agent session, in the order it will run. */
export type QueuedRun = { jobId: string; title: string; prompt: string; position: number };
/**
 * The agent session a run card belongs to (`data.session`), kept current by Ensemble. `agent` is the
 * name shown ("Claude Code") and `agentId` the agent's id ("claude-code"); cards from before
 * `agentId` carry the id in `agent`.
 */
/** A run card's `data.session`: `nodeId` is the node that manages the session (it can be handed over). */
export type RunSession = { id: string; nodeId?: string | null; status: string; agent?: string | null; agentId?: string | null; model?: string | null; computer?: string | null; folder?: string | null; queue: QueuedRun[] };
/** `GET /api/node/sessions/:id`. Here `agent` is the agent's id and `agentName` the name shown: the other way round from a card's `data.session`. */
export type SessionDetail = {
  id: string;
  /** The node that manages the session now; null when none does (started in the Hub or the CLI). */
  nodeId: string | null;
  status: string;
  agent: string | null;
  agentName?: string | null;
  model: string | null;
  computer: string | null;
  folder: string | null;
  running: { jobId: string; title: string; prompt: string } | null;
  queue: QueuedRun[];
  runs?: SessionRunRow[];
};
/** One of a session's recent runs, newest first, as `GET /api/node/sessions/:id` lists them. */
export type SessionRunRow = {
  jobId: string;
  title: string;
  prompt: string | null;
  status: string;
  position: number | null;
  summary: string | null;
  error?: string | null;
  settings?: RunSettings | null;
  /** Its run card, when it has one in Node: the message and the conversation it is in. */
  messageId: string | null;
  roomId?: string | null;
  createdAt: string;
  finishedAt: string | null;
};
/**
 * One of the owner's agent sessions (`GET /api/node/sessions`), most recently active first: `agent` is
 * its id and `agentName` its name; `nodeId` the node that manages it, null when none does (a session
 * started in the Hub or the CLI); `title` its first task and `latestTask` its newest.
 */
export type SessionSummary = {
  id: string;
  nodeId: string | null;
  /** Its newest run card in Node; null for a session from the Hub or the CLI that has none. */
  card?: { messageId: string | null; roomId: string | null } | null;
  status: string;
  agent: string;
  agentName: string;
  model: string | null;
  computer: string | null;
  folder: string;
  title: string;
  latestTask: string;
  summary: string;
  runs: number;
  lastActiveAt: string;
};
/** `POST /api/node/sessions/:id/control`. replace: stop the run and the queue, then send this. */
export type SessionAction = { action: "queue" | "steer" | "replace" | "stop"; prompt?: string; title?: string; queued?: "keep" | "drop" };

/** A file a run attached as evidence (`data.evidence` on a run card), read with `GET /api/node/evidence/:id`. */
export type EvidenceItem = {
  id: string;
  kind: string;
  name: string;
  mime: string;
  size?: number | null;
  caption?: string | null;
  requirementId?: string | null;
  createdAt?: string | null;
  /** Kept on the computer that made it (evidence upload is off there): listed, never opened here. */
  local?: boolean;
  /** Held for its owner's preview (a secret on screen, a desktop app's window, a site they see first): never shown inline. */
  held?: boolean;
  holdReason?: string | null;
  /** A video's poster image, its own evidence id. */
  poster?: string;
  /** What capture measured. */
  width?: number;
  height?: number;
  durationMs?: number;
};
/** Evidence a message shows (`data.media`: node replies, plan reports, approved drafts, shared messages). A video names its poster (`posterId`). */
export type MediaItem = { evidenceId: string; kind: string; name: string; mime: string; caption?: string | null; size?: number | null; posterId?: string; width?: number; height?: number; durationMs?: number };
/** A run's evidence or a node's own captures as Ensemble lists them (`GET /api/node/evidence?jobId=|nodeId=`, a run card's `data.evidence`). */
export type CardEvidence = {
  id: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  caption?: string;
  requirementId?: string;
  createdAt: string;
  local?: true;
  held?: true;
  holdReason?: string;
  poster?: string;
  preview?: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

/** The latest picture of a run's browser tab (`GET /api/node/live/:jobId`), or why there is none. */
export type LiveFrame = {
  /** The picture as a data URL; null when the view is paused or there is none. */
  image: string | null;
  at: string | null;
  url: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  /** `sensitive`, `private_site` or `secret_on_screen`. */
  paused: string | null;
};

/** `refs`: the records the call's result names (Ensemble's AssistantRef): ids for links, titles to show. */
export type ToolChip = { id: string; name: string; state?: string; summary: string | null; href: string | null; refs?: EntityRef[] };
export type HeldCall = { callId: string; name: string; summary: string; input: Record<string, unknown> };

/** A file on a message (`data.files`): a reference to a Document in the sender's Ensemble Files. */
export type MessageFile = { id: string; name: string; kind: string; size: number };

/** Ensemble's Files (`GET /api/documents`, `POST /api/documents`), the fields Node reads. */
export type FileRecord = { id: string; filename: string; mediaType?: string; kind: string; byteSize: number; textStatus: string; createdAt: string };
/** Hosted accounts have caps (null: none); `maxFileBytes` is the largest single file this server keeps. */
export type FileUsage = { count: number; bytes: number; maxCount: number | null; maxBytes: number | null; maxFileBytes: number };

export type Message = {
  id: string;
  roomId: string;
  seq: number;
  authorKind: "human" | "node" | "system";
  authorAccountId: string;
  authorNodeId: string | null;
  kind: MessageKind;
  body: string;
  /** `files` on a person's message; `replyTo`, `tools`, `reactions`, card fields and more by kind. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any> & { files?: MessageFile[]; replyTo?: ReplyTo };
  private: boolean;
  mentions: Array<{ kind: "human" | "node"; id: string }>;
  rootMessageId: string | null;
  clientId: string | null;
  /** A card shown inside this plan's card, not in the timeline. */
  planId?: string | null;
  createdAt: string;
  /** Set while a message this tab sent is on its way. */
  sending?: boolean;
  failed?: string;
};

/** A request to join a room, as its creator sees it. */
export type RoomInvite = {
  id: string;
  name: string;
  email: string | null;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt: string | null;
  askAgainAfter: string | null;
};

/** dm: me and one node. crew: me and nodes I pick. room: other people too, each with their own nodes. */
/** task: a helper's room, where a node briefs a temporary helper; its owner reads it but does not write. */
export type RoomKind = "dm" | "crew" | "room" | "task";

export type Room = {
  id: string;
  kind: RoomKind;
  title: string;
  createdBy: string;
  lastSeq: number;
  lastMessageAt: string | null;
  leadNodeIds: string[];
  pinned: string[];
  /** Only for the room's creator. */
  invites: RoomInvite[];
  members: Member[];
  unread?: number;
  readSeq?: number;
  last?: Message | null;
  /**
   * A helper's task room: whose helper it is and where its parent was asked (`helper`, from Ensemble's
   * room view; `originPrivate` when it was asked privately). Older servers sent neither; the fields at
   * the top level and in `settings` are read too.
   */
  originRoomId?: string | null;
  originMessageId?: string | null;
  helper?: { parentNodeId?: string | null; helperNodeId?: string | null; originRoomId?: string | null; originMessageId?: string | null; originPrivate?: boolean; planId?: string | null } | null;
  settings?: Record<string, unknown> | null;
};

export type Computer = { id: string; name: string; platform: string; online: boolean; lastSeenAt: string | null };
export type Credits = { available: boolean; limit: number; used: number; remaining: number; resetsAt: string; paused: boolean } | null;

export type NodeTemplate = { id: string; name: string; slug: string; role: string; summary: string; avatar: Avatar; charter: string };
export type CrewTemplate = { id: string; title: string; summary: string; nodes: string[]; lead: string };
/**
 * A model a node can use: included with Ensemble (credits), on the account's own API keys, or an AI
 * plan on a paired computer.
 */
export type ModelOption = {
  provider: string;
  model: string;
  /** Name and version: "GPT-6 Luna (2026-09-22)"; the agent's label for AI plans. */
  label: string;
  group?: "included" | "keys" | "plans";
  vendor?: string;
  role?: "everyday" | "step-up";
  /** A typical turn's credits relative to the 1× model, as on the Hub's cost badge. */
  relativeCost?: number;
  /** Plans only: the computer the agent was found on. */
  computer?: string;
  default: boolean;
};

export type ModelList = { default: string; options: ModelOption[]; problems?: string[] };

/** A request to join a room, waiting for my answer. */
export type IncomingInvite = { id: string; room: { id: string; title: string; people: number }; from: { name: string; email: string | null }; createdAt: string };

export type Limits = { roomPeople: number; nodesPerPerson: number; crewNodes: number; pins: number; reactions: string[]; declineBlockDays: number };

export type SearchResult = { message: Message; room: { id: string; title: string; kind: RoomKind } };

export type ReplyTo = { id: string; seq: number; authorKind: Message["authorKind"]; handle: string | null; excerpt: string };

export type Bootstrap = {
  me: { id: string; name: string | null; email: string; verified: boolean };
  nodes: NodeFull[];
  rooms: Room[];
  computers: Computer[];
  credits: Credits;
  models: ModelList;
  invites: IncomingInvite[];
  limits: Limits;
  templates: { nodes: NodeTemplate[]; crews: CrewTemplate[] };
};

export type Run = {
  id: string;
  nodeId: string;
  roomId: string;
  messageId: string | null;
  jobId: string;
  taskId: string;
  title: string;
  status: string;
  progress: string | null;
  summary: string | null;
  computer: string | null;
  createdAt: string;
};

export type Turn = { id: string; nodeId: string; roomId: string | null; reason: string; status: string; model: string | null; credits: number | null; error: string | null; private: boolean; createdAt: string; finishedAt: string | null };

export type RoutineTrigger = "schedule" | "event" | "webhook";
/** always: the node posts the result; needed: only when something failed, changed or needs the owner; never: it is only listed with the routine. */
export type RoutineNotify = "always" | "needed" | "never";
/** What an event routine watches: tasks or pages changing in a space (`space`: its id, `spaceName` its name; the owner's own when left out), gathered over `windowSeconds`. */
export type RoutineEvent = { on: "task" | "page"; actions?: string[]; space?: string; spaceName?: string | null; windowSeconds: number };

/**
 * One occurrence of a routine (Ensemble's `node_routine_runs`): `missionId` is the plan card it
 * started (`GET /api/node/messages/:missionId`), `missionStatus` that mission's status, `items` how
 * many changes or webhook calls it gathered.
 */
export type RoutineRun = {
  id: string;
  trigger: RoutineTrigger | "manual";
  status: "pending" | "starting" | "started" | "skipped" | "failed";
  missionId: string | null;
  missionStatus: string | null;
  error: string | null;
  dueAt: string;
  startedAt: string | null;
  createdAt: string;
  items: number;
};

/**
 * Work a node does by itself (`GET /api/node/routines`, Ensemble docs/35 §6.5): an instruction it does
 * as its own work (`action: "prompt"`) or a saved plan its nodes run (`action: "plan"`). `when` is
 * Ensemble's own words for its trigger; `runs` the newest five.
 */
export type Routine = {
  id: string;
  title: string;
  nodeId: string;
  roomId: string;
  action: "prompt" | "plan";
  instruction: string | null;
  template: unknown | null;
  trigger: RoutineTrigger;
  cron: string | null;
  timezone: string;
  event: RoutineEvent | null;
  webhook: { path: string; hasToken: boolean } | null;
  notify: RoutineNotify;
  status: "active" | "paused";
  when: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runs: RoutineRun[];
};

/** A board task blocked or waiting for an approval: Ensemble's Needs me lists the same. */
export type WaitingTask = { id: string; title: string; status: "blocked" | "waiting_approval"; updatedAt: string };

export type Activity = { approvals: Message[]; runs: Run[]; turns: Turn[]; computers: Computer[]; credits: Credits; waitingTasks?: WaitingTask[] };

export type AuthStatus = {
  providers: Array<"google" | "github" | "microsoft">;
  signup: string;
  emailConfigured: boolean;
  emailSignupAvailable: boolean;
  turnstileSiteKey: string | null;
};

/** Ensemble's paired computers (`GET /api/devices`). */
export type Device = {
  id: string;
  name: string;
  platform: string;
  appVersion: string | null;
  /** Labels of the folders the computer shares with Ensemble. */
  folders: string[];
  online: boolean;
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** The key Ensemble encrypts secrets for, pinned when the computer was paired (docs/35 §8.7). Absent: too old for end-to-end encryption. */
  sealKey?: { kid: string; fingerprint: string } | null;
  /** The computer now reports a different key: nothing is sent to it until it is paired again. */
  sealKeyMismatch?: boolean;
  /** What the computer reported on its last heartbeat; `browser` 1 and `capture` say it can browse and capture (docs/25 §10.3). */
  capabilities?: DeviceCapabilities | null;
};

/** What a computer can capture, as it reports it: a Chromium for Ensemble, the video format, each target and whether setup would add more. */
export type CaptureSummary = {
  browser: boolean;
  video: "mp4" | "webm" | null;
  targets: Record<string, { screenshot: boolean; video: boolean; reason?: string }>;
  setup: boolean;
};
export type DeviceCapabilities = { browser?: number; capture?: CaptureSummary | null; [key: string]: unknown };

/** Ensemble's Needs me: a run's approval (`GET /api/approvals`). */
export type ApprovalRecord = { id: string; runId: string; taskId: string | null; kind: string; title: string; preview: unknown; decision: string | null; requestedAt: string };

/** Ensemble's Needs me: a question from an agent or a tool (`GET /api/decisions`). */
export type AgentDecision = {
  id: string;
  source: "cursor" | "claude" | "copilot" | "codex" | "ensemble" | "other";
  /** "permission" or "question" for a run's own cards; an editor hook's event name otherwise. */
  event: string;
  toolName: string;
  title: string;
  detail: {
    command?: string | null;
    server?: string | null;
    options?: string[];
    /** A question also takes an answer of the person's own words. */
    allowCustom?: boolean;
    taskId?: string;
    taskTitle?: string;
    /** The computer job that asked (a run's own cards). */
    jobId?: string;
    deviceId?: string | null;
    deviceName?: string | null;
    tier?: "ordinary" | "run_branch_push" | "high_risk";
    confirm?: boolean;
    recommended?: string | null;
    header?: string | null;
  } | null;
  cwd: string | null;
  sessionId?: string | null;
  canAnswer?: boolean;
  status: "pending" | "decided" | "expired" | "settled";
  requestedAt: string;
  expiresAt: string;
};

/** What `POST /api/decisions/:id/decide` takes. A question's answer is `reason`. */
export type DecisionBody = { decision: "allow" | "deny"; scope: "once" | "session"; reason?: string; confirmed?: true };

/** A computer job behind a run card (`GET /api/agent/jobs/:id`, the fields Node reads). */
export type AgentJob = {
  id: string;
  taskId: string;
  title: string;
  kind: string;
  status: string;
  /** For a coding run, the engine (claude-code, codex, cursor-agent, copilot-cli, …); else the model's provider. */
  provider: string | null;
  model: string;
  /** The model that answered, when the engine said. */
  modelUsed: string | null;
  reasoningEffort: string | null;
  contextTier?: string | null;
  progress: string | null;
  summary: string | null;
  error: string | null;
  turns: number;
  toolCalls: number;
  runId: string | null;
  /** Only for the person whose computer runs it. */
  deviceName: string | null;
  /** True when the run is on my computer: only then may I stop it. */
  yours: boolean;
  folder: string;
  branch: string;
  files: Array<{ path: string; added: number; removed: number }>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/** One of the job's milestones (`events`, the last 150). */
export type JobEvent = { id: string; kind: string; data: Record<string, unknown> | null; at: string };

export type JobDetail = { job: AgentJob; log: string; events: JobEvent[] };

/** One tool call in a run step, as the engine trace stores it (previews, never whole files). */
export type RunToolCall = { id?: string; name: string; args?: string; ok?: boolean; output?: string; ms?: number; engine?: string; summary?: string };

/** One step of a run's trace (`GET /api/runs/:id`): a tool call, thinking, a message, or the result. */
export type RunStep = {
  index: number;
  title: string;
  status: "pending" | "running" | "done" | "failed" | "needs_approval" | "skipped";
  output: string | null;
  toolCalls: RunToolCall[] | null;
  reasoning: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
};

/** Ensemble's connector store with this account's state (`GET /api/connectors/catalog`). */
export type ConnectorEntry = {
  id: string;
  logo: string;
  name: string;
  vendor: string;
  category: string;
  featured: boolean;
  tagline: string;
  auth: readonly string[];
  provider?: string;
  products?: ReadonlyArray<{ id: string; name: string }>;
  reads: readonly string[];
  writes: readonly string[];
  mcp?: { open?: boolean };
  status: "ready" | "soon";
  state: {
    connected: boolean;
    account: string | null;
    appReady: boolean;
    needsConsent?: string[];
    products: Record<string, boolean>;
    sources: Record<string, { enabled: boolean; lastSyncAt: string | null; lastError: string | null }>;
    mcp?: { status: "pending" | "connected" | "error" | "disabled"; toolCount: number; lastError: string | null; auth?: string; account?: string | null };
  };
};

/** A remote MCP server connected in Ensemble (`GET /api/mcp-connections`). */
export type McpConnection = {
  id: string;
  serverId: string | null;
  name: string;
  url: string;
  status: "pending" | "connected" | "error" | "disabled";
  account?: string | null;
  toolCount: number;
  lastError: string | null;
};

export type Me = {
  user: { id: string; email: string; name: string | null; emailVerified?: boolean };
  verificationRequired: boolean;
};

// ── Rooms with other people (rooms v2, Ensemble docs/35 §12) ─────────────────────────────────────

export type Presence = "online" | "away" | "offline";
export type StatusDetail = "nothing" | "titles" | "details";

/** A person's status card in a room, as the reader may see it (`GET /api/node/rooms/:id/status`, and `@leads status`). */
export type StatusCard = {
  accountId: string;
  name: string;
  handle: string;
  lead: { nodeId: string; handle: string; name: string } | null;
  presence: Presence;
  away: { until: string | null; note: string | null } | null;
  detail: StatusDetail;
  /** They ask to be asked before their status is shared: presence only. */
  asks: boolean;
  missions: Array<{ title: string; status: string; requirements?: Array<{ text: string; status: string }>; steps?: { done: number; total: number } }>;
  tasks: Array<{ title: string; status: string; due?: string | null }>;
};

export type PeerKind = "question" | "share" | "review" | "work";
export type RequestStatus = "open" | "answered" | "awaiting_owner" | "approved" | "declined" | "done" | "cancelled";

/** What a person's lead may do for others in a room without asking (their own choices, §12.5). */
export type TrustSettings = {
  status: "answer" | "ask";
  statusDetail: StatusDetail;
  shareSpaceArtefacts: "answer" | "ask";
  shareOther: "ask" | "never";
  workRequests: "ask" | "accept";
  acceptKinds: PeerKind[];
  freeFormAnswers: "allow" | "ask";
};

/** `GET/PUT /api/node/rooms/:id/trust`: my settings for everyone, each other person's own (overrides and what applies), and my monthly budget. */
export type TrustView = {
  defaults: TrustSettings;
  everyone: TrustSettings;
  people: Array<{ accountId: string; name: string; handle: string; overrides: Partial<TrustSettings> | null; effective: TrustSettings }>;
  budget: { credits: number | null; usedThisMonth: number };
};

/** An item I marked shareable in a room: my lead may read it out there (`GET/PUT /api/node/rooms/:id/shareable`). */
export type ShareableItem = { kind: "page" | "task" | "file"; id: string; spaceId: string; title: string; addedAt: string };

export type RequestPerson = { accountId: string; name: string; handle: string | null };
/** A request's reference: a record, a file, a link or a message it is about. */
export type RequestRef = { kind: "task" | "page" | "file" | "link" | "message"; id?: string; title: string; url?: string };
export type RequestCandidate = { repo?: string; commit?: string; url?: string };

/** A peer request as I may see it (`GET /api/node/rooms/:id/requests`); its target also sees their own card and the mission. */
export type PeerRequest = {
  id: string;
  roomId: string;
  kind: PeerKind;
  status: RequestStatus;
  text: string;
  refs: RequestRef[] | null;
  candidate: RequestCandidate | null;
  from: RequestPerson & { nodeId: string | null; nodeHandle: string | null };
  to: RequestPerson & { leadNodeId: string | null; leadHandle: string | null };
  answer: string | null;
  outcome: string | null;
  requirements: Array<{ text: string; status: string }>;
  cardId: string | null;
  ownerCardId?: string | null;
  missionId?: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
};
