/**
 * Routines as the website reads and writes them (Ensemble docs/35 §6.5; build block B14). A schedule is
 * picked from presets and becomes a five-field cron here, and a cron that is one of them reads back as
 * its preset. The form's draft becomes the body Ensemble takes, after the checks below; Ensemble checks
 * everything again and has the last word (its `when` is shown once a routine is saved). Also: a run's
 * status in words, when a routine runs next, where it may report, time zones and its webhook address.
 */
import { missionView, type Badge } from "./plan";
import type { Room, Routine, RoutineNotify, RoutineRun, RoutineTrigger } from "./types";

export type SchedulePreset = "daily" | "weekdays" | "weekly" | "monthly" | "hourly" | "custom";
/** `time` is "HH:MM" (daily, weekdays, weekly, monthly); `minute` is for hourly; `cron` for custom. */
export type Schedule = { preset: SchedulePreset; time: string; weekday: number; day: number; minute: number; cron: string };

export const SCHEDULE_PRESETS: ReadonlyArray<{ id: SchedulePreset; label: string }> = [
  { id: "daily", label: "Every day at" },
  { id: "weekdays", label: "Weekdays at" },
  { id: "weekly", label: "Every week on" },
  { id: "monthly", label: "Every month on" },
  { id: "hourly", label: "Every hour at" },
  { id: "custom", label: "Custom (cron)" },
];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const DEFAULT_SCHEDULE: Schedule = { preset: "weekdays", time: "09:00", weekday: 1, day: 1, minute: 0, cron: "" };

const pad = (value: number) => String(value).padStart(2, "0");
const whole = (text: string | undefined, min: number, max: number): number | null => {
  if (!text || !/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
};
const within = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

/** "09:00" or "9:05" as hours and minutes; null when it is not a time of day. */
export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Cron's own names for common schedules, as Ensemble reads them. */
const ALIASES: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

/** A cron with single spaces, trimmed. */
export const tidyCron = (text: string): string => text.trim().replace(/\s+/g, " ");

/** The five-field cron of a schedule; null while one of its fields is not valid (see `scheduleProblem`). */
export function scheduleCron(schedule: Schedule): string | null {
  if (schedule.preset === "custom") return cronProblem(schedule.cron) ? null : tidyCron(schedule.cron);
  if (schedule.preset === "hourly") return within(schedule.minute, 0, 59) ? `${schedule.minute} * * * *` : null;
  const time = parseTime(schedule.time);
  if (!time) return null;
  const at = `${time.minute} ${time.hour}`;
  if (schedule.preset === "daily") return `${at} * * *`;
  if (schedule.preset === "weekdays") return `${at} * * 1-5`;
  if (schedule.preset === "weekly") return within(schedule.weekday, 0, 6) ? `${at} * * ${schedule.weekday}` : null;
  return within(schedule.day, 1, 31) ? `${at} ${schedule.day} * *` : null;
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** A single day of the week in a cron field (0–7 or a name; 7 is Sunday too). */
function weekdayOf(text: string): number | null {
  const lower = text.toLowerCase();
  if (/^[0-7]$/.test(lower)) return Number(lower) % 7;
  const named = /^[a-z]+$/.test(lower) ? DAY_NAMES.indexOf(lower.slice(0, 3)) : -1;
  return named >= 0 ? named : null;
}

const isWeekdays = (text: string) => ["1-5", "mon-fri", "1,2,3,4,5"].includes(text.toLowerCase());

/** The preset a cron is, when it is one (with its time); otherwise a custom schedule holding the cron. */
export function cronSchedule(cron: string | null | undefined): Schedule {
  const written = tidyCron(cron ?? "");
  const text = ALIASES[written.toLowerCase()] ?? written;
  const custom: Schedule = { ...DEFAULT_SCHEDULE, preset: "custom", cron: written };
  const parts = text.split(" ");
  if (parts.length !== 5) return custom;
  const [m, h, dom, month, dow] = parts as [string, string, string, string, string];
  const minute = whole(m, 0, 59);
  if (minute === null || month !== "*") return custom;
  if (h === "*") return dom === "*" && dow === "*" ? { ...DEFAULT_SCHEDULE, preset: "hourly", minute, cron: written } : custom;
  const hour = whole(h, 0, 23);
  if (hour === null) return custom;
  const base: Schedule = { ...DEFAULT_SCHEDULE, time: `${pad(hour)}:${pad(minute)}`, minute, cron: written };
  if (dom === "*" && dow === "*") return { ...base, preset: "daily" };
  if (dom === "*" && isWeekdays(dow)) return { ...base, preset: "weekdays" };
  const weekday = dom === "*" ? weekdayOf(dow) : null;
  if (weekday !== null) return { ...base, preset: "weekly", weekday };
  const day = dow === "*" ? whole(dom, 1, 31) : null;
  if (day !== null) return { ...base, preset: "monthly", day };
  return custom;
}

const FIELDS: ReadonlyArray<{ name: string; min: number; max: number; names?: readonly string[] }> = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] },
  { name: "day of week", min: 0, max: 7, names: DAY_NAMES },
];

