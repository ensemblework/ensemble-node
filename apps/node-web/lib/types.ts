import type { EntityRef } from "./entity-text";
/** What Ensemble's `/api/node/*` routes send (Ensemble docs/35). */

export type AvatarShape = "orb" | "square" | "spark" | "hex" | "leaf" | "compass";
export type Avatar = { shape: AvatarShape; color: string; eyes: "dot" | "line" | "wide" };

export type NodePublic = { id: string; ownerId: string; slug: string; name: string; role: string; avatar: Avatar; status: "active" | "paused" };
export type NodeFull = NodePublic & {
  charter: string;
  provider: string | null;
  model: string | null;
  runProfileId: string | null;
  /** computerWork "ask": starting work on the owner's computer waits for an approval card (default: on its own). */
  autonomy: { sharedRooms?: "ask" | "auto"; computerFiles?: boolean; computerWork?: "auto" | "ask" };
  templateId: string | null;
  createdAt: string;
};

/** `lead`: in a crew, the crew's lead; in a room, this person's lead node (their representative). */
export type NodeMember = { id: string; kind: "node"; handle: string; accountId: string; representative: boolean; lead: boolean; node: NodePublic | NodeFull };
export type PersonMember = { id: string; kind: "person"; handle: string; accountId: string; role: string; name: string; responsibility: string | null; me: boolean };
export type Member = NodeMember | PersonMember;

export type MessageKind = "text" | "approval" | "run" | "status" | "error";

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
export type RoomKind = "dm" | "crew" | "room";

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
