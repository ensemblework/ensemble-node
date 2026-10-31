import { liveMeta } from "./captures";
import { ENSEMBLE_API } from "./config";
import { evidenceErrorWords, evidencePath } from "./evidence";
import type { OwnerSettings } from "./owner-settings";
import type { SudoAnswer, SudoTarget } from "./sudo";
import type { CardEvidence, FileRecord, LiveFrame, Message, OwnSpace, PageRole, PeerKind, RoomBoard, RoomDecision, RoomPage, RoomPrefs, RoomSpaceView, RoomSteward, ShareCandidates, WorkMode, PeerRequest, RequestCandidate, Routine, RoutineRun, SessionAction, SessionDetail, SessionSummary, ShareableItem, StatusCard, TrustSettings, TrustView } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls Ensemble's API with the shared session cookie. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: { ...(init.body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch {
    throw new ApiError(0, "Ensemble cannot be reached. Check your connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; code?: string };
  if (!response.ok) throw new ApiError(response.status, data.error ?? data.message ?? `Something went wrong (${response.status}).`, data.code);
  return data as T;
}

/** A response's body as a blob, saying how much has come (0–100) when its size is known. */
async function blobWithProgress(response: Response, onProgress: (percent: number) => void, expected?: number | null): Promise<Blob> {
  const total = Number(response.headers.get("content-length")) || expected || 0;
  const reader = response.body?.getReader();
  if (!reader || !total) return response.blob();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    received += value.length;
    onProgress(Math.min(99, Math.floor((received * 100) / total)));
  }
  onProgress(100);
  return new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
}

/**
 * Downloads a file from Ensemble's API with the session cookie, and saves it in the browser. With
 * `onProgress`, a large file says how much has come (its `expected` size when the server does not say).
 */
