/**
 * A coding run's trace as a work log. Each run step becomes an entry (a command, an edit, a read, a
 * search, thinking…); consecutive entries collapse into a group with a one-line summary ("Ran 6
 * commands, edited 3 files"); the engine's own messages and notable milestones sit between groups.
 *
 * The grouping, the summary wording and the elapsed-time format are adapted from T3 Code's work
 * log (MIT License, Copyright (c) 2026 T3 Tools Inc.).
 */
import { TOOL_LABEL } from "./text";
import type { AgentJob, JobEvent, RunStep, RunToolCall, ToolChip } from "./types";

export type WorkKind = "command" | "edit" | "read" | "search" | "web" | "fetch" | "mcp" | "question" | "agent" | "thinking" | "tool";

export type WorkEntry = {
  id: string;
  kind: WorkKind;
  /** One line: the command, "Edited src/app.ts", "Searched for “login”". */
  label: string;
  /** The whole command line, for a command. */
  command: string | null;
  /** Files an edit touched. */
  files: string[];
  /** Before and after of an edit, when the arguments show them. */
  diff: { removed: string; added: string } | null;
  /** The arguments as the engine gave them, when they say more than the label. */
  detail: string | null;
  /** What came back (a preview), or the reasoning of a thinking entry. */
  output: string | null;
  error: string | null;
  status: "running" | "done" | "failed" | "skipped";
  ms: number | null;
  at: string | null;
};

export type WorkGroup = { kind: "group"; id: string; entries: WorkEntry[]; summary: string; failed: number; running: boolean; ms: number | null };
export type WorkItem =
  | WorkGroup
  | { kind: "message"; id: string; text: string; at: string | null }
  | { kind: "note"; id: string; tone: "info" | "warn"; text: string; at: string | null };

export type WorkLog = { items: WorkItem[]; result: string | null; tools: number };

export const RUN_ENDED: ReadonlySet<string> = new Set(["succeeded", "failed", "cancelled", "interrupted"]);
export const runEnded = (status: string | null | undefined): boolean => Boolean(status && RUN_ENDED.has(status));

/** The freshest status of a run: an ended status wins, then the job's (polled), then the card's. */
export function runStatus(card: string | null | undefined, job: string | null | undefined): string {
  if (runEnded(job)) return job!;
  if (runEnded(card)) return card!;
  return job ?? card ?? "queued";
}

/** Ensemble's coding engines (its ENGINE_LABELS). */
const ENGINES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "cursor-agent": "Cursor",
  "copilot-cli": "GitHub Copilot",
  "grok-cli": "Grok Build",
  opencode: "OpenCode",
  "gemini-cli": "Gemini CLI",
  antigravity: "Antigravity",
};

/** Which harness runs the job: a coding agent on the computer, or Ensemble's own agent. */
export function engineLabel(job: Pick<AgentJob, "kind" | "provider">): string {
  return job.kind === "code" && job.provider && ENGINES[job.provider] ? ENGINES[job.provider]! : "Ensemble's agent";
}

/** An engine by its id or name, as people read it: "copilot-cli" → "GitHub Copilot", "ensemble" → "Ensemble's agent". */
export function engineName(engine: string | null | undefined): string | null {
  const value = (engine ?? "").trim();
  if (!value) return null;
  if (ENGINES[value]) return ENGINES[value]!;
  return value === "ensemble" ? "Ensemble's agent" : value;
}

/** A run's settings as its card carries them, before (or without) its job: engine, model, thinking and context. */
export type CardRunSettings = { engine: string | null; model: string | null; effort: string | null; context: string | null };

const setting = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * The settings on a run card: its own `engine`, `model`, `effort` and `context` when Ensemble sends them,
 * else what was sent to the engine (`settings.resolved`), else what was asked for, else the agent's name.
 */
export function cardRunSettings(data: Record<string, unknown> | null | undefined): CardRunSettings {
  const settings = (data?.settings ?? {}) as { resolved?: Record<string, unknown> | null; requested?: Record<string, unknown> | null };
  const pick = (key: string, alias = key) => setting(data?.[key]) ?? setting(settings.resolved?.[alias]) ?? setting(settings.requested?.[alias]);
  return { engine: pick("engine", "agent") ?? setting(data?.agent), model: pick("model"), effort: pick("effort"), context: pick("context") };
}