function fieldProblem(text: string, field: (typeof FIELDS)[number]): string | null {
  if (text === "*" || text === "?") return null;
  const value = (part: string) => {
    const lower = part.toLowerCase();
    if (field.names && /^[a-z]+$/.test(lower) && field.names.includes(lower.slice(0, 3))) return true;
    return /^\d+$/.test(part) && Number(part) >= field.min && Number(part) <= field.max;
  };
  for (const part of text.split(",")) {
    const [range, step] = part.split("/");
    if (step !== undefined && !(/^\d+$/.test(step) && Number(step) > 0)) return `“${part}” has a step that is not a whole number above 0.`;
    if (range === "*") continue;
    const ends = (range ?? "").split("-");
    if (ends.length > 2 || !ends.every((end) => end && value(end))) return `“${part}” is not a valid ${field.name} (${field.min}–${field.max}).`;
  }
  return null;
}

/** What is wrong with a cron, in words; null when it reads as a schedule. Ensemble checks it again. */
export function cronProblem(cron: string): string | null {
  const text = tidyCron(cron);
  if (!text) return "Write a schedule, for example 0 9 * * 1-5 (weekdays at 09:00).";
  if (text.startsWith("@")) return ALIASES[text.toLowerCase()] ? null : `“${text}” is not a schedule Ensemble knows.`;
  const parts = text.split(" ");
  if (parts.length !== 5) return "A schedule has five fields: minute, hour, day of month, month and day of week (for example 0 9 * * 1-5).";
  for (const [at, part] of parts.entries()) {
    const problem = fieldProblem(part, FIELDS[at]!);
    if (problem) return problem;
  }
  return null;
}

/** What is missing from a schedule before it can be saved; null when it is complete. */
export function scheduleProblem(schedule: Schedule): string | null {
  if (schedule.preset === "custom") return cronProblem(schedule.cron);
  if (schedule.preset === "hourly") return within(schedule.minute, 0, 59) ? null : "Pick a minute from 0 to 59.";
  if (!parseTime(schedule.time)) return "Pick a time, for example 09:00.";
  if (schedule.preset === "weekly" && !within(schedule.weekday, 0, 6)) return "Pick a day of the week.";
  if (schedule.preset === "monthly" && !within(schedule.day, 1, 31)) return "Pick a day from 1 to 31.";
  return null;
}

/** A note on a schedule that runs less often than it seems: day 29–31 skips the months without it. */
export function scheduleNote(schedule: Schedule): string | null {
  return schedule.preset === "monthly" && schedule.day > 28 && schedule.day <= 31 ? `Months without a day ${schedule.day} are skipped.` : null;
}

/** A schedule in words, the way Ensemble words it once saved ("Weekdays at 09:00 (Asia/Kolkata)"). */
export function scheduleText(schedule: Schedule, zone: string): string {
  const cron = scheduleCron(schedule);
  if (!cron) return "";
  const time = parseTime(schedule.time);
  const at = time ? `${pad(time.hour)}:${pad(time.minute)}` : "";
  switch (schedule.preset) {
    case "daily":
      return `Every day at ${at} (${zone})`;
    case "weekdays":
      return `Weekdays at ${at} (${zone})`;
    case "weekly":
      return `Every ${WEEKDAYS[schedule.weekday]} at ${at} (${zone})`;
    case "monthly":
      return `Every month on day ${schedule.day} at ${at} (${zone})`;
    case "hourly":
      return `Every hour at :${pad(schedule.minute)}`;
    default:
      return `${cron} (${zone})`;
  }
}

// ---------------------------------------------------------------------------------------------
// Time zones

/** Zones offered when the browser cannot list its own. */
const FALLBACK_ZONES = ["UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Africa/Lagos", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];