export async function download(path: string, fallbackName: string, onProgress?: (percent: number) => void, expected?: number | null): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError(0, "Ensemble cannot be reached. Check your connection and try again.");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, data.error ?? `Something went wrong (${response.status}).`);
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  let blob: Blob;
  try {
    blob = onProgress ? await blobWithProgress(response, onProgress, expected) : await response.blob();
  } catch {
    throw new ApiError(0, "The download stopped before the whole file came. Check your connection and try again.");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What `POST /api/documents` answered: the new file, or an error with the server's words. */
export function uploadResult(status: number, text: string): FileRecord {
  let data: { file?: FileRecord; error?: string; message?: string } = {};
  try {
    data = JSON.parse(text || "{}");
  } catch {
    data = {};
  }
  if (status >= 200 && status < 300 && data.file?.id) return data.file;
  if (status === 0) throw new ApiError(0, "Ensemble cannot be reached. Check your connection and try again.");
  throw new ApiError(status, data.error ?? data.message ?? (status === 413 ? "This file is too large for your Files." : `The upload failed (${status}).`));
}

/** Set on the error of an upload that was cancelled. */
export const UPLOAD_CANCELLED = "cancelled";

export const isCancelled = (error: unknown): boolean => error instanceof ApiError && error.code === UPLOAD_CANCELLED;

/**
 * Uploads a file to the person's Ensemble Files (`POST /api/documents`) with real progress (0–99 while
 * it is sent; done when the server answers). `abort` cancels it; the promise then fails with UPLOAD_CANCELLED.
 */
export function uploadFile(file: File, onProgress: (percent: number) => void): { promise: Promise<FileRecord>; abort: () => void } {
  let reader: FileReader | null = null;
  let request: XMLHttpRequest | null = null;
  let cancelled = false;
  const cancel = () => new ApiError(0, "Upload cancelled.", UPLOAD_CANCELLED);
  const promise = new Promise<FileRecord>((resolve, reject) => {
    reader = new FileReader();
    reader.onerror = () => reject(new ApiError(0, "This file could not be read from your computer."));
    reader.onabort = () => reject(cancel());
    reader.onload = () => {
      if (cancelled) return reject(cancel());
      const url = String(reader?.result ?? "");
      const xhr = new XMLHttpRequest();
      request = xhr;
      xhr.open("POST", `${ENSEMBLE_API}/api/documents`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("content-type", "application/json");
      xhr.setRequestHeader("accept", "application/json");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total) onProgress(Math.min(99, Math.floor((event.loaded / event.total) * 100)));
      };
      xhr.onload = () => {
        try {
          resolve(uploadResult(xhr.status, xhr.responseText));
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(new ApiError(0, "Ensemble cannot be reached. Check your connection and try again."));
      xhr.onabort = () => reject(cancel());
      xhr.send(JSON.stringify({ filename: file.name, mediaType: file.type || "application/octet-stream", dataBase64: url.slice(url.indexOf(",") + 1), summarize: false }));
    };
    reader.readAsDataURL(file);
  });
  return {
    promise,
    abort: () => {
      cancelled = true;
      if (reader?.readyState === FileReader.LOADING) reader.abort();
      request?.abort();
    },
  };
}

/** A file's original bytes from the person's own Files (`GET /api/documents/:id/original`). */
export async function fileOriginal(id: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${ENSEMBLE_API}/api/documents/${encodeURIComponent(id)}/original`, { credentials: "include", signal });
  if (!response.ok) throw new ApiError(response.status, `The file could not be read (${response.status}).`);
  return response.blob();
}

/**
 * A file a run attached (`GET /api/node/evidence/:id`): its owner reads it; anyone else only through the
 * message that shows it (`messageId`). Shown only when it is a safe picture (lib/evidence.ts). A held
 * file is its owner's preview, fetched from the computer that keeps it: that can take a while, and
 * fails in words when the computer is offline (504), finds it too large (413) or keeps it (409).
 */
export async function evidenceBlob(id: string, signal?: AbortSignal, messageId?: string | null): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}${evidencePath(id, messageId)}`, { credentials: "include", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, evidenceErrorWords(0));
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new ApiError(response.status, evidenceErrorWords(response.status, typeof data.error === "string" ? data.error : null));
  }
  return response.blob();
}

/**
 * The first `max` bytes of a file a run attached (a text file's preview), read like `evidenceBlob` but
 * never more: the download stops once enough has come, however large the file is.
 */
export async function evidenceHead(id: string, max: number, messageId?: string | null): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const stop = new AbortController();
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}${evidencePath(id, messageId)}`, { credentials: "include", signal: stop.signal });
  } catch {
    throw new ApiError(0, evidenceErrorWords(0));
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new ApiError(response.status, evidenceErrorWords(response.status, typeof data.error === "string" ? data.error : null));
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const whole = new Uint8Array(await response.arrayBuffer());
    return { bytes: whole.slice(0, max), truncated: whole.length > max };
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size > max) break;
  }
  const truncated = size > max;
  if (truncated) {
    await reader.cancel().catch(() => undefined);
    stop.abort();
  }
  const bytes = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const chunk of chunks) {
    if (at >= bytes.length) break;
    const part = chunk.subarray(0, bytes.length - at);
    bytes.set(part, at);
    at += part.length;
  }
  return { bytes, truncated };
}

/** The address a video player streams a run's evidence from; the session cookie goes with it. */
export const evidenceUrl = (id: string, messageId?: string | null): string => `${ENSEMBLE_API}${evidencePath(id, messageId)}`;

/** A run's evidence or a node's own captures (`GET /api/node/evidence`), and the owner's answer on a held file. */
export const evidence = {
  ofJob: (jobId: string) => api<{ evidence: CardEvidence[] }>(`/api/node/evidence?jobId=${encodeURIComponent(jobId)}`).then((result) => result.evidence),
  ofNode: (nodeId: string) => api<{ evidence: CardEvidence[] }>(`/api/node/evidence?nodeId=${encodeURIComponent(nodeId)}`).then((result) => result.evidence),
  /** Send a held file (the computer uploads it, then it is usable like any evidence) or discard it on both sides. */
  release: (id: string, decision: "approve" | "discard") => api<{ released: string[]; discarded: string[] }>(`/api/node/evidence/${encodeURIComponent(id)}/release`, { body: { decision } }),
};

/** The latest picture of a run's browser tab (`GET /api/node/live/:jobId`): a picture, why it is paused, or null when there is none. */
export async function liveFrame(jobId: string, signal?: AbortSignal): Promise<LiveFrame | null> {
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}/api/node/live/${encodeURIComponent(jobId)}`, { credentials: "include", cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "Ensemble cannot be reached. Check your connection and try again.");
  }
  const meta = liveMeta(response.headers);
  if (response.status === 204) return meta.paused ? { ...meta, image: null } : null;
  if (!response.ok) throw new ApiError(response.status, `The live view could not be read (${response.status}).`);
  const blob = await response.blob();
  if (!/^image\/jpe?g$/i.test(blob.type.split(";")[0]!.trim())) return null;
  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError(0, "The live view could not be read."));
    reader.readAsDataURL(blob);
  });
  return { ...meta, image };
}

