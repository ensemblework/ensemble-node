import { ENSEMBLE_API } from "./config";

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

export const oauthStartUrl = (provider: string): string => `${ENSEMBLE_API}/api/auth/oauth/${provider}/start?return=node`;

export const eventsUrl = (): string => `${ENSEMBLE_API}/api/node/events`;