/** Every time zone the browser knows, UTC first. */
export function timeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  try {
    const list = intl.supportedValuesOf?.("timeZone");
    if (list?.length) return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    // An older browser: the short list below.
  }
  return FALLBACK_ZONES;
}

/** The browser's own time zone: a new routine's default. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Whether a time zone exists for this browser (Ensemble checks it the same way). */
export function isTimeZone(zone: string): boolean {
  if (!zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone.trim() }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Places whose zone still has its older name in some browsers, so a search for the new one finds it. */
const ALSO_KNOWN_AS: Record<string, string> = { "asia/calcutta": "kolkata", "europe/kiev": "kyiv", "asia/saigon": "ho chi minh", "asia/rangoon": "yangon", "asia/katmandu": "kathmandu", "america/godthab": "nuuk" };

const plainZone = (text: string) => text.trim().toLowerCase().replace(/_/g, " ");

/** Zones matching a search ("kolkata", "new york", "europe/"): a city or name that starts with it first, then any that contain it. */
export function matchTimeZones(zones: readonly string[], query: string, limit = 50): string[] {
  const q = plainZone(query);
  if (!q) return zones.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const zone of zones) {
    const name = plainZone(zone);
    const also = ALSO_KNOWN_AS[zone.toLowerCase()] ?? "";
    const city = name.split("/").at(-1) ?? name;
    if (name.startsWith(q) || city.startsWith(q) || also.startsWith(q)) starts.push(zone);
    else if (name.includes(q) || also.includes(q)) contains.push(zone);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** "GMT+5:30" for a zone now; empty when the browser cannot say. */
export function zoneOffset(zone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------------------------
// The form

export const EVENT_ACTIONS: Record<"task" | "page", ReadonlyArray<{ id: string; label: string }>> = {
  task: [
    { id: "create", label: "Created" },
    { id: "update", label: "Updated" },
    { id: "move", label: "Moved" },
    { id: "assign", label: "Assigned" },
    { id: "delete", label: "Deleted" },
    { id: "agent", label: "Agent run" },
  ],
  page: [
    { id: "create", label: "Created" },
    { id: "save", label: "Saved" },
    { id: "delete", label: "Deleted" },
  ],
};

export const NOTIFY: ReadonlyArray<{ id: RoutineNotify; title: string; hint: string; short: string }> = [
  { id: "always", title: "Always post the result", hint: "the node posts what it did, every time.", short: "Posts every result" },
  { id: "needed", title: "Only when something needs me", hint: "it posts when something failed, changed or needs you.", short: "Posts when it needs you" },
  { id: "never", title: "Never post (keep a log)", hint: "nothing is posted; each run is listed here.", short: "Keeps a log" },
];

export const notifyShort = (notify: string): string => NOTIFY.find((row) => row.id === notify)?.short ?? notify;

/** The routine form's fields as typed. `roomId` "" leaves where it reports to Ensemble (the node's chat). */
export type RoutineDraft = {
  title: string;
  nodeId: string;
  roomId: string;
  what: "instruction" | "plan";
  instruction: string;
  template: string;
  trigger: RoutineTrigger;
  schedule: Schedule;
  timezone: string;
  /** `space` as typed (a name or an id); `watched`: the space it watched when the form opened, shown by its name. */
  event: { on: "task" | "page"; actions: string[]; space: string; windowSeconds: string; watched?: { id: string; name: string } };
  notify: RoutineNotify;
};

export function newDraft(nodeId: string, timezone: string, roomId = ""): RoutineDraft {
  return {
    title: "",
    nodeId,
    roomId,
    what: "instruction",
    instruction: "",
    template: "",
    trigger: "schedule",
    schedule: { ...DEFAULT_SCHEDULE },
    timezone,
    event: { on: "task", actions: [], space: "", windowSeconds: "60" },
    notify: "always",
  };
}

/** The space an event routine watches, by name, when it is not the owner's own ("Acme"); null otherwise. */
export function watchedSpace(routine: Pick<Routine, "trigger" | "event">, meId: string): string | null {
  const event = routine.trigger === "event" ? routine.event : null;
  if (!event?.space || event.space === meId) return null;
  return event.spaceName?.trim() || "another space";
}

/** A routine as its form shows it. The space an event routine watches shows by its name, and empty when it is the owner's own. */
export function draftOf(routine: Routine, meId: string): RoutineDraft {
  const event = routine.event;
  const other = event?.space && event.space !== meId ? event.space : null;
  const name = other && event?.spaceName?.trim() ? event.spaceName.trim() : null;
  return {
    title: routine.title,
    nodeId: routine.nodeId,
    roomId: routine.roomId,
    what: routine.action === "plan" ? "plan" : "instruction",
    instruction: routine.instruction ?? "",
    template: routine.template ? JSON.stringify(routine.template, null, 2) : "",
    trigger: routine.trigger,
    schedule: routine.cron ? cronSchedule(routine.cron) : { ...DEFAULT_SCHEDULE },
    timezone: routine.timezone,
    event: {
      on: event?.on === "page" ? "page" : "task",
      actions: [...(event?.actions ?? [])],
      space: name ?? other ?? "",
      windowSeconds: String(event?.windowSeconds ?? 60),
      ...(other && name ? { watched: { id: other, name } } : {}),
    },
    notify: routine.notify,
  };
}

/** A saved plan as typed: a JSON object with a goal and steps (Ensemble checks the rest, as for node_plan). */
export function parseTemplate(text: string): { value: Record<string, unknown> } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Paste a saved plan: JSON with a goal and steps." };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    return { error: `That is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "A saved plan is a JSON object with a goal and steps." };
  const plan = value as Record<string, unknown>;
  if (typeof plan.goal !== "string" || !plan.goal.trim()) return { error: "The plan needs a goal." };
  if (!Array.isArray(plan.steps) || !plan.steps.length) return { error: "The plan needs at least one step." };
  return { value: plan };
}

export type DraftField = "title" | "nodeId" | "instruction" | "template" | "schedule" | "timezone" | "window";

/** What must change before the draft can be saved, by field. Empty when it can be. */
export function draftProblems(draft: RoutineDraft): Partial<Record<DraftField, string>> {
  const problems: Partial<Record<DraftField, string>> = {};
  if (!draft.title.trim()) problems.title = "Give it a title.";
  else if (draft.title.trim().length > 120) problems.title = "At most 120 characters.";
  if (!draft.nodeId) problems.nodeId = "Pick the node that does it.";
  if (draft.what === "instruction") {
    if (!draft.instruction.trim()) problems.instruction = "Say what it should do each time.";
    else if (draft.instruction.trim().length > 4000) problems.instruction = "At most 4,000 characters.";
  } else {
    const parsed = parseTemplate(draft.template);
    if ("error" in parsed) problems.template = parsed.error;
  }
  if (draft.trigger === "schedule") {
    const problem = scheduleProblem(draft.schedule);
    if (problem) problems.schedule = problem;
    if (!isTimeZone(draft.timezone)) problems.timezone = `“${draft.timezone.trim()}” is not a time zone (use one like Europe/London or Asia/Kolkata).`;
  }
  if (draft.trigger === "event") {
    const seconds = Number(draft.event.windowSeconds);
    if (!/^\d+$/.test(draft.event.windowSeconds.trim()) || seconds < 10 || seconds > 86_400) problems.window = "From 10 seconds to 86,400 (a day).";
  }
  return problems;
}

function whatBody(draft: RoutineDraft): Record<string, unknown> {
  if (draft.what === "instruction") return { instruction: draft.instruction.trim() };
  const parsed = parseTemplate(draft.template);
  return "value" in parsed ? { template: parsed.value } : {};
}

function triggerBody(draft: RoutineDraft): Record<string, unknown> {
  if (draft.trigger === "schedule") return { cron: scheduleCron(draft.schedule) };
  if (draft.trigger !== "event") return {};
  const known = new Set(EVENT_ACTIONS[draft.event.on].map((row) => row.id));
  const actions = draft.event.actions.filter((action) => known.has(action));
  // A space left as it showed goes back by its id: two spaces may share a name.
  const typed = draft.event.space.trim();
  const space = typed && draft.event.watched && typed === draft.event.watched.name ? draft.event.watched.id : typed;
  return {
    event: {
      on: draft.event.on,
      ...(actions.length ? { actions } : {}),
      ...(space ? { space } : {}),
      windowSeconds: Number(draft.event.windowSeconds),
    },
  };
}

/** `POST /api/node/routines`: exactly one of instruction or template, and what its trigger needs. */
export function createBody(draft: RoutineDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    nodeId: draft.nodeId,
    ...(draft.roomId ? { roomId: draft.roomId } : {}),
    ...whatBody(draft),
    trigger: draft.trigger,
    // The time zone is the routine's clock for every trigger (its runs are told the time in it).
    timezone: draft.timezone.trim(),
    ...triggerBody(draft),
    notify: draft.notify,
  };
}

/** `PATCH /api/node/routines/:id` from the form (its node cannot change); where it reports only when that changed. */
export function patchBody(draft: RoutineDraft, before: RoutineDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    ...(draft.roomId && draft.roomId !== before.roomId ? { roomId: draft.roomId } : {}),
    ...whatBody(draft),
    trigger: draft.trigger,
    ...(draft.trigger === "schedule" ? { timezone: draft.timezone.trim() } : {}),
    ...triggerBody(draft),
    notify: draft.notify,
  };
}