const modelFact = (model: string | null | undefined) => (model && !["default", "auto"].includes(model.toLowerCase()) ? model : null);
const effortFact = (effort: string | null | undefined) => (effort && effort !== "default" ? `${effort} thinking` : null);
/** "long context" for Ensemble's long tier, "1M context" for a size, nothing for the default. */
const contextFact = (context: string | null | undefined) => (!context || context === "default" ? null : context === "long_context" ? "long context" : /^\d/.test(context) ? `${context} context` : context.replace(/_/g, " "));

/**
 * Engine, model, thinking level and context, for the run's status line: from its job once read, with
 * the card's own settings for what the job does not say (and for all of it before the job is read).
 */
export function runFacts(job: Pick<AgentJob, "kind" | "provider" | "model" | "modelUsed" | "reasoningEffort" | "contextTier"> | null | undefined, card?: CardRunSettings): string[] {
  const model = (job?.modelUsed || job?.model || "").trim();
  const effort = (job?.reasoningEffort ?? "").trim();
  return [
    job ? engineLabel(job) : engineName(card?.engine),
    modelFact(modelFact(model) ?? card?.model),
    effortFact(effortFact(effort) ? effort : card?.effort),
    contextFact(job?.contextTier && job.contextTier !== "default" ? job.contextTier : card?.context),
  ].filter((value): value is string => Boolean(value));
}

/** "45s", "3m 05s", "1h 02m". */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** A tool call's duration: "0.4s", "2.5s", "12s", "3m 05s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 10_000) return `${(Math.max(ms, 100) / 1000).toFixed(1)}s`;
  return formatElapsed(Math.round(ms / 1000));
}

/** Seconds from start to end (or now), or null without a valid start. */
export function elapsedSeconds(start: string | null | undefined, end: string | null | undefined, now = Date.now()): number | null {
  const from = start ? Date.parse(start) : Number.NaN;
  if (!Number.isFinite(from)) return null;
  const to = end ? Date.parse(end) : now;
  return Number.isFinite(to) ? Math.max(0, (to - from) / 1000) : null;
}

const ANSI = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-Z\\-_]/g;

/** Terminal colour and cursor codes out of command output. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** A long path as its last three parts: "…/components/chat/run-card.tsx". */
export function shortPath(path: string, max = 48): string {
  const clean = path.trim();
  if (clean.length <= max) return clean;
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : clean;
}

function unescapeJson(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\$/, "");
  }
}

/**
 * The arguments of a tool call. They are stored as a JSON preview that may be cut short, so when
 * they do not parse, the string fields that are there are read one by one.
 */
export function parseArgs(args: string | null | undefined): Record<string, unknown> {
  const text = (args ?? "").trim();
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    return typeof value === "string" ? { command: value } : {};
  } catch {
    const out: Record<string, unknown> = {};
    for (const match of text.matchAll(/"([A-Za-z_][\w]*)"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/g)) {
      if (!(match[1]! in out)) out[match[1]!] = unescapeJson(match[2]!);
    }
    return out;
  }
}

const str = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value) && value.length && value.every((part) => typeof part === "string")) return value.join(" ");
  return null;
};

function pick(args: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = str(args[key]);
    if (value) return value;
  }
  return null;
}

const PATH_KEYS = ["file_path", "filePath", "path", "notebook_path", "target_file", "file", "uri", "filename"] as const;

function pathsOf(args: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const key of PATH_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) out.add(value.trim());
  }
  for (const key of ["files", "paths", "changes"]) {
    const value = args[key];
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (typeof row === "string" && row.trim()) out.add(row.trim());
      else if (row && typeof row === "object" && typeof (row as { path?: unknown }).path === "string") out.add((row as { path: string }).path);
    }
  }
  return [...out];
}

const name = (raw: string) => raw.toLowerCase().replace(/[\s-]+/g, "_");