const sessionPath = (id: string) => `/api/node/sessions/${encodeURIComponent(id)}`;

/**
 * An agent session's controls (Ensemble's node/sessions.ts; the owner's own browser session only).
 * They take the same path as a node's session tools, and the node's work board records each one.
 */
export const sessions = {
  /** My sessions, most recently active first; `q` matches titles, tasks, summaries, folders, agents and computers. */
  list: (q = "", limit = 50) => api<{ sessions: SessionSummary[] }>(`/api/node/sessions?limit=${limit}${q ? `&q=${encodeURIComponent(q.slice(0, 200))}` : ""}`).then((result) => result.sessions),
  get: (id: string) => api<{ session: SessionDetail }>(sessionPath(id)).then((result) => result.session),
  /** queue, steer, replace (stop and send this instead) or stop (`queued`: keep or drop what waits). */
  control: (id: string, body: SessionAction) => api<{ ok: true; jobId?: string }>(`${sessionPath(id)}/control`, { body }),
  /** The queued messages' job ids in their new order. */
  reorder: (id: string, order: string[]) => api<{ ok: true }>(`${sessionPath(id)}/queue`, { body: { order } }),
  cancel: (id: string, jobId: string) => api<void>(`${sessionPath(id)}/queue/${encodeURIComponent(jobId)}`, { method: "DELETE" }),
  /** Hands the session to another of my lasting nodes (or gives one no node manages to it). */
  handOver: (id: string, nodeId: string) => api<{ ok: true; nodeId: string }>(`${sessionPath(id)}/hand-over`, { body: { nodeId } }),
};

const routinePath = (id: string) => `/api/node/routines/${encodeURIComponent(id)}`;

/**
 * The owner's routines (Ensemble docs/35 §6.5). A webhook routine's token comes back only from
 * `create` and `token`, once: it is shown then and never kept.
 */
export const routines = {
  list: () => api<{ routines: Routine[] }>("/api/node/routines").then((result) => result.routines),
  create: (body: Record<string, unknown>) => api<{ routine: Routine; token?: string }>("/api/node/routines", { body }),
  update: (id: string, body: Record<string, unknown>) => api<{ routine: Routine }>(routinePath(id), { method: "PATCH", body }).then((result) => result.routine),
  remove: (id: string) => api<void>(routinePath(id), { method: "DELETE" }),
  /** Runs it now, whatever its trigger, paused or not. */
  run: (id: string) => api<{ run: RoutineRun }>(`${routinePath(id)}/run`, { body: {} }).then((result) => result.run),
  /** A new webhook token; the old one stops working. */
  token: (id: string) => api<{ token: string }>(`${routinePath(id)}/token`, { body: {} }).then((result) => result.token),
  /** Its newest 50 runs, each with its mission's status. */
  runs: (id: string) => api<{ runs: RoutineRun[] }>(`${routinePath(id)}/runs`).then((result) => result.runs),
};

/** One message I may see (`GET /api/node/messages/:id`). */
export const messageById = (id: string) => api<{ message: Message }>(`/api/node/messages/${encodeURIComponent(id)}`).then((result) => result.message);

const sudoPath = (messageId: string) => `/api/node/sudo/${encodeURIComponent(messageId)}`;