// ---------------------------------------------------------------------------------------------
// Lists and runs

/** Where a node's routine may report: its own chat first, then the crews (and rooms) it is in where only its owner reads. */
export function reportRooms(rooms: readonly Room[], nodeId: string, meId: string): Array<{ id: string; title: string; chat: boolean }> {
  const fit = rooms.filter(
    (room) => room.kind !== "task" && room.members.some((member) => member.kind === "node" && member.node.id === nodeId) && room.members.every((member) => member.kind !== "person" || member.accountId === meId),
  );
  const chat = fit.filter((room) => room.kind === "dm").map((room) => ({ id: room.id, title: room.title, chat: true }));
  const groups = fit
    .filter((room) => room.kind !== "dm")
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((room) => ({ id: room.id, title: room.title, chat: false }));
  return [...chat, ...groups];
}

/** Routines grouped by their node, in the order of `nodes`; a node not in it goes last. */
export function routinesByNode<N extends { id: string }>(routines: readonly Routine[], nodes: readonly N[]): Array<{ nodeId: string; node: N | null; routines: Routine[] }> {
  const groups = new Map<string, Routine[]>();
  for (const routine of routines) groups.set(routine.nodeId, [...(groups.get(routine.nodeId) ?? []), routine]);
  const rank = (id: string) => {
    const at = nodes.findIndex((node) => node.id === id);
    return at < 0 ? nodes.length : at;
  };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([nodeId, list]) => ({ nodeId, node: nodes.find((node) => node.id === nodeId) ?? null, routines: list }));
}

