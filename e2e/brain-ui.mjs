/**
 * Local, stateful browser fixture for what Ensemble Node v2's brain shows its owner, at 390 and 1280 px:
 * a turn's trace from its message's Trace action (owner only) in a right drawer (the line with how it
 * ended, its model, tokens and time; the instructions by part and tier; tool calls with the agent's own
 * calls marked and how they were answered; what it was given, with no titles or keys; decisions, the answer
 * check and the report); questions about the agent's own calls (changes in a folder, a program) with
 * exactly Ensemble's answers, one press, folded into their checkpoint; an app on the node's own screen (This
 * mission or Don't allow); a stuck plan step answered with one press and a plan re-planning, with a partial
 * step's report and what is left; a node's memories (markers, pin, edit, restore, delete, two rows at
 * once with one refused after the drawer closed); a crew's group
 * answers; and whether a computer's desktop apps can be used, with its facts in the ⓘ.
 * Never points at a hosted account or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const widths = (process.env.NODE_CHAT_WIDTHS ?? "390,1280").split(",").map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

function fixture() {
  const avatar = (color, shape) => ({ shape, color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-600), provider: "ensemble", model: "gpt-5-mini" };
  const a3 = { ...base, id: "a3", slug: "assistant-3", name: "Assistant 3", role: "assistant", avatar: avatar("#D7B56F", "compass") };
  const lead = { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#7FB3D5", "square") };
  const tester = { ...base, id: "tester", slug: "tester", name: "Tester", role: "tester", avatar: avatar("#E07A5F", "hex") };
  const me = { id: "p-me", kind: "person", handle: "akash", accountId: "me", role: "owner", name: "Akash", responsibility: null, me: true };
  const member = (node, isLead = false) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead: isLead, representative: isLead, node });
  const room = (id, title, kind, members, minutes, extra = {}) => ({ id, title, kind, members, createdBy: "me", lastSeq: 20, readSeq: 20, unread: 0, lastMessageAt: at(minutes), pinned: [], invites: [], leadNodeIds: [], last: null, ...extra });
  const rooms = [room("dm-a3", "Assistant 3", "dm", [me, member(a3, true)], -1), room("crew", "Site crew", "crew", [me, member(lead, true), member(tester), member(a3)], -3, { mode: "coordinated", leadNodeIds: ["lead"] })];
  let seq = 0;
  const message = (roomId, id, kind, body, data, more = {}) => ({ id, roomId, seq: (seq += 1), kind, body, authorKind: "node", authorAccountId: "me", authorNodeId: "a3", data, private: kind === "approval", mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-40 + seq), ...more });
  const computer = (id, body, data) => message("dm-a3", id, "approval", body, { type: "computer", status: "pending", private: true, answer: null, answeredAt: null, deviceName: "Studio", turnId: "t1", ...data });
  const step = (id, nodeId, extra) => ({ id, nodeId, handle: nodeId, name: nodeId, brief: `Do the ${id} part.`, after: [], status: "waiting", result: null, progress: null, startedAt: null, endedAt: null, requirementIds: [], held: false, heldBy: null, outcome: "unknown", attempt: 0, attempts: [], sessionId: null, ...extra });
  const question = "@tester's step in @lead's plan keeps failing the same way. The login test fails on Safari. Try it again, or finish the plan without it?";
  const messages = {
    "dm-a3": [
      message("dm-a3", "u1", "text", "Fix the site build and tell me what is left.", {}, { authorKind: "human", authorNodeId: null }),
      message("dm-a3", "r1", "text", "Fixed the build: the site builds again. The docs page still needs a screenshot.", { turnId: "t1" }),
      computer("c-own-write", "@assistant-3 wants to run commands in ~/projects/site on Studio", { decisionId: "dec-own-write", capability: "run", scope: "folder", label: "~/projects/site", call: "Edit: src/build.ts", options: ["Allow changes and commands", "Allow changes and commands for this run"] }),
      computer("c-own-program", "@assistant-3 wants to run crontab on Studio", { decisionId: "dec-own-program", capability: "run", scope: "folder", label: "crontab", call: "crontab -e", own: { kind: "program" }, options: ["Allow once", "Allow for this run"] }),
      computer("c-app", "@assistant-3 wants to use Terminal on its own screen on Studio", { decisionId: "dec-app", capability: "desktop", scope: "app", screen: "agent", label: "Terminal", call: "desktop_act: open Terminal", options: ["This mission"] }),
    ],
    crew: [
      message("crew", "u2", "text", "@lead ship the login fix, tested on Safari.", {}, { authorKind: "human", authorNodeId: null }),
      message("crew", "plan1", "plan", "Plan", {
        type: "plan", version: 4, contract: 3, missionId: "plan1", kind: "plan", leadNodeId: "lead", leadHandle: "lead", status: "replanning", goal: "Ship the login fix, tested on Safari", requirements: [], deferred: [],
        steps: [
          step("s1", "assistant-3", { nodeId: "a3", kind: "build", executor: "session", brief: "Fix the login redirect.", status: "done", outcome: "partial", attempt: 1, result: "The redirect works on Chrome and Firefox.", attempts: [{ n: 1, reason: "first", outcome: "partial", summary: "Chrome and Firefox pass.", remaining: ["Fix the Safari cookie"], ownerDecision: "Which Safari version do we support?", checks: [{ name: "Login on Chrome", verdict: "pass", strength: "A" }], startedAt: at(-30), endedAt: at(-20) }] }),
          step("s2", "tester", { kind: "verify", executor: "session", after: ["s1"], brief: "Test the login on Safari.", held: true, heldBy: "s1" }),
        ],
      }, { authorNodeId: "lead", private: false }),
      message("crew", "c-plan", "approval", question, { type: "plan_decision", status: "pending", plan: { id: "plan1", step: "s2" }, attempt: 2, why: "same_error", question, approveLabel: "Try again", discardLabel: "Finish without it", calls: [{ callId: "s2:2", name: "node_plan_decision", summary: "Try again or finish without it" }], turnId: "t-lead" }, { authorNodeId: "lead" }),
    ],
  };
  const trace = {
    turn: { id: "t1", nodeId: "a3", roomId: "dm-a3", reason: "message", private: false, lane: "conv:dm-a3:s", audience: "owner", triggerMessageId: "u1", planId: null, planStep: null, attempt: 0, originTurnId: null, status: "done", outcome: "done", placement: { loop: "subscription-cli", inference: "owner-subscription", toolsAt: "dev-1", conversation: "ensemble" }, model: "gpt-6-luna", credits: null, error: null, createdAt: at(-12), finishedAt: new Date(NOW - 12 * 60_000 + 48_000).toISOString() },
    trace: {
      nodeId: "a3", createdAt: at(-11), instructionVersion: "9f8e7d6c5b4a3210", instructionHash: "abcd",
      sections: { hashes: { stable: "a", context: "b", volatile: "c" }, list: [{ name: "constitution/01-identity", tier: "stable", chars: 4000, tokens: 1000 }, { name: "node/20-charter", tier: "stable", chars: 1200, tokens: 300 }, { name: "node/57-memories", tier: "context", chars: 900, tokens: 225 }, { name: "node/80-packet-new", tier: "volatile", chars: 400, tokens: 100 }], dropped: [{ name: "node/58-workspace", tier: "context", reason: "budget", tokens: 120, items: 3 }] },
      toolSchemaHash: "1234", toolCount: 28, modelRequested: "gpt-6-luna", modelSent: "gpt-6-luna", modelReported: "gpt-6-luna-2026-10-01", provider: "copilot-cli", effort: "low",
      placement: { loop: "subscription-cli", inference: "owner-subscription", toolsAt: "dev-1", conversation: "ensemble" }, tokensIn: 18_204, tokensOut: 1_310, credits: null, costUsd: null,
      calls: [
        { name: "hub_search_tasks", ms: 420, state: "ok", resultChars: 4100, shownChars: 1200, offloaded: true, readOnly: true },
        { kind: "own", name: "Edit", ms: 120, state: "ok", inChars: 820, outChars: 64, verdict: "asked" },
        { kind: "own", name: "Bash", ms: 2400, state: "ok", inChars: 30, outChars: 4100, verdict: "allowed" },
        { kind: "own", name: "write_file", ms: null, state: "failed", inChars: "unknown", outChars: "unknown", verdict: "refused" },
        { name: "node_share_file", ms: 900, state: "failed", resultChars: 40, shownChars: 40, offloaded: false, readOnly: false },
      ],
      selected: { config: { version: "2026-11-21.1", hash: "c0ffee" }, skills: [{ skill: "debugging", source: "bundled", score: 7.25, why: ["keywords 2"] }, { skill: "8b0c2f9e-1111-4c1e-9a1a-2b3c4d5e6f70", source: "owner", score: 2, why: ["name"] }], inline: { skill: "debugging", source: "bundled", chars: 1400, cut: false }, memories: [{ id: "m1", scope: "owner", pinned: true, rank: 1, why: "pinned" }], context: [{ group: "overdue", kind: "task", id: "t-9", score: null, why: ["overdue"] }], left: { memories: 0, context: 2 } },
      verification: { checks: ["files"], rounds: [{ round: 1, problems: "the screenshot is not in the chat" }, { round: 2, problems: null }], passed: true },
      report: { kind: "reply", outcome: "partial", stated: "done", chars: 92, held: 0, messages: [{ id: "r1", kind: "text" }], artifacts: [{ id: "f1", kind: "file", to: "files" }], remaining: "Add the docs page screenshot", verified: true },
      loop: { kind: "subscription", agent: "copilot-cli", computer: "Studio", computerId: "dev-1", session: { resumed: true }, calls: 3, ownTools: true },
      error: null,
    },
    decisions: [{ id: "d1", kind: "route", nodeId: "a3", turnId: "t1", configVersion: "2026-11-21.1:9f8e", inputs: {}, scores: null, choice: { reason: "dm", woken: [{ nodeId: "a3", turnId: "t1" }] }, ambiguous: false, createdAt: at(-12) }],
  };
  const memory = (id, content, extra = {}) => ({ id, content, createdAt: at(-500), updatedAt: at(-500), key: null, scope: "node", scopeId: null, scopeTitle: null, ownerWide: false, pinned: false, archived: false, archivedAt: null, supersededById: null, source: "owner", authorNodeId: null, lastUsedAt: null, ...extra });
  const memories = [
    memory("m1", "Run coding work with GitHub Copilot.", { key: "coding agent", scope: "owner", ownerWide: true, pinned: true }),
    memory("m2", "Use British spelling in the docs.", { scope: "room", scopeId: "crew", scopeTitle: "Site crew" }),
    memory("m3", "The site deploys from main."),
    memory("m4", "Deploy only on Fridays.", { archived: true, archivedAt: at(-100) }),
  ];
  const readiness = { ready: true, session: "wayland", consent: "remembered", recorder: "webm", agentScreen: { ready: true, version: "GNOME Shell 50.1" } };
  const devices = [
    { id: "dev-1", name: "Studio", platform: "linux", appVersion: "0.9.0", folders: ["site"], online: true, lastSeenAt: at(-1), revokedAt: null, sealKey: null, capabilities: { browser: 1, capture: { browser: true, video: "webm", setup: false, targets: { web: { screenshot: true, video: true } } }, desktop: 1, desktopReadiness: readiness } },
    { id: "dev-2", name: "Old laptop", platform: "linux", appVersion: "0.9.0", folders: [], online: true, lastSeenAt: at(-1), revokedAt: null, sealKey: null, capabilities: { browser: 1, capture: { browser: true, video: null, setup: false, targets: {} }, desktop: 1, desktopReadiness: { ready: false, session: "none", consent: "ask", recorder: null, reason: "Ensemble here does not run inside a desktop session.", agentScreen: { ready: false, version: null, reason: "Needs GNOME Shell for the agent screen: sudo apt install gnome-shell" } } } },
  ];
  const boot = { me: { id: "me", name: "Akash", email: "akash@fieldnote.example", verified: true }, nodes: [a3, lead, tester], rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, trace, memories, devices, calls: [], hold: null };
}

try {
  for (const width of widths) {
    const state = fixture();
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: phone, isMobile: phone, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
    await context.addInitScript(() => {
      window.EventSource = class extends EventTarget {
        constructor() { super(); setTimeout(() => this.onopen?.(new Event("open")), 0); }
        close() {}
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const errors = [];
    const unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    const all = () => Object.values(state.messages).flat();
    const card = (id) => all().find((row) => row.id === id);
    const update = (id, data) => {
      const row = card(id);
      row.data = { ...row.data, ...data };
      return row;
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      // This window's Node place (the place gate): always allowed here.
      if (path === "/api/auth/places" || path === "/api/auth/places/continue") return json({ allowed: true, places: [] });
      if (path === "/api/auth/places/release") return route.fulfill({ status: 204, headers: cors });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: all().filter((row) => row.kind === "approval" && row.data.status === "pending"), runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ serverRunner: false, devices: state.devices });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/node/models") return json({ default: "gpt-5-mini", options: [] });
      if (path === "/api/node/routines") return json({ routines: [] });
      if (path === "/api/node/evidence" && method === "GET") return json({ evidence: [] });
      if (path === "/api/settings" && method === "GET") return json({ settings: { runProfiles: [], defaultRunProfileId: null, node: { askBeforeBrowsing: false } }, connectors: [] });
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      const trace = /^\/api\/node\/turns\/([^/]+)\/trace$/.exec(path);
      if (trace && method === "GET") {
        state.calls.push({ trace: trace[1] });
        return trace[1] === "t1" ? json(state.trace) : json({ error: "That turn is not available." }, 404);
      }
      const one = /^\/api\/node\/messages\/([^/]+)$/.exec(path);
      if (one && method === "GET") return card(one[1]) ? json({ message: card(one[1]) }) : json({ error: "That message is not available." }, 404);
      const decide = /^\/api\/decisions\/([^/]+)\/decide$/.exec(path);
      if (decide && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ decide: decide[1], body });
        // Ensemble settles the card with the answer in its own words (node/device-tool-decisions.ts).
        const asked = all().find((row) => row.data.decisionId === decide[1]);
        if (asked) update(asked.id, body.decision === "allow" ? { status: "allowed", answer: body.reason, answeredAt: new Date().toISOString() } : { status: "denied", answer: "No", answeredAt: new Date().toISOString() });
        return json({ decision: { id: decide[1], status: "decided" } });
      }
      const settle = /^\/api\/node\/approvals\/([^/]+)$/.exec(path);
      if (settle && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ settle: settle[1], body });
        return json({ message: update(settle[1], { status: body.decision === "approve" ? "approved" : "discarded", answeredAt: new Date().toISOString() }) });
      }
      const memoryList = /^\/api\/node\/nodes\/([^/]+)\/memory$/.exec(path);
      if (memoryList && method === "GET") return json({ memories: memoryList[1] === "a3" ? state.memories.filter((row) => !row.supersededById) : [] });
      const memoryOne = /^\/api\/node\/nodes\/a3\/memory\/([^/]+)$/.exec(path);
      if (memoryOne && method === "PATCH") {
        const body = request.postDataJSON();
        state.calls.push({ memory: memoryOne[1], body });
        // A change the test holds; meanwhile another tab replaced the memory, so Ensemble refuses it.
        if (state.hold?.id === memoryOne[1]) {
          await state.hold.until;
          const held = state.memories.find((item) => item.id === memoryOne[1]);
          const next = { ...held, id: `${held.id}-b`, content: held.content.replace(/\.$/, " and Codex."), updatedAt: new Date().toISOString() };
          held.supersededById = next.id;
          state.memories.push(next);
          return json({ error: "That memory changed while you were saving; it was not replaced." }, 409);
        }
        const row = state.memories.find((item) => item.id === memoryOne[1]);
        if (body.content !== undefined) {
          const next = { ...row, id: `${row.id}-2`, content: body.content, updatedAt: new Date().toISOString() };
          row.supersededById = next.id;
          state.memories.push(next);
          return json({ memory: next });
        }
        Object.assign(row, body.archived !== undefined ? { archived: body.archived, archivedAt: body.archived ? new Date().toISOString() : null } : {}, body.pinned !== undefined ? { pinned: body.pinned } : {});
        return json({ memory: row });
      }
      if (memoryOne && method === "DELETE") {
        state.calls.push({ memory: memoryOne[1], delete: true });
        state.memories = state.memories.filter((item) => item.id !== memoryOne[1]);
        return route.fulfill({ status: 204, headers: cors });
      }
      const patchRoom = /^\/api\/node\/rooms\/([^/]+)$/.exec(path);
      if (patchRoom && method === "PATCH") {
        const body = request.postDataJSON();
        state.calls.push({ room: patchRoom[1], body });
        const row = state.boot.rooms.find((item) => item.id === patchRoom[1]);
        Object.assign(row, body);
        return json({ room: row });
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    const overflowing = (selector) =>
      page.locator(selector).last().evaluate((root) => {
        const edge = root.getBoundingClientRect().right + 2;
        const clipped = (el) => {
          for (let up = el.parentElement; up && up !== root; up = up.parentElement) if (getComputedStyle(up).overflowX !== "visible" && up.getBoundingClientRect().right <= edge) return true;
          return false;
        };
        return [...root.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > edge && getComputedStyle(el).position !== "fixed" && !clipped(el)).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 80)} → ${Math.round(el.getBoundingClientRect().right)}`);
      });
    const fits = async (label, selector = "main") => assert.deepEqual(await overflowing(selector), [], `${label} fits at ${width}px`);
    const shot = async (name, target) => {
      if (!shots) return;
      if (target) await target.screenshot({ path: `${shots}/brain-${name}-${width}.png` });
      else await page.screenshot({ path: `${shots}/brain-${name}-${width}.png` });
    };
    /** Waits for something the page sends to the fixture. */
    const until = async (check, label) => {
      for (let tries = 0; tries < 200; tries += 1) {
        if (check()) return;
        await page.waitForTimeout(50);
      }
      assert.fail(`${label} at ${width}px`);
    };
    /** A message's action: the bar shows on hover, focus or a long press; focus works at every size. */
    const action = (message, name) => message.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name, exact: true });

    try {
      // A turn's trace opens from its reply, for the node's owner, in a drawer that fits a phone.
      await page.goto(`${WEB}/r/dm-a3`);
      const timeline = page.locator(".chat-timeline");
      const reply = timeline.locator('[id="m-r1"]');
      await reply.getByText("Fixed the build: the site builds again.").waitFor();
      assert.equal(await timeline.locator('[id="m-u1"]').getByRole("button", { name: "Trace", exact: true }).count(), 0, "a person's message has no trace");
      const traceButton = action(reply, "Trace");
      await traceButton.focus();
      await traceButton.click();
      const drawer = page.getByRole("dialog", { name: "Trace" });
      const summary = drawer.locator("[data-trace-summary]");
      await summary.waitFor();
      assert.equal(await summary.getAttribute("title"), "Partly done · gpt-6-luna-2026-10-01 · 18.2k tokens in, 1.3k out · 48s");
      assert.ok(await drawer.getByText("GitHub Copilot on Studio · Your AI plan · same session · 3 calls · its own tools too").isVisible(), "how the loop ran, the computer by its Ensemble name");
      assert.ok(await drawer.getByText("Asked for gpt-6-luna · sent gpt-6-luna · reported gpt-6-luna-2026-10-01").isVisible());
      const parts = drawer.locator("[data-trace-sections] tbody tr");
      assert.equal(await parts.count(), 4);
      assert.deepEqual(await parts.first().locator("td").allInnerTexts(), ["constitution/01-identity", "stable", "1k"]);
      assert.ok(await drawer.getByText("Left out to fit: node/58-workspace · 3 items · 120 tokens").isVisible());
      assert.ok(await drawer.getByText("5 calls · 3 own · 2 failed · 28 tools offered").isVisible());
      const own = drawer.locator("[data-trace-calls] tr[data-own]");
      assert.equal(await own.count(), 3, "the agent's own calls are marked");
      assert.equal(await own.nth(0).getByText("own · asked you").count(), 1);
      assert.equal(await own.nth(1).getByText("own", { exact: true }).count(), 1, "allowed with no question: just own");
      assert.equal(await own.nth(2).getByText("own · refused").count(), 1);
      assert.ok(await own.nth(0).getByText("820 in · 64 out").isVisible());
      assert.ok(await drawer.getByText("debugging · 7.3 · in full; Your skill · 2").isVisible(), "an owner's skill is never named by its id");
      assert.equal(await drawer.getByText("8b0c2f9e").count(), 0);
      assert.ok(await drawer.getByText("A memory · pinned").isVisible());
      assert.ok(await drawer.getByText("A task · overdue").isVisible());
      assert.ok(await drawer.getByText(/Routing · A direct chat: its node answers · woke 1 node/).isVisible());
      assert.ok(await drawer.getByText("Round 1: the screenshot is not in the chat").isVisible());
      assert.ok(await drawer.getByText("Left to do: Add the docs page screenshot").isVisible());
      assert.ok(await drawer.getByText("The reply itself says: done").isVisible());
      assert.deepEqual(state.calls.filter((row) => row.trace), [{ trace: "t1" }]);
      const text = await drawer.innerText();
      assert.doesNotMatch(text, /\u2014|--/, "no em dash or double hyphen in the trace");
      await fits("the trace", '[role="dialog"]');
      await shot("trace", drawer.locator("[data-drawer-panel]"));
      await drawer.locator("[data-trace-calls]").scrollIntoViewIfNeeded();
      await shot("trace-tools", drawer.locator("[data-drawer-panel]"));
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
      await drawer.waitFor({ state: "detached" });

      // The agent's own call in a folder: Ensemble's two answers and Don't allow, one press.
      const write = timeline.locator('[id="m-c-own-write"]');
      await write.getByText("@assistant-3 wants to run commands in ~/projects/site on Studio").waitFor();
      assert.deepEqual(await write.getByRole("group", { name: "Your answer" }).getByRole("button").allInnerTexts(), ["Allow", "Allow for this run", "Don't allow"]);
      assert.equal(await write.getByRole("button", { name: "Allow for this run" }).getAttribute("title"), "Changes and commands in ~/projects/site, in this chat for up to 30 days");
      assert.equal(await write.getByRole("button", { name: "About this question" }).count(), 1, "how far each answer goes is in its ⓘ");
      await write.scrollIntoViewIfNeeded();
      await shot("own-ask", write);
      await fits("an own-tool card");
      await write.getByRole("button", { name: "About this question" }).click();
      await page.getByRole("tooltip").getByText("Allow for this run covers this chat, for up to 30 days.", { exact: false }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("tooltip").waitFor({ state: "detached" });
      await write.getByRole("button", { name: "Allow for this run" }).click();
      await write.getByRole("button", { name: "Allowed @assistant-3 to run commands in ~/projects/site · For this run" }).waitFor();
      assert.deepEqual(state.calls.find((row) => row.decide === "dec-own-write"), { decide: "dec-own-write", body: { decision: "allow", scope: "once", reason: "Allow changes and commands for this run" } }, "one press sends Ensemble's own words");

      // A program: once or for this run; an app on the node's own agent screen: this mission or not.
      const program = timeline.locator('[id="m-c-own-program"]');
      assert.deepEqual(await program.getByRole("group", { name: "Your answer" }).getByRole("button").allInnerTexts(), ["Allow once", "Allow for this run", "Don't allow"]);
      const app = timeline.locator('[id="m-c-app"]');
      assert.deepEqual(await app.getByRole("group", { name: "Your answer" }).getByRole("button").allInnerTexts(), ["This mission", "Don't allow"]);
      assert.ok(await app.getByText("Terminal", { exact: true }).isVisible());
      await app.scrollIntoViewIfNeeded();
      await shot("app-ask", app);
      await app.getByRole("button", { name: "Don't allow" }).click();
      await app.getByRole("button", { name: "Didn't allow @assistant-3 to use Terminal on its own screen" }).waitFor();
      assert.deepEqual(state.calls.find((row) => row.decide === "dec-app")?.body, { decision: "deny", scope: "once" });

      // A plan re-planning, a partial step with what is left, and the stuck step's one decision.
      await page.goto(`${WEB}/r/crew`);
      const plan = timeline.locator('[id="m-plan1"]');
      await plan.getByText("Re-planning").first().waitFor();
      assert.ok(await plan.getByText("Partly done").first().isVisible(), "a partial step says so");
      const decision = timeline.locator('[id="m-c-plan"]');
      await decision.getByText("@lead's plan needs your decision").waitFor();
      assert.deepEqual(await decision.getByRole("group", { name: "Your decision" }).getByRole("button", { name: /Try again|Finish without it/ }).allInnerTexts(), ["Try again", "Finish without it"]);
      assert.equal(await decision.getByRole("button", { name: "Approve" }).count(), 0, "not the generic Approve");
      assert.equal(await decision.getByRole("button", { name: "Finish without it" }).getAttribute("title"), "the plan ends without this step");
      await decision.scrollIntoViewIfNeeded();
      await shot("plan-decision", decision);
      await fits("a plan decision");
      await decision.getByRole("button", { name: "Finish without it" }).click();
      await decision.getByRole("button", { name: "Chose “Finish without it” for @tester's step" }).waitFor();
      assert.deepEqual(state.calls.find((row) => row.settle), { settle: "c-plan", body: { decision: "discard" } }, "one press settles it");
      await plan.scrollIntoViewIfNeeded();
      await shot("plan-replanning", plan);

      // A crew answers coordinated or with independent views: one row, its words in the ⓘ.
      await page.getByRole("button", { name: "Site crew settings", exact: true }).click();
      const crew = page.getByRole("dialog", { name: "Crew settings", exact: true });
      const modes = crew.getByRole("radiogroup", { name: "Group answers" });
      await modes.waitFor();
      assert.equal(await modes.getByRole("radio", { name: "Coordinated" }).getAttribute("aria-checked"), "true");
      assert.ok(await crew.getByText("When a message names several nodes.").isVisible());
      await modes.getByRole("radio", { name: "Independent" }).click();
      await modes.locator('[role="radio"][aria-checked="true"]', { hasText: "Independent" }).waitFor();
      await until(() => state.calls.some((row) => row.room), "the mode is saved");
      assert.deepEqual(state.calls.find((row) => row.room), { room: "crew", body: { mode: "independent" } });
      await fits("crew settings", '[role="dialog"]');
      await shot("group-mode", crew.locator("[data-drawer-panel]"));
      await page.keyboard.press("Escape");

      // A node's memories: markers, pin, change the words, restore an archived one, delete.
      await page.goto(`${WEB}/n/a3`);
      const settings = page.getByRole("dialog", { name: "Node settings" });
      const list = settings.locator("[data-memories]");
      await list.getByText("Run coding work with GitHub Copilot.").waitFor();
      const row = (text) => list.locator("li").filter({ hasText: text });
      assert.deepEqual(await row("Run coding work").getByLabel("About this memory").locator("span span").allInnerTexts(), ["Pinned", "All your nodes", "Key: coding agent"]);
      assert.deepEqual(await row("British spelling").getByLabel("About this memory").locator("span span").allInnerTexts(), ["In “Site crew”"]);
      assert.equal(await settings.getByText("Deploy only on Fridays.").count(), 0, "archived ones are folded");
      await row("British spelling").scrollIntoViewIfNeeded();
      await shot("memory", settings.locator("[data-drawer-panel]"));
      // Two rows at once: each stays busy until its own request ends. A refusal shows even when its row is
      // gone by then: the drawer is closed first, and another tab replaced that memory meanwhile.
      let release;
      state.hold = { id: "m1", until: new Promise((resolve) => (release = resolve)) };
      const unpin = row("Run coding work").getByRole("button", { name: "Unpin", exact: true });
      await unpin.click();
      await row("deploys from main").getByRole("button", { name: "Pin", exact: true }).click();
      await row("deploys from main").getByLabel("About this memory").getByText("Pinned").waitFor();
      assert.deepEqual(state.calls.find((call) => call.memory === "m3"), { memory: "m3", body: { pinned: true } });
      assert.ok(await unpin.isDisabled(), "the first row stays busy while its own request runs");
      await page.keyboard.press("Escape");
      await settings.waitFor({ state: "detached" });
      release();
      await page.getByText("That memory changed while you were saving; it was not replaced.").waitFor();
      state.hold = null;
      await page.goto(`${WEB}/n/a3`);
      await list.getByText("Run coding work with GitHub Copilot and Codex.").waitFor();
      assert.equal(await list.getByText("Run coding work with GitHub Copilot.", { exact: true }).count(), 0, "the replaced revision is gone");
      await row("British spelling").getByRole("button", { name: "Edit", exact: true }).click();
      await settings.getByLabel("What it remembers").fill("Use British spelling in the docs and the app.");
      await settings.getByRole("button", { name: "Save", exact: true }).last().click();
      await list.getByText("Use British spelling in the docs and the app.").waitFor();
      assert.deepEqual(state.calls.find((call) => call.memory === "m2"), { memory: "m2", body: { content: "Use British spelling in the docs and the app." } });
      await settings.getByRole("button", { name: /Archived \(1\)/ }).click();
      await settings.getByText("Deploy only on Fridays.").waitFor();
      await settings.locator("li").filter({ hasText: "Deploy only on Fridays." }).getByRole("button", { name: "Restore", exact: true }).click();
      await list.getByText("Deploy only on Fridays.").waitFor();
      assert.deepEqual(state.calls.find((call) => call.memory === "m4"), { memory: "m4", body: { archived: false } });
      await row("deploys from main").getByRole("button", { name: "Delete", exact: true }).click();
      await list.getByText("The site deploys from main.").waitFor({ state: "detached" });
      assert.ok(state.calls.some((call) => call.memory === "m3" && call.delete));
      await fits("node settings", '[role="dialog"]');
      await page.keyboard.press("Escape");

      // Whether a computer's desktop apps can be used, the facts in its ⓘ.
      await page.goto(`${WEB}/settings`);
      const ready = page.locator('[data-desktop="ready"]');
      await ready.waitFor();
      assert.equal(await ready.innerText(), "Desktop apps: on an agent screen or yours.");
      assert.equal(await page.locator('[data-desktop="not-ready"]').innerText(), "Desktop apps: not ready.");
      await ready.scrollIntoViewIfNeeded();
      await ready.getByRole("button", { name: "About desktop apps on Studio" }).click();
      const tip = page.getByRole("tooltip");
      await tip.getByText("Agent screen: ready (GNOME Shell 50.1). A private desktop of the node's own, which you can watch.").waitFor();
      assert.ok(await tip.getByText("Your screen: ready (Wayland). Allowed before: it starts without asking.").isVisible());
      assert.ok(await tip.getByText("Recordings are WebM.").isVisible());
      await fits("Computers");
      await shot("computers");
    } catch (error) {
      if (shots) await page.screenshot({ path: `${shots}/brain-failure-${width}.png` }).catch(() => undefined);
      console.error(`At ${width}px, ${page.url()}:`, { errors, unexpected: [...new Set(unexpected)] });
      throw error;
    }
    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`brain ui ok at ${width}px`);
  }
} finally {
  await browser.close();
}