/** A command a node wants to run as administrator: what the computer would run and how a password reaches it, and the owner's answer (lib/sudo.ts). */
export const sudoCards = {
  target: (messageId: string) => api<SudoTarget>(sudoPath(messageId)),
  answer: (messageId: string, body: SudoAnswer) => api<{ message: Message }>(sudoPath(messageId), { body }).then((result) => result.message),
};

/** The owner's own Ensemble settings, the parts Node reads (lib/owner-settings.ts); a change sends only what changed and is merged there. */
export const ownerSettings = {
  get: () => api<{ settings: OwnerSettings }>("/api/settings").then((result) => result.settings),
  save: (patch: Record<string, unknown>) => api<{ settings: OwnerSettings }>("/api/settings", { method: "PATCH", body: patch }).then((result) => result.settings),
};

/** A plan card (or a routine's run) with its steps' run cards, which are not in the timeline (`GET /api/node/plans/:id`). */
export const planById = (id: string) => api<{ message: Message; runs: Message[] }>(`/api/node/plans/${encodeURIComponent(id)}`);

const roomPath = (id: string) => `/api/node/rooms/${encodeURIComponent(id)}`;

/** A person's own settings in a room with other people, its status cards and its peer requests (Ensemble docs/35 §12). */
export const peopleRooms = {
  /** Every person's status card as I may see it; my own in full. */
  status: (roomId: string) => api<{ cards: StatusCard[] }>(`${roomPath(roomId)}/status`).then((result) => result.cards),
  /** I am away (until a time, with a note) or back. */
  setAway: (roomId: string, body: { away: boolean; until?: string | null; note?: string | null }) => api<{ card: StatusCard }>(`${roomPath(roomId)}/status`, { method: "PUT", body }).then((result) => result.card),
  trust: (roomId: string) => api<{ trust: TrustView }>(`${roomPath(roomId)}/trust`).then((result) => result.trust),
  /** `people[id]: null` takes back that person's own settings. */
  setTrust: (roomId: string, body: { everyone?: Partial<TrustSettings>; people?: Record<string, Partial<TrustSettings> | null>; budget?: number | null }) =>
    api<{ trust: TrustView }>(`${roomPath(roomId)}/trust`, { method: "PUT", body }).then((result) => result.trust),
  shareable: (roomId: string) => api<{ items: ShareableItem[] }>(`${roomPath(roomId)}/shareable`).then((result) => result.items),
  setShareable: (roomId: string, body: { kind: ShareableItem["kind"]; id: string; spaceId?: string; shared: boolean }) =>
    api<{ items: ShareableItem[] }>(`${roomPath(roomId)}/shareable`, { method: "PUT", body }).then((result) => result.items),
  requests: (roomId: string) => api<{ requests: PeerRequest[] }>(`${roomPath(roomId)}/requests`).then((result) => result.requests),
  request: (roomId: string, body: { to: string; kind: PeerKind; text: string; candidate?: RequestCandidate }) =>
    api<{ request: PeerRequest }>(`${roomPath(roomId)}/requests`, { body }).then((result) => result.request),
  /** What I could mark shareable, or give a role: my space and the room's linked space; `q` searches titles. */
  candidates: (roomId: string, q = "") => api<ShareCandidates>(`${roomPath(roomId)}/shareable/candidates${q ? `?q=${encodeURIComponent(q.slice(0, 100))}` : ""}`),
};