/** A run's status in words: before it starts, then its mission's status once it has one. */
export function runBadge(run: Pick<RoutineRun, "status" | "missionStatus">): Badge {
  if (run.status === "pending") return { label: "Waiting", tone: "muted" };
  if (run.status === "starting") return { label: "Starting", tone: "accent" };
  if (run.status === "skipped") return { label: "Skipped", tone: "muted" };
  if (run.status === "failed") return { label: "Failed", tone: "danger" };
  if (!run.missionStatus) return { label: "Started", tone: "accent" };
  const mission = missionView(run.missionStatus);
  return { label: mission.label, tone: mission.tone };
}

/** Whether a run is still going (or still to start). */
export function runLive(run: Pick<RoutineRun, "status" | "missionStatus">): boolean {
  if (run.status === "pending" || run.status === "starting") return true;
  return run.status === "started" && (!run.missionStatus || missionView(run.missionStatus).live);
}

const RUN_TRIGGER: Record<string, string> = { schedule: "On schedule", event: "On a change", webhook: "Webhook", manual: "By hand" };

export const runTrigger = (trigger: string): string => RUN_TRIGGER[trigger] ?? trigger;

/** What a run gathered: "3 changes", "1 call"; empty when nothing. */
export function itemsText(run: Pick<RoutineRun, "trigger" | "items">): string {
  if (!run.items) return "";
  const noun = run.trigger === "webhook" ? "call" : run.trigger === "event" ? "change" : "item";
  return `${run.items} ${noun}${run.items === 1 ? "" : "s"}`;
}

/** Time until `iso`: "in 5m", "in 3h", "in 2d"; "now" when it is due; a date after a week. */
export function untilText(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 45) return "now";
  if (seconds < 3600) return `in ${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) return `in ${Math.round(seconds / 3600)}h`;
  if (seconds < 7 * 86_400) return `in ${Math.round(seconds / 86_400)}d`;
  return `on ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** A routine's webhook address: the API's origin and the routine's path. */
export function webhookUrl(api: string, path: string): string {
  let origin = api.trim().replace(/\/+$/, "");
  try {
    origin = new URL(origin).origin;
  } catch {
    // Not a full address: keep it as written.
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