/** What kind of work a tool call is, from its name (each engine names them its own way) and arguments. */
export function toolKind(toolName: string, args: Record<string, unknown> = {}): WorkKind {
  const n = name(toolName);
  if (n.startsWith("mcp__") || n.startsWith("mcp_") || n === "mcptoolcall") return "mcp";
  if (/^(bash|shell|sh|zsh|powershell|pwsh|run_command|run_terminal_cmd|terminal|execute|exec|exec_command|local_shell|commandexecution|bashoutput|bash_output|killshell|killbash|kill_shell)$/.test(n)) return "command";
  if (/^(edit|multiedit|multi_edit|write|write_file|edit_file|create|create_file|filechange|file_change|apply_patch|str_replace|str_replace_editor|str_replace_based_edit_tool|notebookedit|notebook_edit|delete|delete_file|move|rename|save_attachment)$/.test(n)) return "edit";
  if (/^(read|read_file|view|cat|ls|list|list_dir|list_files|notebookread|notebook_read|read_page|read_diagram|read_attachment)$/.test(n)) return "read";
  if (/^(grep|glob|search|find|rg|codebase_search|file_search|grep_search|search_files|find_files)$/.test(n)) return "search";
  if (/^(websearch|web_search|search_papers|google_search)$/.test(n)) return "web";
  if (/^(webfetch|web_fetch|fetch|fetch_url|browse|open_url)$/.test(n)) return "fetch";
  if (/^(ask_user|askuserquestion|ask_user_question|question|request_user_input)$/.test(n)) return "question";
  if (/^(task|agent|subagent|spawn_agent|delegate)$/.test(n)) return "agent";
  if (/^(think|thinking|reasoning)$/.test(n)) return "thinking";
  if (pick(args, ["command", "cmd"])) return "command";
  return "tool";
}

