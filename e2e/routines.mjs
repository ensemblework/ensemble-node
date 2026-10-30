/**
 * Local, stateful browser fixture for Routines (Ensemble docs/35 §6.5): the list grouped by node,
 * pausing and resuming, a scheduled routine made from presets in a time zone, a webhook routine's
 * token shown once (and a new one), Run now, a run's card in a drawer with what its agent was told,
 * editing, deleting, and a node's routines in its settings. Never points at a hosted account or calls a
 * model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const PACKET = "## Goal\nA morning summary of the board\n\n## Your part\nRead what changed on the board since yesterday and what is due this week.\n\n## Constraints\nRead only.\n\n## Who you are\nThe coding agent for Mira, working through @lead.\n\n## Report\nCall report_result once.";

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini" };
  const nodes = [
    { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") },
    { ...base, id: "builder", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5") },
    { ...base, id: "tester", slug: "tester", name: "Tester", role: "tester", avatar: avatar("#A9DFBF") },
  ];
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const ben = { id: "p-ben", kind: "person", handle: "ben", accountId: "ben", role: "member", name: "Ben", responsibility: null, me: false };
  const member = (node) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead: node.id === "lead", representative: true, node });
  const room = (id, title, kind, members) => ({ id, title, kind, members, createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at(-60), pinned: [], invites: [], leadNodeIds: ["lead"], last: null });
  const rooms = [
    room("dm-lead", "Lead", "dm", [me, member(nodes[0])]),
    room("dm-builder", "Builder", "dm", [me, member(nodes[1])]),
    room("dm-tester", "Tester", "dm", [me, member(nodes[2])]),
    room("crew", "Release crew", "crew", [me, ...nodes.map(member)]),
    room("launch", "Launch", "room", [me, ben, member(nodes[1])]),
  ];
  const run = (id, extra) => ({ id, trigger: "schedule", status: "started", missionId: null, missionStatus: null, error: null, dueAt: at(-21 * 60), startedAt: at(-21 * 60), createdAt: at(-21 * 60), items: 0, ...extra });
  const routines = [
    {
      id: "r-morning", title: "Morning summary", nodeId: "lead", roomId: "dm-lead", action: "prompt", instruction: "Summarise what changed on my board since yesterday.", template: null,
      trigger: "schedule", cron: "0 9 * * 1-5", timezone: "Asia/Kolkata", event: null, webhook: null, notify: "always", status: "active",
      when: "Weekdays at 09:00 (Asia/Kolkata)", nextRunAt: at(181), lastRunAt: at(-21 * 60),
      runs: [run("run-1", { missionId: "mission-1", missionStatus: "succeeded" })],
    },
    {
      id: "r-deploy", title: "Deploy watch", nodeId: "builder", roomId: "crew", action: "prompt", instruction: "Read the deploy's logs and say what failed.", template: null,
      trigger: "webhook", cron: null, timezone: "Asia/Kolkata", event: null, webhook: { path: "/api/node/hooks/routines/r-deploy", hasToken: true }, notify: "needed", status: "active",
      when: "When its webhook is called", nextRunAt: null, lastRunAt: null, runs: [],
    },
    {
      id: "r-board", title: "Check moved tasks", nodeId: "tester", roomId: "dm-tester", action: "prompt", instruction: "Check the page of each task that moved.", template: null,
      trigger: "event", cron: null, timezone: "Asia/Kolkata", event: { on: "task", actions: ["move"], space: "space-acme", spaceName: "Acme", windowSeconds: 60 }, webhook: null, notify: "never", status: "paused",
      when: "When a task changes (move)", nextRunAt: null, lastRunAt: at(-3000),
      runs: [run("run-b1", { trigger: "event", status: "skipped", error: "The routine was paused.", items: 3, startedAt: null })],
    },
  ];
  const step = { id: "w1", nodeId: "lead", handle: "lead", name: "lead", kind: "research", executor: "self", brief: "Summarise what changed on my board since yesterday.", after: [], status: "done", outcome: "done", result: "Three tasks moved; two are due on Friday.", progress: null, startedAt: at(-1260), endedAt: at(-1255), requirementIds: [], held: false, heldBy: null, attempt: 1, attempts: [], sessionId: "sess-m" };
  const routineLink = { id: "r-morning", runId: "run-1", title: "Morning summary", notify: "always", trigger: "Weekdays at 09:00 (Asia/Kolkata)" };
  const card = { id: "mission-1", roomId: "dm-lead", seq: 2, kind: "plan", body: "Work", authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: { type: "plan", version: 4, contract: 3, missionId: "mission-1", kind: "self", leadNodeId: "lead", leadHandle: "lead", status: "succeeded", goal: "Morning summary", requirements: [], deferred: [], steps: [step], routine: routineLink }, private: false, mentions: [], rootMessageId: null, clientId: null, planId: "r-morning", createdAt: at(-1260) };
  const stepRun = { id: "run-card-1", roomId: "dm-lead", seq: 3, kind: "run", body: "Research: Summarise what changed on my board", authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: { plan: { id: "mission-1", step: "w1" }, jobId: "j-morning", status: "succeeded", told: PACKET, session: { id: "sess-m", status: "idle", agent: "Claude Code", agentId: "claude-code", queue: [] } }, private: false, mentions: [], rootMessageId: null, clientId: null, planId: "mission-1", createdAt: at(-1259) };
  const report = { id: "report-1", roomId: "dm-lead", seq: 4, kind: "text", body: "Three tasks moved since yesterday; two are due on Friday.", authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-1254) };
  const boot = { me: { id: "me", name: "Mira Chen", email: "mira@fieldnote.example", verified: true }, nodes, rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  const job = { id: "j-morning", taskId: "task", title: "Summarise", kind: "code", status: "succeeded", provider: "claude-code", model: "claude-opus-4-6", modelUsed: null, reasoningEffort: null, contextTier: null, progress: null, summary: "Done.", error: null, turns: 1, toolCalls: 3, runId: null, deviceName: "Development laptop", yours: true, folder: "notes", branch: "main", files: [], createdAt: at(-1259), startedAt: at(-1259), finishedAt: at(-1256) };
  return { boot, routines, messages: { "dm-lead": [card, stepRun, report] }, cards: { "mission-1": card }, jobs: { "j-morning": job }, runs: { "r-morning": [...routines[0].runs], "r-deploy": [], "r-board": [...routines[2].runs] }, calls: [], reads: [], made: 0 };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The few schedules this fixture makes, worded as Ensemble words them. */
