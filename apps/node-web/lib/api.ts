import { ENSEMBLE_API } from "./config";
import type { FileRecord } from "./types";

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

export const oauthStartUrl = (provider: string): string => `${ENSEMBLE_API}/api/auth/oauth/${provider}/start?return=node`;

export const eventsUrl = (): string => `${ENSEMBLE_API}/api/node/events`;
