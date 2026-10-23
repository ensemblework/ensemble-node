/** What Ensemble's `/api/node/*` routes send (Ensemble docs/35). */

export type AvatarShape = "orb" | "square" | "spark" | "hex" | "leaf" | "compass";
export type Avatar = { shape: AvatarShape; color: string; eyes: "dot" | "line" | "wide" };

export type NodePublic = { id: string; ownerId: string; slug: string; name: string; role: string; avatar: Avatar; status: "active" | "paused" };
export type NodeFull = NodePublic & {
  charter: string;
  provider: string | null;
  model: string | null;
  runProfileId: string | null;
  autonomy: { sharedRooms?: "ask" | "auto" };
  templateId: string | null;
  createdAt: string;
};

export type NodeMember = { id: string; kind: "node"; handle: string; accountId: string; representative: boolean; node: NodePublic | NodeFull };
export type PersonMember = { id: string; kind: "person"; handle: string; accountId: string; role: string; name: string; responsibility: string | null; me: boolean };
export type Member = NodeMember | PersonMember;

export type MessageKind = "text" | "approval" | "run" | "status" | "error";

export type ToolChip = { id: string; name: string; state?: string; summary: string | null; href: string | null };
export type HeldCall = { callId: string; name: string; summary: string; input: Record<string, unknown> };

export type Message = {
  id: string;
  roomId: string;
  seq: number;
  authorKind: "human" | "node" | "system";
  authorAccountId: string;
  authorNodeId: string | null;
  kind: MessageKind;
  body: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  private: boolean;
  mentions: Array<{ kind: "human" | "node"; id: string }>;
  rootMessageId: string | null;
  clientId: string | null;
  createdAt: string;
  /** Set while a message this tab sent is on its way. */
  sending?: boolean;
  failed?: string;
};

export type Room = {
  id: string;
  kind: "dm" | "crew" | "group";
  title: string;
  createdBy: string;
  lastSeq: number;
  lastMessageAt: string | null;
  leadNodeIds: string[];
  members: Member[];
  unread?: number;
  readSeq?: number;
  last?: Message | null;
};

export type Computer = { id: string; name: string; platform: string; online: boolean; lastSeenAt: string | null };
export type Credits = { available: boolean; limit: number; used: number; remaining: number; resetsAt: string; paused: boolean } | null;

export type NodeTemplate = { id: string; name: string; slug: string; role: string; summary: string; avatar: Avatar; charter: string };
export type CrewTemplate = { id: string; title: string; summary: string; nodes: string[]; lead: string };
/** One of the included models Ensemble's server offers (the same list as the Hub and the CLI). */
export type ModelOption = {
  provider: string;
  model: string;
  /** Name and version: "GPT-6 Luna (2026-09-22)". */
  label: string;
  vendor?: string;
  role?: "everyday" | "step-up";
  /** A typical turn's credits relative to the 1× model, as on the Hub's cost badge. */
  relativeCost?: number;
  default: boolean;
};

export type Bootstrap = {
  me: { id: string; name: string | null; email: string; verified: boolean };
  nodes: NodeFull[];
  rooms: Room[];
  computers: Computer[];
  credits: Credits;
  models: { default: string; options: ModelOption[] };
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

export type Activity = { approvals: Message[]; runs: Run[]; turns: Turn[]; computers: Computer[]; credits: Credits };

export type AuthStatus = {
  providers: Array<"google" | "github" | "microsoft">;
  signup: string;
  emailConfigured: boolean;
  emailSignupAvailable: boolean;
  turnstileSiteKey: string | null;
};

export type Me = {
  user: { id: string; email: string; name: string | null; emailVerified?: boolean };
  verificationRequired: boolean;
};