function when(body) {
  if (body.trigger === "webhook") return "When its webhook is called";
  if (body.trigger === "event") return `When a ${body.event.on} changes${body.event.actions?.length ? ` (${body.event.actions.join(", ")})` : ""}`;
  const [minute, hour, , , weekday] = body.cron.split(" ");
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  if (weekday === "1-5") return `Weekdays at ${time} (${body.timezone})`;
  if (/^\d$/.test(weekday)) return `Every ${DAYS[Number(weekday)]} at ${time} (${body.timezone})`;
  if (weekday === "*" && body.cron.endsWith("* * *")) return `Every day at ${time} (${body.timezone})`;
  return `${body.cron} (${body.timezone})`;
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce", timezoneId: "Asia/Kolkata", locale: "en-GB" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: WEB });
    await context.addInitScript(() => {
      window.__nodeEvents = [];
      window.EventSource = class extends EventTarget {
        constructor() { super(); window.__nodeEvents.push(this); setTimeout(() => this.onopen?.(new Event("open")), 0); }
        close() { window.__nodeEvents = window.__nodeEvents.filter((item) => item !== this); }
      };
    });
    const page = await context.newPage();
    const errors = [];
    const unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dialogs = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (method === "GET") state.reads.push(path);
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/evidence") return json({ evidence: [] });
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/node/models") return json({ default: "gpt-5-mini", options: [] });
      // The owner's own Ensemble settings: the run profile a node's sessions use, and Node's browsing rule.
      if (path === "/api/settings") return json({ settings: { runProfiles: [], defaultRunProfileId: null, node: { askBeforeBrowsing: false } }, connectors: [] });
      if (/^\/api\/node\/nodes\/[^/]+\/memory$/.test(path)) return json({ memories: [] });
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      const plan = /^\/api\/node\/plans\/([^/]+)$/.exec(path);
      if (plan && method === "GET") {
        const card = state.cards[plan[1]];
        return card ? json({ message: card, runs: Object.values(state.messages).flat().filter((row) => row.planId === card.id && row.kind === "run") }) : json({ error: "That plan is not available." }, 404);
      }
      const job = /^\/api\/agent\/jobs\/([^/]+)$/.exec(path);
      if (job && state.jobs[job[1]]) return json({ job: state.jobs[job[1]], log: "", events: [] });
      if (path === "/api/node/routines" && method === "GET") return json({ routines: state.routines });
      if (path === "/api/node/routines" && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ create: body });
        const id = `r-new-${++state.made}`;
        const routine = { id, title: body.title, nodeId: body.nodeId, roomId: body.roomId ?? `dm-${body.nodeId}`, action: body.template ? "plan" : "prompt", instruction: body.instruction ?? null, template: body.template ?? null, trigger: body.trigger, cron: body.cron ?? null, timezone: body.timezone, event: body.event ?? null, webhook: body.trigger === "webhook" ? { path: `/api/node/hooks/routines/${id}`, hasToken: true } : null, notify: body.notify, status: "active", when: when(body), nextRunAt: body.trigger === "schedule" ? at(60 * 50) : null, lastRunAt: null, runs: [] };
        state.routines.push(routine);
        state.runs[id] = [];
        return json({ routine, ...(body.trigger === "webhook" ? { token: `tok-${id}-once` } : {}) }, 201);
      }
      const routine = /^\/api\/node\/routines\/([^/]+)(\/run|\/token|\/runs)?$/.exec(path);
      if (routine) {
        const [, id, tail] = routine;
        const row = state.routines.find((item) => item.id === id);
        if (!row) return json({ error: "That routine is not yours." }, 404);
        if (!tail && method === "PATCH") {
          const body = request.postDataJSON();
          state.calls.push({ patch: id, body });
          Object.assign(row, body);
          if (body.cron || body.trigger || body.timezone) row.when = when(row);
          if (body.status === "paused") row.nextRunAt = null;
          if (body.status === "active" && row.trigger === "schedule") row.nextRunAt = at(120);
          return json({ routine: row });
        }
        if (!tail && method === "DELETE") {
          state.calls.push({ delete: id });
          state.routines = state.routines.filter((item) => item.id !== id);
          return route.fulfill({ status: 204, headers: cors });
        }
        if (tail === "/run") {
          state.calls.push({ run: id });
          const made = { id: `run-now-${state.calls.length}`, trigger: "manual", status: "pending", missionId: null, missionStatus: null, error: null, dueAt: new Date().toISOString(), startedAt: null, createdAt: new Date().toISOString(), items: 0 };
          state.runs[id].unshift(made);
          row.runs = [made, ...row.runs].slice(0, 5);
          return json({ run: made }, 202);
        }
        if (tail === "/token") {
          state.calls.push({ token: id });
          return json({ token: `tok-${id}-renewed` });
        }
        if (tail === "/runs") return json({ runs: state.runs[id] ?? [] });
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    /** Nothing sticks out past the screen's right edge, unless a container that fits clips or scrolls it. */
    const overflowing = (selector) =>
      page.locator(selector).first().evaluate((root) =>
        [...root.querySelectorAll("*")]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (!box.width || box.right <= window.innerWidth + 1 || getComputedStyle(el).position === "fixed") return false;
            for (let up = el.parentElement; up && up !== root.parentElement; up = up.parentElement) {
              const style = getComputedStyle(up);
              if (style.overflowX !== "visible" && up.getBoundingClientRect().right <= window.innerWidth + 1) return false;
            }
            return true;
          })
          .slice(0, 6)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 80)} → ${Math.round(el.getBoundingClientRect().right)}`),
      );
    const fits = async () => assert.deepEqual(await overflowing("main"), [], `${width}px fits`);
    const drawerFits = async () => assert.deepEqual(await overflowing('[role="dialog"]'), [], `${width}px: the drawer fits`);

    // The list: grouped by node, when each runs and how its last run went.
    await page.goto(`${WEB}/routines`);
    await page.getByRole("heading", { name: "Routines", level: 1 }).waitFor();
    const leadGroup = page.getByRole("region", { name: "Lead's routines" });
    const morning = leadGroup.getByRole("article", { name: "Morning summary" });
    await morning.waitFor();
    assert.ok(await morning.getByText("Weekdays at 09:00 (Asia/Kolkata) · Posts every result · reports in Lead's chat").isVisible());
    assert.ok(await morning.getByText("Next run in 3h").isVisible(), "the next run, relative");
    assert.ok(await morning.getByText("Succeeded").isVisible(), "the last run's status");
    const deploy = page.getByRole("region", { name: "Builder's routines" }).getByRole("article", { name: "Deploy watch" });
    assert.ok(await deploy.getByText("When its webhook is called · Posts when it needs you · reports in Release crew").isVisible());
    assert.match((await deploy.locator("code").first().textContent()) ?? "", /^https?:\/\/[^/]+\/api\/node\/hooks\/routines\/r-deploy$/, "the webhook's full address");
    const board = page.getByRole("region", { name: "Tester's routines" }).getByRole("article", { name: "Check moved tasks" });
    assert.ok(await board.getByText("Paused: it runs only when you run it.").isVisible());
    assert.ok(await board.getByText(/^When a task changes \(move\) in Acme · /).isVisible(), "the space it watches, by name");
    const boardSwitch = board.getByRole("switch", { name: "Check moved tasks active" });
    assert.equal(await boardSwitch.getAttribute("aria-checked"), "false");
    await boardSwitch.click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Check moved tasks active"]')?.getAttribute("aria-checked") === "true");
    assert.deepEqual(state.calls.at(-1), { patch: "r-board", body: { status: "active" } });
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/routines-${width}.png`, fullPage: true });

    // A new scheduled routine: problems first, then presets in a time zone, and Ensemble's words after.
    await page.getByRole("button", { name: "New routine" }).first().click();
    const form = page.getByRole("dialog", { name: "New routine" });
    await form.getByRole("button", { name: "Create routine" }).click();
    await form.getByText("Give it a title.").waitFor();
    assert.ok(await form.getByText("Say what it should do each time.").isVisible());
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("placeholder")), "Morning summary", "the first problem takes focus");
    assert.equal(state.calls.filter((call) => call.create).length, 0, "nothing is sent while something is missing");
    await form.getByLabel("Title", { exact: true }).fill("Weekly review");
    await form.getByLabel("Node", { exact: true }).selectOption("builder");
    const reports = await form.getByLabel("Reports in", { exact: true }).locator("option").allTextContents();
    assert.deepEqual(reports, ["Builder's chat", "Release crew"], "only where the owner reads alone");
    await form.getByLabel("Instruction").fill("Review what the crew shipped this week.");
    await form.getByLabel("Repeats").selectOption("weekly");
    await form.getByLabel("Day of the week").selectOption("5");
    await form.getByLabel("Time", { exact: true }).fill("16:30");
    const zone = form.getByRole("combobox", { name: "Time zone" });
    assert.match(await zone.inputValue(), /^Asia\/(Kolkata|Calcutta)$/, "the browser's own time zone by default");
    await zone.click();
    await zone.fill("london");
    await form.getByRole("option", { name: /Europe\/London/ }).click();
    assert.equal(await zone.inputValue(), "Europe/London");
    await form.getByText("Every Friday at 16:30 (Europe/London) · 30 16 * * 5").waitFor();
    await form.getByLabel(/Only when something needs me/).check();
    await drawerFits();
    if (shots) await page.screenshot({ path: `${shots}/routine-form-${width}.png` });
    await form.getByRole("button", { name: "Create routine" }).click();
    await page.getByText("Saved. Every Friday at 16:30 (Europe/London).").waitFor();
    assert.deepEqual(state.calls.at(-1), { create: { title: "Weekly review", nodeId: "builder", roomId: "dm-builder", instruction: "Review what the crew shipped this week.", trigger: "schedule", timezone: "Europe/London", cron: "30 16 * * 5", notify: "needed" } });
    await page.getByRole("dialog").waitFor({ state: "detached" });
    const weekly = page.getByRole("region", { name: "Builder's routines" }).getByRole("article", { name: "Weekly review" });
    assert.ok(await weekly.getByText("Every Friday at 16:30 (Europe/London) · Posts when it needs you · reports in Builder's chat").isVisible(), "Ensemble's own words once saved");

    // A webhook routine: its address and token, shown once.
    await page.getByRole("button", { name: "New routine" }).first().click();
    const hookForm = page.getByRole("dialog", { name: "New routine" });
    await hookForm.getByLabel("Title", { exact: true }).fill("Deploy finished");
    await hookForm.getByLabel("Instruction").fill("Read the deploy's logs.");
    await hookForm.getByRole("radio", { name: "Webhook" }).click();
    await hookForm.getByText(/Saving gives this routine its own address and a token, shown once/).waitFor();
    await hookForm.getByRole("button", { name: "Create routine" }).click();
    const panel = page.getByRole("region", { name: "Webhook token" });
    await panel.getByText("Copy the token now. You will not see it again.").waitFor();
    const created = state.calls.at(-1).create;
    assert.equal(created.trigger, "webhook");
    assert.equal("cron" in created, false);
    assert.ok(await panel.getByText("tok-r-new-2-once", { exact: true }).isVisible(), "the token, once");
    assert.match((await panel.locator("code").first().textContent()) ?? "", /\/api\/node\/hooks\/routines\/r-new-2$/);
    await panel.getByRole("button", { name: "Copy the token" }).click();
    await panel.getByText("Copied").waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "tok-r-new-2-once");
    if (shots) await page.screenshot({ path: `${shots}/routine-token-${width}.png` });
    await panel.getByRole("button", { name: "Done" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.getByText("tok-r-new-2-once").count(), 0, "never shown again");
    // A new token for an existing webhook: it asks, shows it once, and it goes.
    await deploy.getByRole("button", { name: "New token" }).click();
    await deploy.getByText("tok-r-deploy-renewed", { exact: true }).waitFor();
    assert.equal(dialogs.at(-1), "Make a new token? The one you have stops working at once.");
    assert.deepEqual(state.calls.at(-1), { token: "r-deploy" });
    await deploy.getByRole("button", { name: "Done" }).click();
    assert.equal(await page.getByText("tok-r-deploy-renewed").count(), 0);

    // Run now: the run is first in its history.
    await morning.getByRole("button", { name: "Run now" }).click();
    await page.getByText("Started “Morning summary”.").waitFor();
    assert.deepEqual(state.calls.at(-1), { run: "r-morning" });
    const history = morning.getByRole("list", { name: "Runs of Morning summary" });
    await history.waitFor();
    const firstRun = history.locator("li").first();
    assert.ok(await firstRun.getByText("Waiting").isVisible());
    assert.ok(await firstRun.getByText(/By hand/).isVisible());
    await page.getByRole("region", { name: "Tester's routines" }).getByRole("button", { name: "History" }).click();
    await board.getByText("The routine was paused.").waitFor();
    assert.ok(await board.getByText(/On a change · .* · 3 changes/).isVisible(), "what a run gathered");

    // A routine that changed elsewhere (a webhook call ran it): the event stream reads the list again.
    const hooked = state.routines.find((item) => item.id === "r-deploy");
    hooked.runs = [{ id: "run-d1", trigger: "webhook", status: "failed", missionId: null, missionStatus: null, error: "The deploy log was empty.", dueAt: at(-1), startedAt: at(-1), createdAt: at(-1), items: 0 }];
    hooked.lastRunAt = at(-1);
    const reads = () => state.reads.filter((path) => path === "/api/node/routines").length;
    const before = reads();
    await page.evaluate(() => { for (const source of window.__nodeEvents) source.dispatchEvent(new MessageEvent("node.routine", { data: JSON.stringify({ id: "r-deploy" }) })); });
    await deploy.getByText("Failed", { exact: true }).waitFor();
    assert.equal(reads(), before + 1, "one read for the change, no polling");

    // A run's card opens in a drawer: the routine on it, and what its agent was told.
    await history.locator("li").filter({ hasText: "Succeeded" }).getByRole("button", { name: "Open" }).click();
    const drawer = page.getByRole("dialog", { name: "Morning summary" });
    await drawer.getByText("Three tasks moved; two are due on Friday.").waitFor();
    assert.equal(await drawer.getByRole("link", { name: "Routine · Morning summary" }).getAttribute("href"), "/routines#routine-r-morning");
    await drawer.getByRole("button", { name: /Details/ }).click();
    const told = drawer.getByRole("button", { name: "What the agent was told" });
    await told.click();
    const packet = drawer.getByRole("region", { name: "What the agent was told" });
    await packet.getByText("Read what changed on the board since yesterday and what is due this week.").waitFor();
    assert.equal(await packet.getByText("Your part", { exact: true }).evaluate((el) => getComputedStyle(el).textTransform), "uppercase", "the packet's parts read as small labels");
    assert.equal(await drawer.getByRole("link", { name: "Open Lead's chat" }).getAttribute("href"), "/r/dm-lead");
    await drawerFits();
    if (shots) await page.screenshot({ path: `${shots}/routine-run-${width}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });

    // Edit: the form opens as the routine is; only what is sent changes.
    await morning.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit routine" });
    assert.equal(await edit.getByLabel("Title", { exact: true }).inputValue(), "Morning summary");
    assert.equal(await edit.getByLabel("Repeats").inputValue(), "weekdays");
    assert.equal(await edit.getByLabel("Time", { exact: true }).inputValue(), "09:00");
    assert.equal(await edit.getByRole("combobox", { name: "Time zone" }).inputValue(), "Asia/Kolkata");
    assert.equal(await edit.getByRole("combobox", { name: "Node", exact: true }).count(), 0, "a routine's node does not change");
    await edit.getByLabel("Time", { exact: true }).fill("08:15");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Saved. Weekdays at 08:15 (Asia/Kolkata).").waitFor();
    assert.deepEqual(state.calls.at(-1), { patch: "r-morning", body: { title: "Morning summary", instruction: "Summarise what changed on my board since yesterday.", trigger: "schedule", timezone: "Asia/Kolkata", cron: "15 8 * * 1-5", notify: "always" } });

    // Delete, after a confirm.
    await weekly.getByRole("button", { name: "Delete" }).click();
    await weekly.waitFor({ state: "detached" });
    assert.equal(dialogs.at(-1), "Delete “Weekly review”? It stops running. What its runs did stays.");
    assert.deepEqual(state.calls.at(-1), { delete: "r-new-1" });
    await fits();

    // A node's routines in its settings, and a new one for that node.
    await page.goto(`${WEB}/r/dm-lead?settings=1`);
    const settings = page.getByRole("dialog", { name: "Node settings" });
    await settings.getByRole("article", { name: "Morning summary" }).waitFor();
    assert.equal(await settings.getByRole("article", { name: "Morning summary" }).getByRole("link", { name: "Edit or see its runs" }).getAttribute("href"), "/routines#routine-r-morning");
    await settings.getByRole("button", { name: "New routine" }).click();
    const inline = settings.getByRole("form", { name: "New routine" });
    assert.ok(await inline.getByText("@lead").isVisible(), "preset to this node");
    await inline.getByLabel("Title", { exact: true }).fill("Evening wrap-up");
    await inline.getByLabel("Instruction").fill("Say what is left for tomorrow.");
    await inline.getByLabel("Repeats").selectOption("daily");
    await inline.getByLabel("Time", { exact: true }).fill("18:00");
    await inline.getByRole("button", { name: "Create routine" }).click();
    await settings.getByRole("article", { name: "Evening wrap-up" }).waitFor();
    const made = state.calls.at(-1).create;
    assert.equal(made.nodeId, "lead");
    assert.equal(made.cron, "0 18 * * *");
    assert.match(made.timezone, /^Asia\/(Kolkata|Calcutta)$/);
    if (shots) await page.screenshot({ path: `${shots}/node-routines-${width}.png` });

    // A plan card's routine chip opens Routines at its routine.
    await page.goto(`${WEB}/routines#routine-r-deploy`);
    await page.waitForFunction(() => document.getElementById("routine-r-deploy")?.className.includes("ring-2"));
    assert.ok(await page.locator("#routine-r-deploy").isVisible());

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)].filter((path) => !path.includes("/api/runs/")), [], "no unmocked API calls");
    await context.close();
    console.log(`routines ok at ${width}px`);
  }
} finally {
  await browser.close();
}
