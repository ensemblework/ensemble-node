import assert from "node:assert/strict";
import test from "node:test";
import type { JobEvent, RunStep } from "./types";
import {
  callEntry,
  elapsedSeconds,
  engineLabel,
  formatDuration,
  formatElapsed,
  groupKind,
  parseArgs,
  runFacts,
  runStatus,
  shortPath,
  stripAnsi,
  summarize,
  toolChipSummary,
  toolKind,
  workLog,
  type WorkEntry,
} from "./work-log";

const at = (second: number) => new Date(Date.UTC(2026, 9, 26, 10, 0, second)).toISOString();

/** A step as the engine trace writes one tool call. */
function call(index: number, name: string, input: unknown, title: string, more: Partial<RunStep> & { ok?: boolean; output?: string; ms?: number } = {}): RunStep {
  const { ok = true, output = "", ms = 1200, ...step } = more;
  const args = JSON.stringify(input, null, 1);
  return {
    index,
    title,
    status: ok ? "done" : "failed",
    output,
    toolCalls: [{ id: `c${index}`, name, args, ok, output, ms, engine: "claude-code" }],
    reasoning: null,
    model: null,
    tokensIn: null,
    tokensOut: null,
    startedAt: at(index),
    endedAt: at(index + 1),
    error: ok ? null : output,
    ...step,
  };
}

const text = (index: number, title: string, output: string, reasoning: string | null = null): RunStep => ({
  index, title, status: "done", output, toolCalls: [], reasoning, model: null, tokensIn: null, tokensOut: null, startedAt: at(index), endedAt: at(index), error: null,
});

test("every engine's tool names map to one kind of work", () => {
  const cases: Array<[string, unknown, string]> = [
    ["Bash", { command: "npm test" }, "command"],
    ["commandExecution", { command: "ls" }, "command"],
    ["execute", {}, "command"],
    ["run_command", { command: "pnpm i" }, "command"],
    ["Edit", { file_path: "a.ts" }, "edit"],
    ["fileChange", { files: ["a.ts"] }, "edit"],
    ["write_file", { path: "a.ts" }, "edit"],
    ["Read", { file_path: "a.ts" }, "read"],
    ["list_dir", {}, "read"],
    ["Grep", { pattern: "x" }, "search"],
    ["Glob", { pattern: "*.ts" }, "search"],
    ["WebSearch", { query: "x" }, "web"],
    ["WebFetch", { url: "https://x.dev" }, "fetch"],
    ["fetch_url", { url: "https://x.dev" }, "fetch"],
    ["mcp__github__create_issue", {}, "mcp"],
    ["mcpToolCall", { tool: "search" }, "mcp"],
    ["ask_user", { question: "Which?" }, "question"],
    ["Task", { description: "explore" }, "agent"],
    ["think", {}, "thinking"],
    ["TodoWrite", {}, "tool"],
    ["custom_runner", { command: "make" }, "command"],
  ];
  for (const [name, args, kind] of cases) assert.equal(toolKind(name, args as Record<string, unknown>), kind, name);
});

test("arguments cut short still give their string fields", () => {
  assert.deepEqual(parseArgs('{\n "command": "npm test",\n "timeout": 30\n}'), { command: "npm test", timeout: 30 });
  assert.deepEqual(parseArgs('{\n "file_path": "src/a.ts",\n "old_string": "line one\\nline tw…'), { file_path: "src/a.ts", old_string: "line one\nline tw…" });
  assert.deepEqual(parseArgs(""), {});
  assert.deepEqual(parseArgs("not json"), {});
});

