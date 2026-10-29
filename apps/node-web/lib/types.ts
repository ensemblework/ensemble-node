import type { EntityRef } from "./entity-text";
/** What Ensemble's `/api/node/*` routes send (Ensemble docs/35). */

export type AvatarShape = "orb" | "square" | "spark" | "hex" | "leaf" | "compass";
export type Avatar = { shape: AvatarShape; color: string; eyes: "dot" | "line" | "wide" };

/** `parentNodeId`: a temporary helper's node (it works in a read-only task room and reports to that node). */
export type NodePublic = { id: string; ownerId: string; slug: string; name: string; role: string; avatar: Avatar; status: "active" | "paused"; parentNodeId?: string | null };
export type NodeFull = NodePublic & {
  charter: string;
  provider: string | null;
  model: string | null;
  runProfileId: string | null;
  /** computerWork "ask": starting work on the owner's computer waits for an approval card (default: on its own). */
  autonomy: { sharedRooms?: "ask" | "auto"; computerFiles?: boolean; computerWork?: "auto" | "ask" };
  /** How long its chat model thinks, when the model takes a level (default low: nodes answer fast). */
  effort?: "low" | "medium" | "high";
  templateId: string | null;
  createdAt: string;
};

/** `lead`: in a crew, the crew's lead; in a room, this person's lead node (their representative). */
export type NodeMember = { id: string; kind: "node"; handle: string; accountId: string; representative: boolean; lead: boolean; node: NodePublic | NodeFull };
export type PersonMember = { id: string; kind: "person"; handle: string; accountId: string; role: string; name: string; responsibility: string | null; me: boolean };
export type Member = NodeMember | PersonMember;

/** plan: a lead's plan for its crew, with its steps; cards of the steps carry its id in `planId`. */
export type MessageKind = "text" | "approval" | "run" | "status" | "error" | "plan";

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
};

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
  requirements?: Requirement[];
  deferred?: Array<{ requirementId: string; reason: string }>;
  steps: PlanStep[];
};

/** Agent settings of a run, as asked (`requested`), as sent to the engine (`resolved`) and as the engine said (`observed`). */
export type RunSettingValues = { agent?: string; model?: string; effort?: string; context?: string; fast?: boolean | string };
export type RunSettings = { requested?: RunSettingValues | null; resolved?: RunSettingValues | null; observed?: RunSettingValues | null };

/** A queued message of an agent session, in the order it will run. */
export type QueuedRun = { jobId: string; title: string; prompt: string; position: number };
/** The agent session a run card belongs to (`data.session`), kept current by Ensemble. */
export type RunSession = { id: string; status: string; agent?: string | null; model?: string | null; computer?: string | null; folder?: string | null; queue: QueuedRun[] };
/** `GET /api/node/sessions/:id`. */
export type SessionDetail = {
  id: string;
  nodeId: string;
  status: string;
  agent: string | null;
  agentName?: string | null;
  model: string | null;
  computer: string | null;
  folder: string | null;
  running: { jobId: string; title: string; prompt: string } | null;
  queue: QueuedRun[];
  runs?: unknown[];
};
/** `POST /api/node/sessions/:id/control`. replace: stop the run and the queue, then send this. */
export type SessionAction = { action: "queue" | "steer" | "replace" | "stop"; prompt?: string; title?: string; queued?: "keep" | "drop" };

/** A file a run attached as evidence (`data.evidence` on a run card), read with `GET /api/node/evidence/:id`. */
export type EvidenceItem = { id: string; kind: string; name: string; mime: string; size?: number | null; caption?: string | null; requirementId?: string | null; createdAt?: string | null };
/** Evidence a node sends in a message (`data.media`). */
export type MediaItem = { evidenceId: string; kind: string; name: string; mime: string; caption?: string | null };

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
   * A helper's task room: where its parent was asked and the message that brought the helper in, when
   * Ensemble sends them (top level, or in `helper` or `settings`). Older servers send neither.
   */
  originRoomId?: string | null;
  originMessageId?: string | null;
  helper?: { parentNodeId?: string | null; helperNodeId?: string | null; originRoomId?: string | null; originMessageId?: string | null } | null;
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
};

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