/** A step title without the tool name or verb the engine put in front ("Bash npm test" → "npm test"). */
function titleRest(title: string, toolName: string): string {
  let rest = title.trim();
  if (rest.toLowerCase().startsWith(`${toolName.toLowerCase()} `)) rest = rest.slice(toolName.length + 1);
  else rest = rest.replace(/^(Run|Change|Use)\s+/, "");
  return rest.replace(/^`([^`]*)`$/, "$1").trim();
}

const firstLine = (text: string) => {
  const line = text.trim().split("\n")[0] ?? "";
  return text.trim().includes("\n") ? `${line} …` : line;
};

const quoted = (text: string) => `“${text.length > 80 ? `${text.slice(0, 80)}…` : text}”`;

function editVerb(n: string): string {
  if (/^(write|write_file|create|create_file|save_attachment)$/.test(n)) return "Wrote";
  if (/^(delete|delete_file)$/.test(n)) return "Deleted";
  if (/^(move|rename)$/.test(n)) return "Moved";
  return "Edited";
}

function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

/** One tool call as a work-log entry. `title` is the step's one-line summary from the engine. */
export function callEntry(call: RunToolCall, title: string, id: string): Omit<WorkEntry, "status" | "ms" | "at" | "error"> {
  const args = parseArgs(call.args);
  const kind = toolKind(call.name, args);
  const n = name(call.name);
  const rest = titleRest(title || call.summary || "", call.name);
  const base = { id, kind, command: null, files: [] as string[], diff: null, detail: null, output: call.output ?? null };
  switch (kind) {
    case "command": {
      if (/^(bashoutput|bash_output)$/.test(n)) return { ...base, label: "Read a background command’s output" };
      if (/^(killshell|killbash|kill_shell)$/.test(n)) return { ...base, label: "Stopped a background command" };
      const command = pick(args, ["command", "cmd", "script"]) ?? (rest || call.name);
      return { ...base, label: firstLine(command), command };
    }
    case "edit": {
      const files = pathsOf(args);
      if (!files.length && rest) files.push(...rest.split(/,\s*/).filter(Boolean));
      const removed = pick(args, ["old_string", "old_str", "old_text", "oldText"]);
      const added = pick(args, ["new_string", "new_str", "new_text", "newText", "content"]);
      return {
        ...base,
        label: `${editVerb(n)} ${files.length ? files.map((file) => shortPath(file)).join(", ") : "a file"}`,
        files,
        diff: removed !== null || added !== null ? { removed: removed ?? "", added: added ?? "" } : null,
      };
    }
    case "read": {
      const path = pathsOf(args)[0] ?? null;
      if (/^(ls|list|list_dir|list_files)$/.test(n)) return { ...base, label: `Listed ${path ? shortPath(path) : "the folder"}` };
      if (n === "read_page") return { ...base, label: "Read the task’s page" };
      return { ...base, label: `Read ${path ? shortPath(path) : rest || "a file"}`, files: path ? [path] : [] };
    }
    case "search": {
      const pattern = pick(args, ["pattern", "query", "q", "regex", "glob", "search"]);
      const where = pick(args, ["path", "include", "glob_pattern"]);
      const label = pattern ? `Searched for ${quoted(pattern)}${where && where !== pattern ? ` in ${shortPath(where)}` : ""}` : rest ? `Searched ${rest}` : "Searched the code";
      return { ...base, label };
    }
    case "web": {
      const query = pick(args, ["query", "q", "search"]);
      return { ...base, label: query ? `Searched the web for ${quoted(query)}` : rest || "Searched the web" };
    }
    case "fetch": {
      const url = pick(args, ["url", "uri", "href"]);
      return { ...base, label: url ? `Fetched ${hostOf(url)}` : rest || "Fetched a page", detail: url && url !== hostOf(url) ? url : null };
    }
    case "mcp": {
      const parts = call.name.split("__");
      const tool = parts.length >= 3 ? parts.slice(2).join("__") : (pick(args, ["tool", "name"]) ?? (rest || call.name));
      const server = parts.length >= 3 ? parts[1] : pick(args, ["server"]);
      const input = args.arguments ?? args.input;
      return { ...base, label: `Used ${tool}${server ? ` · ${server}` : ""}`, detail: input !== undefined ? JSON.stringify(input, null, 2) : (call.args ?? null) };
    }
    case "question": {
      const question = pick(args, ["question", "title", "prompt"]);
      return { ...base, label: `Asked ${question ? quoted(question) : "a question"}` };
    }
    case "agent": {
      const what = pick(args, ["description", "prompt", "task"]);
      return { ...base, label: what ? `Ran a subagent: ${firstLine(what)}` : "Ran a subagent", detail: call.args ?? null };
    }
    case "thinking":
      return { ...base, label: "Thought" };
    default: {
      const human = TOOL_LABEL(call.name);
      const label = rest && rest.toLowerCase() !== call.name.toLowerCase() ? rest : human;
      return { ...base, label, detail: call.args && call.args !== "{}" ? call.args : null };
    }
  }
}

function stepMs(step: RunStep): number | null {
  const started = step.startedAt ? Date.parse(step.startedAt) : Number.NaN;
  const ended = step.endedAt ? Date.parse(step.endedAt) : Number.NaN;
  return Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : null;
}

/** Steps that hold the final answer: the trace's "Result", Ensemble's agent's "Answer", or an engine run without a trace. */
const RESULT_TITLES = new Set(["Result", "Answer", ...Object.values(ENGINES)]);

type NoteRaw = { type: "note"; id: string; tone: "info" | "warn"; text: string; at: string | null };
type Raw = { type: "entry"; entry: WorkEntry } | { type: "message"; id: string; text: string; at: string | null } | NoteRaw | { type: "result"; text: string; at: string | null };

/** What one run step shows: its thinking, its tool calls, or the engine's message or answer. */
export function stepItems(step: RunStep): Raw[] {
  const out: Raw[] = [];
  const at = step.startedAt;
  const calls = (Array.isArray(step.toolCalls) ? step.toolCalls : []).filter((call): call is RunToolCall => Boolean(call && typeof call.name === "string"));
  const reasoning = step.reasoning?.trim();
  if (reasoning) {
    out.push({
      type: "entry",
      entry: { id: `${step.index}:t`, kind: "thinking", label: firstLine(reasoning).replace(/\*\*/g, ""), command: null, files: [], diff: null, detail: null, output: reasoning, error: null, status: "done", ms: null, at },
    });
  }
  const output = step.output?.trim() ?? "";
  if (!calls.length) {
    if (!output || step.title === "Thinking") return out;
    out.push(RESULT_TITLES.has(step.title) ? { type: "result", text: output, at } : { type: "message", id: `${step.index}:m`, text: output, at });
    return out;
  }
  // Ensemble's own agent keeps what the model said alongside its calls in the step's output.
  if (output && calls.every((call) => (call.output ?? "").trim() !== output)) out.push({ type: "message", id: `${step.index}:m`, text: output, at });
  const single = calls.length === 1;
  calls.forEach((call, position) => {
    const shown = callEntry(call, single ? step.title : (call.summary ?? ""), single ? `${step.index}` : `${step.index}:${position}`);
    const status: WorkEntry["status"] =
      call.ok === false || (single && step.status === "failed")
        ? "failed"
        : step.status === "skipped"
          ? "skipped"
          : step.status === "running" || step.status === "pending" || step.status === "needs_approval"
            ? call.ok === undefined
              ? "running"
              : "done"
            : "done";
    out.push({
      type: "entry",
      entry: {
        ...shown,
        output: shown.output ?? (single && step.status !== "running" ? step.output : null),
        error: single ? step.error : null,
        status,
        ms: typeof call.ms === "number" ? call.ms : single ? stepMs(step) : null,
        at,
      },
    });
  });
  return out;
}

/** A job milestone worth a line in the log, or null. */
export function eventNote(event: JobEvent): { tone: "info" | "warn"; text: string } | null {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
  switch (event.kind) {
    case "needs_me":
      return text("title") ? { tone: "warn", text: `Asked you: ${text("title")}` } : null;
    case "decision": {
      if (data.by !== "unattended" || !text("question")) return null;
      const options = Array.isArray(data.options) ? data.options.filter((row): row is string => typeof row === "string") : [];
      const chose = text("recommended") || options[0] || "";
      return { tone: "info", text: `Decided on its own (unattended): ${text("question")}${chose ? ` → ${chose}` : ""}` };
    }
    case "engine_note":
      return text("note") ? { tone: "info", text: text("note") } : null;
    case "engine_retry": {
      const attempt = typeof data.attempt === "number" && typeof data.of === "number" ? ` (attempt ${data.attempt} of ${data.of})` : "";
      return { tone: "warn", text: `Restarted the engine${attempt}${text("reason") ? `: ${text("reason")}` : ""}` };
    }
    case "outside":
      return { tone: "warn", text: `Used a path outside the folder${text("path") ? `: ${text("path")}` : ""}` };
    case "unattended":
      return { tone: "info", text: `Went ahead without asking (unattended)${text("command") ? `: ${text("command")}` : ""}` };
    default:
      return null;
  }
}

type Tally = { count: number; entries: number; index: number; files: Set<string> };

const PRIORITY: Record<WorkKind, number> = { command: 0, edit: 0, read: 1, search: 1, web: 1, fetch: 1, mcp: 1, question: 1, agent: 1, thinking: 3, tool: 2 };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function actionLabel(kind: WorkKind, count: number): string {
  switch (kind) {
    case "command":
      return `Ran ${plural(count, "command", "commands")}`;
    case "edit":
      return `Edited ${plural(count, "file", "files")}`;
    case "read":
      return `Read ${plural(count, "file", "files")}`;
    case "search":
      return `Searched ${count === 1 ? "once" : `${count} times`}`;
    case "web":
      return `Searched the web ${count === 1 ? "once" : `${count} times`}`;
    case "fetch":
      return `Fetched ${plural(count, "page", "pages")}`;
    case "mcp":
      return `Used ${plural(count, "MCP tool", "MCP tools")}`;
    case "question":
      return `Asked ${plural(count, "question", "questions")}`;
    case "agent":
      return `Ran ${plural(count, "subagent", "subagents")}`;
    default:
      return `Used ${plural(count, "tool", "tools")}`;
  }
}

/** One line for a run of entries: "Ran 6 commands, edited 3 files, read 2 files". Listed in the order they first happened. */
export function summarize(entries: readonly WorkEntry[]): string {
  const tools = entries.filter((entry) => entry.kind !== "thinking");
  if (!tools.length) return entries.length === 1 ? "Thought" : `Thought ${entries.length} times`;
  const tallies = new Map<WorkKind, Tally>();
  for (const entry of tools) {
    let tally = tallies.get(entry.kind);
    if (!tally) tallies.set(entry.kind, (tally = { count: 0, entries: 0, index: tallies.size, files: new Set() }));
    tally.entries += 1;
    // An edit counts the files it changed, so three edits of one file read "Edited 1 file".
    if (entry.kind === "edit" && entry.files.length) {
      for (const file of entry.files) if (!tally.files.has(file)) (tally.files.add(file), (tally.count += 1));
    } else tally.count += 1;
  }
  // Up to four kinds are all named; past that, the three that matter most, and a count of the rest.
  const chosen = [...tallies]
    .sort(([a, x], [b, y]) => PRIORITY[a] - PRIORITY[b] || x.index - y.index)
    .slice(0, tallies.size > 4 ? 3 : 4)
    .sort(([, x], [, y]) => x.index - y.index);
  const labels = chosen.map(([kind, tally]) => actionLabel(kind, tally.count));
  const rest = tools.length - chosen.reduce((sum, [, tally]) => sum + tally.entries, 0);
  if (rest > 0) labels.push(`${plural(rest, "other action", "other actions")}`);
  return labels.map((label, index) => (index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1))).join(", ");
}

/** The icon a group's header takes: its one kind of work, thinking, or "mixed". */
export function groupKind(entries: readonly WorkEntry[]): WorkKind | "mixed" {
  const kinds = new Set(entries.filter((entry) => entry.kind !== "thinking").map((entry) => entry.kind));
  if (!kinds.size) return "thinking";
  return kinds.size === 1 ? [...kinds][0]! : "mixed";
}

function group(entries: WorkEntry[]): WorkGroup {
  const timed = entries.filter((entry) => entry.ms !== null);
  return {
    kind: "group",
    id: `g-${entries[0]!.id}`,
    entries,
    summary: summarize(entries),
    failed: entries.filter((entry) => entry.status === "failed").length,
    running: entries.some((entry) => entry.status === "running"),
    ms: timed.length ? timed.reduce((sum, entry) => sum + entry.ms!, 0) : null,
  };
}

const time = (at: string | null) => (at ? Date.parse(at) : Number.NaN);

/**
 * The run's steps (and the job's milestones, by time) as the work log: consecutive entries in one
 * group; messages and milestones between groups. The final answer is returned on its own.
 */
export function workLog(steps: readonly RunStep[], events: readonly JobEvent[] = []): WorkLog {
  const raws = [...steps].sort((a, b) => a.index - b.index).flatMap(stepItems);
  const notes = events
    .flatMap((event): NoteRaw[] => {
      const note = eventNote(event);
      return note ? [{ type: "note", id: `e-${event.id}`, tone: note.tone, text: note.text, at: event.at }] : [];
    })
    .sort((a, b) => time(a.at) - time(b.at));
  const merged: Raw[] = [];
  let next = 0;
  for (const raw of raws) {
    const at = time(raw.type === "entry" ? raw.entry.at : raw.at);
    // A milestone at the same moment as a step comes after it: a step asks, then the card opens.
    while (next < notes.length && Number.isFinite(at) && time(notes[next]!.at) < at) merged.push(notes[next++]!);
    merged.push(raw);
  }
  merged.push(...notes.slice(next));

  const items: WorkItem[] = [];
  let current: WorkEntry[] = [];
  let result: string | null = null;
  let tools = 0;
  const close = () => {
    if (current.length) items.push(group(current));
    current = [];
  };
  for (const raw of merged) {
    if (raw.type === "entry") {
      current.push(raw.entry);
      if (raw.entry.kind !== "thinking") tools += 1;
    } else if (raw.type === "result") {
      result = raw.text;
    } else {
      close();
      items.push(raw.type === "message" ? { kind: "message", id: raw.id, text: raw.text, at: raw.at } : { kind: "note", id: raw.id, tone: raw.tone, text: raw.text, at: raw.at });
    }
  }
  close();
  return { items, result, tools };
}

/** What a node's reply used, for its collapsed tool line: "Used 4 tools", the first names, failures. */
export function toolChipSummary(tools: readonly ToolChip[]): { label: string; names: string; failed: number } {
  const names = [...new Set(tools.map((tool) => TOOL_LABEL(tool.name)))];
  return {
    label: `Used ${plural(tools.length, "tool", "tools")}`,
    names: names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", "),
    failed: tools.filter((tool) => tool.state === "failed").length,
  };
}