test("an entry reads like what the agent did", () => {
  const bash = callEntry({ name: "Bash", args: JSON.stringify({ command: "pnpm test\npnpm lint" }) }, "Bash pnpm test", "1");
  assert.equal(bash.kind, "command");
  assert.equal(bash.label, "pnpm test …");
  assert.equal(bash.command, "pnpm test\npnpm lint");
  const codex = callEntry({ name: "commandExecution", args: JSON.stringify({ command: "ls -la" }) }, "Run ls -la", "2");
  assert.equal(codex.label, "ls -la");
  const acp = callEntry({ name: "execute", args: "{}" }, "`git status`", "3");
  assert.equal(acp.command, "git status");
  const edit = callEntry({ name: "Edit", args: JSON.stringify({ file_path: "src/app.ts", old_string: "a", new_string: "b" }) }, "Edit src/app.ts", "4");
  assert.equal(edit.label, "Edited src/app.ts");
  assert.deepEqual(edit.diff, { removed: "a", added: "b" });
  assert.equal(callEntry({ name: "fileChange", args: JSON.stringify({ files: ["a.ts", "b.ts"] }) }, "Change a.ts, b.ts", "5").label, "Edited a.ts, b.ts");
  assert.equal(callEntry({ name: "Write", args: JSON.stringify({ file_path: "new.md", content: "# Hi" }) }, "", "6").label, "Wrote new.md");
  assert.equal(callEntry({ name: "Grep", args: JSON.stringify({ pattern: "login", path: "src" }) }, "", "7").label, "Searched for “login” in src");
  assert.equal(callEntry({ name: "WebFetch", args: JSON.stringify({ url: "https://docs.example.com/a" }) }, "", "8").label, "Fetched docs.example.com/a");
  assert.equal(callEntry({ name: "mcp__linear__create_issue", args: "{}" }, "", "9").label, "Used create_issue · linear");
  assert.equal(callEntry({ name: "ask_user", args: JSON.stringify({ question: "Which database?" }) }, "", "10").label, "Asked “Which database?”");
  assert.equal(callEntry({ name: "TodoWrite", args: "{}" }, "TodoWrite", "11").label, "TodoWrite");
});

test("consecutive calls collapse into one group with a summary; messages split groups", () => {
  const steps: RunStep[] = [
    text(0, "Thinking", "", "**Plan** first look at the tests\nthen fix"),
    call(1, "Read", { file_path: "src/a.ts" }, "Read src/a.ts"),
    call(2, "Bash", { command: "npm test" }, "Bash npm test", { ok: false, output: "1 failing" }),
    call(3, "Edit", { file_path: "src/a.ts" }, "Edit src/a.ts"),
    call(4, "Edit", { file_path: "src/a.ts" }, "Edit src/a.ts"),
    call(5, "Bash", { command: "npm test" }, "Bash npm test", { output: "ok" }),
    text(6, "Message", "Tests pass now. Updating the docs."),
    call(7, "Edit", { file_path: "README.md" }, "Edit README.md"),
    text(8, "Result", "Fixed the failing test and updated the README."),
  ];
  const log = workLog(steps);
  assert.equal(log.result, "Fixed the failing test and updated the README.");
  assert.equal(log.tools, 6);
  assert.deepEqual(log.items.map((item) => item.kind), ["group", "message", "group"]);
  const first = log.items[0]!;
  assert.ok(first.kind === "group");
  assert.equal(first.summary, "Read 1 file, ran 2 commands, edited 1 file");
  assert.equal(summarize([...first.entries, { ...first.entries[1]!, id: "x", kind: "search" }]), "Read 1 file, ran 2 commands, edited 1 file, searched once");
  assert.equal(first.failed, 1);
  assert.equal(first.entries[0]!.kind, "thinking");
  assert.equal(first.entries[0]!.label, "Plan first look at the tests …");
  assert.equal(first.entries[2]!.status, "failed");
  assert.equal(first.ms, 5 * 1200);
  assert.equal(log.items[2]!.kind === "group" && log.items[2]!.summary, "Edited 1 file");
});

test("a summary keeps the three main kinds and counts the rest", () => {
  const entry = (kind: WorkEntry["kind"], files: string[] = []): WorkEntry => ({ id: kind, kind, label: "", command: null, files, diff: null, detail: null, output: null, error: null, status: "done", ms: null, at: null });
  assert.equal(summarize([entry("command"), entry("command"), entry("edit", ["a"]), entry("edit", ["b"]), entry("edit", ["a"])]), "Ran 2 commands, edited 2 files");
  assert.equal(summarize([entry("read"), entry("web"), entry("command"), entry("edit"), entry("search"), entry("tool")]), "Read 1 file, ran 1 command, edited 1 file, 3 other actions");
  assert.equal(summarize([entry("read"), entry("web"), entry("command"), entry("edit")]), "Read 1 file, searched the web once, ran 1 command, edited 1 file");
  assert.equal(summarize([entry("thinking"), entry("thinking")]), "Thought 2 times");
  assert.equal(summarize([entry("thinking")]), "Thought");
  assert.equal(groupKind([entry("thinking"), entry("command"), entry("command")]), "command");
  assert.equal(groupKind([entry("read"), entry("command")]), "mixed");
});

