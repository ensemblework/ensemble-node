import { ENSEMBLE_API } from "./config";
import { evidencePath } from "./evidence";
import type { FileRecord, Message, PeerKind, PeerRequest, RequestCandidate, Routine, RoutineRun, SessionAction, SessionDetail, ShareableItem, StatusCard, TrustSettings, TrustView } from "./types";

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
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: init.body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
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

/** Downloads a file from Ensemble's API with the session cookie, and saves it in the browser. */
export async function download(path: string, fallbackName: string): Promise<void> {
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
  const url = URL.createObjectURL(await response.blob());
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
 * message that shows it (`messageId`). Shown only when it is a safe picture (lib/evidence.ts).
 */
export async function evidenceBlob(id: string, signal?: AbortSignal, messageId?: string | null): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${ENSEMBLE_API}${evidencePath(id, messageId)}`, { credentials: "include", signal });
  } catch {
    throw new ApiError(0, "Ensemble cannot be reached. Check your connection and try again.");
  }
  if (!response.ok) throw new ApiError(response.status, response.status === 404 ? "This file is not available any more." : `The file could not be read (${response.status}).`);
  return response.blob();
}

/** The address a video player streams a run's evidence from; the session cookie goes with it. */
export const evidenceUrl = (id: string, messageId?: string | null): string => `${ENSEMBLE_API}${evidencePath(id, messageId)}`;

const sessionPath = (id: string) => `/api/node/sessions/${encodeURIComponent(id)}`;

/**
 * An agent session's controls (Ensemble's node/sessions.ts; the owner's own browser session only).
 * They take the same path as a node's session tools, and the node's work board records each one.
 */
export const sessions = {
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
};

/** A peer request's decisions: its target accepts (optionally edited, optionally always) or declines; its asker cancels. */
export const peerRequests = {
  accept: (id: string, body: { text?: string; always?: boolean }) => api<{ request: PeerRequest }>(`/api/node/requests/${encodeURIComponent(id)}/accept`, { body }).then((result) => result.request),
  decline: (id: string, body: { note?: string }) => api<{ request: PeerRequest }>(`/api/node/requests/${encodeURIComponent(id)}/decline`, { body }).then((result) => result.request),
  cancel: (id: string) => api<{ request: PeerRequest }>(`/api/node/requests/${encodeURIComponent(id)}/cancel`, { body: {} }).then((result) => result.request),
};

/** Share to room: one of my private messages, or my own node's private reply, published as me or through my lead. */
export const shareToRoom = (messageId: string, as: "me" | "lead") => api<{ message: Message }>(`/api/node/messages/${encodeURIComponent(messageId)}/share`, { body: { as } }).then((result) => result.message);

export const oauthStartUrl = (provider: string): string => `${ENSEMBLE_API}/api/auth/oauth/${provider}/start?return=node`;

export const eventsUrl = (): string => `${ENSEMBLE_API}/api/node/events`;