/** The space that holds a room's work (Ensemble docs/35 §12.11–12.14): linking it, its board and pages, decisions, the steward, my preferences. */
export const roomWork = {
  space: (roomId: string) => api<RoomSpaceView>(`${roomPath(roomId)}/space`),
  /** The room's creator links a space they own, or makes one for the room. */
  link: (roomId: string, body: { spaceId: string } | { create: true; name?: string }) => api<RoomSpaceView>(`${roomPath(roomId)}/space`, { method: "PUT", body }),
  unlink: (roomId: string) => api<{ ok: boolean }>(`${roomPath(roomId)}/space`, { method: "DELETE" }),
  /** My answer to the offer to join the room's space as an editor. */
  join: (roomId: string, join: boolean) => api<RoomSpaceView>(`${roomPath(roomId)}/space/join`, { body: { join } }),
  board: (roomId: string) => api<RoomBoard>(`${roomPath(roomId)}/board`),
  pages: (roomId: string) => api<{ pages: RoomPage[] }>(`${roomPath(roomId)}/pages`).then((result) => result.pages),
  setPageRole: (roomId: string, pageId: string, role: PageRole) => api<{ pages: RoomPage[] }>(`${roomPath(roomId)}/pages/${encodeURIComponent(pageId)}`, { method: "PUT", body: { role } }).then((result) => result.pages),
  watchPage: (roomId: string, pageId: string, watching: boolean) => api<{ pages: RoomPage[] }>(`${roomPath(roomId)}/pages/${encodeURIComponent(pageId)}/watch`, { method: "PUT", body: { watching } }).then((result) => result.pages),
  decisions: (roomId: string) => api<{ decisions: RoomDecision[] }>(`${roomPath(roomId)}/decisions`).then((result) => result.decisions),
  steward: (roomId: string) => api<{ steward: RoomSteward | null }>(`${roomPath(roomId)}/steward`).then((result) => result.steward),
  setSteward: (roomId: string, nodeId: string) => api<{ steward: RoomSteward }>(`${roomPath(roomId)}/steward`, { method: "PUT", body: { nodeId } }).then((result) => result.steward),
  endSteward: (roomId: string) => api<{ steward: null }>(`${roomPath(roomId)}/steward`, { method: "DELETE" }),
  prefs: (roomId: string) => api<{ prefs: RoomPrefs }>(`${roomPath(roomId)}/prefs`).then((result) => result.prefs),
  setPrefs: (roomId: string, body: Partial<RoomPrefs>) => api<{ prefs: RoomPrefs }>(`${roomPath(roomId)}/prefs`, { method: "PUT", body }).then((result) => result.prefs),
  /** Starts one of my tasks on the room's board: my lead plans it in My crew (its turn; the plan follows on the board's row). */
  startTask: (roomId: string, taskId: string, mode: WorkMode) => api<{ started: boolean; taskId: string; turnId: string | null }>(`${roomPath(roomId)}/tasks/${encodeURIComponent(taskId)}/start`, { body: { mode } }),
  /** Says no to a task proposed to me (a request's is declined as the request). */
  declineTask: (roomId: string, taskId: string, note?: string) =>
    api<{ task: { id: string; status: string } }>(`${roomPath(roomId)}/tasks/${encodeURIComponent(taskId)}/decline`, { body: note?.trim() ? { note: note.trim() } : {} }).then((result) => result.task),
};

/** The spaces I own (`GET /api/spaces`): any of them can hold a room's work. */
export const ownSpaces = () =>
  api<{ spaces: Array<{ id: string; name: string; primary?: boolean }> }>("/api/spaces").then((result) => result.spaces.map((row): OwnSpace => ({ id: row.id, name: row.name, primary: row.primary === true })));

/** A peer request's decisions: its target accepts (optionally edited, optionally always) or declines; its asker cancels. */
export const peerRequests = {
  accept: (id: string, body: { text?: string; always?: boolean; mode?: WorkMode }) => api<{ request: PeerRequest }>(`/api/node/requests/${encodeURIComponent(id)}/accept`, { body }).then((result) => result.request),
  decline: (id: string, body: { note?: string }) => api<{ request: PeerRequest }>(`/api/node/requests/${encodeURIComponent(id)}/decline`, { body }).then((result) => result.request),
  cancel: (id: string) => api<{ request: PeerRequest }>(`/api/node/requests/${encodeURIComponent(id)}/cancel`, { body: {} }).then((result) => result.request),
};

/** Share to room: one of my private messages, or my own node's private reply, published as me or through my lead. */
export const shareToRoom = (messageId: string, as: "me" | "lead") => api<{ message: Message }>(`/api/node/messages/${encodeURIComponent(messageId)}/share`, { body: { as } }).then((result) => result.message);

export const oauthStartUrl = (provider: string): string => `${ENSEMBLE_API}/api/auth/oauth/${provider}/start?return=node`;

export const eventsUrl = (): string => `${ENSEMBLE_API}/api/node/events`;