test("Ensemble's own agent: one step with several calls and what the model said", () => {
  const step: RunStep = {
    ...text(0, "run_command, read_file", "Let me check the build."),
    toolCalls: [
      { id: "a", name: "run_command", args: '{"command":"pnpm build"}', ok: true, output: "built", ms: 4000, summary: "Ran pnpm build", engine: "ensemble" },
      { id: "b", name: "read_file", args: '{"path":"package.json"}', ok: false, output: "missing", ms: 10, summary: "Could not read", engine: "ensemble" },
    ],
  };
  const log = workLog([step]);
  assert.deepEqual(log.items.map((item) => item.kind), ["message", "group"]);
  const group = log.items[1]!;
  assert.ok(group.kind === "group");
  assert.deepEqual(group.entries.map((entry) => [entry.label, entry.status]), [["pnpm build", "done"], ["Read package.json", "failed"]]);
});

test("a running call shows as running, and milestones fall between steps by time", () => {
  const running: RunStep = { ...call(2, "Bash", { command: "npm run e2e" }, "Bash npm run e2e"), status: "running", output: null, endedAt: null };
  running.toolCalls = [{ id: "c2", name: "Bash", args: '{"command":"npm run e2e"}', engine: "claude-code" }];
  const events: JobEvent[] = [
    { id: "e1", kind: "engine_note", data: { note: "Runs at the model's default." }, at: at(0) },
    { id: "e2", kind: "needs_me", data: { title: "Push to main?" }, at: at(1) },
    { id: "e3", kind: "tool", data: { name: "Bash" }, at: at(1) },
  ];
  const log = workLog([call(1, "Read", { file_path: "a.ts" }, "Read a.ts"), running], events);
  assert.deepEqual(log.items.map((item) => item.kind), ["note", "group", "note", "group"]);
  assert.ok(log.items[2]!.kind === "note" && log.items[2]!.text === "Asked you: Push to main?" && log.items[2]!.tone === "warn");
  const last = log.items[3]!;
  assert.ok(last.kind === "group" && last.running && last.entries[0]!.status === "running" && last.entries[0]!.output === null);
});

test("durations, elapsed time, paths and terminal codes", () => {
  assert.equal(formatElapsed(45), "45s");
  assert.equal(formatElapsed(185), "3m 05s");
  assert.equal(formatElapsed(3720), "1h 02m");
  assert.equal(formatDuration(40), "0.1s");
  assert.equal(formatDuration(2500), "2.5s");
  assert.equal(formatDuration(12_300), "12s");
  assert.equal(elapsedSeconds(at(0), at(30)), 30);
  assert.equal(elapsedSeconds(null, at(30)), null);
  assert.equal(shortPath("/Users/mira/code/fieldnote/apps/web/components/chat/run-card.tsx"), "…/components/chat/run-card.tsx");
  assert.equal(shortPath("src/a.ts"), "src/a.ts");
  assert.equal(stripAnsi("\u001b[32m✓ passed\u001b[0m \u001b]8;;https://x\u0007link\u001b]8;;\u0007"), "✓ passed link");
});

test("the run's status line and status", () => {
  assert.equal(engineLabel({ kind: "code", provider: "claude-code" }), "Claude Code");
  assert.equal(engineLabel({ kind: "code", provider: "openai" }), "Ensemble's agent");
  assert.deepEqual(runFacts({ kind: "code", provider: "codex", model: "gpt-6", modelUsed: "gpt-6-sol", reasoningEffort: "high", contextTier: "long_context" }), ["Codex", "gpt-6-sol", "high thinking", "long context"]);
  assert.deepEqual(runFacts({ kind: "code", provider: "cursor-agent", model: "default", modelUsed: null, reasoningEffort: "default" }), ["Cursor"]);
  assert.equal(runStatus("running", "succeeded"), "succeeded");
  assert.equal(runStatus("failed", "running"), "failed");
  assert.equal(runStatus("running", "waiting_approval"), "waiting_approval");
  assert.equal(runStatus("queued", undefined), "queued");
});

test("a reply's tools fold into one line", () => {
  const tool = (name: string, state?: string) => ({ id: name, name, state, summary: null, href: null });
  assert.deepEqual(toolChipSummary([tool("hub_create_tasks"), tool("hub_search_pages"), tool("hub_create_tasks", "failed")]), { label: "Used 3 tools", names: "Create tasks, Search pages", failed: 1 });
  assert.equal(toolChipSummary([tool("a"), tool("b"), tool("c"), tool("d"), tool("e")]).names, "A, B, C +2");
});
