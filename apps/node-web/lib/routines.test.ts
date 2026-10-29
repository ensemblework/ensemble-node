import assert from "node:assert/strict";
import test from "node:test";
import {
  createBody,
  cronProblem,
  cronSchedule,
  DEFAULT_SCHEDULE,
  draftOf,
  draftProblems,
  isTimeZone,
  itemsText,
  matchTimeZones,
  newDraft,
  parseTemplate,
  patchBody,
  reportRooms,
  routinesByNode,
  runBadge,
  runLive,
  runTrigger,
  scheduleCron,
  scheduleNote,
  scheduleProblem,
  scheduleText,
  untilText,
  webhookUrl,
  type Schedule,
} from "./routines";
import type { Member, NodePublic, Room, Routine } from "./types";

const schedule = (extra: Partial<Schedule>): Schedule => ({ ...DEFAULT_SCHEDULE, ...extra });

test("each preset becomes a five-field cron; a field that is not valid gives none", () => {
  assert.equal(scheduleCron(schedule({ preset: "daily", time: "09:00" })), "0 9 * * *");
  assert.equal(scheduleCron(schedule({ preset: "weekdays", time: "18:30" })), "30 18 * * 1-5");
  assert.equal(scheduleCron(schedule({ preset: "weekly", time: "07:05", weekday: 0 })), "5 7 * * 0");
  assert.equal(scheduleCron(schedule({ preset: "monthly", time: "23:59", day: 31 })), "59 23 31 * *");
  assert.equal(scheduleCron(schedule({ preset: "hourly", minute: 15 })), "15 * * * *");
  assert.equal(scheduleCron(schedule({ preset: "custom", cron: "  */15   9-17 * *  1-5 " })), "*/15 9-17 * * 1-5", "a custom cron is tidied");
  assert.equal(scheduleCron(schedule({ preset: "daily", time: "25:00" })), null);
  assert.equal(scheduleCron(schedule({ preset: "hourly", minute: 60 })), null);
  assert.equal(scheduleCron(schedule({ preset: "weekly", weekday: 7 })), null);
  assert.equal(scheduleCron(schedule({ preset: "monthly", day: 0 })), null);
  assert.equal(scheduleCron(schedule({ preset: "custom", cron: "0 9 * *" })), null);
});

test("a cron reads back as its preset when it is one; anything else stays custom", () => {
  const round = (preset: Schedule) => cronSchedule(scheduleCron(preset));
  for (const preset of [schedule({ preset: "daily", time: "06:45", minute: 45 }), schedule({ preset: "weekdays", time: "09:00" }), schedule({ preset: "weekly", time: "12:30", weekday: 5, minute: 30 }), schedule({ preset: "monthly", time: "08:00", day: 15 })]) {
    const back = round(preset);
    assert.equal(back.preset, preset.preset);
    assert.equal(back.time, preset.time);
    assert.equal(back.weekday, preset.weekday);
    assert.equal(back.day, preset.day);
  }
  assert.deepEqual([cronSchedule("15 * * * *").preset, cronSchedule("15 * * * *").minute], ["hourly", 15]);
  assert.equal(cronSchedule("00 09 * * MON-FRI").preset, "weekdays", "leading zeros and day names");
  assert.equal(cronSchedule("0 9 * * 1,2,3,4,5").preset, "weekdays");
  assert.deepEqual([cronSchedule("0 9 * * 7").preset, cronSchedule("0 9 * * 7").weekday], ["weekly", 0], "7 is Sunday too");
  assert.equal(cronSchedule("0 9 * * fri").weekday, 5);
  assert.deepEqual([cronSchedule("@daily").preset, cronSchedule("@daily").time], ["daily", "00:00"]);
  assert.equal(cronSchedule("@daily").cron, "@daily", "the cron as written stays");
  for (const custom of ["*/15 * * * *", "0 9 * 1 *", "0 9 1 * 1", "0 9-17 * * *", "0 9 * * 1-3", "@yearly", "bad", "", "0 9 * * * *"]) assert.equal(cronSchedule(custom).preset, "custom", custom);
  assert.equal(cronSchedule("0 9 1 * 1").cron, "0 9 1 * 1");
});

test("a custom cron is checked field by field before Ensemble checks it again", () => {
  assert.equal(cronProblem("0 9 * * 1-5"), null);
  assert.equal(cronProblem("*/15 9-17 1,15 jan-jun mon-fri"), null);
  assert.equal(cronProblem("@hourly"), null);
  assert.match(cronProblem("") ?? "", /^Write a schedule/);
  assert.match(cronProblem("@sometimes") ?? "", /not a schedule Ensemble knows/);
  assert.match(cronProblem("0 9 * *") ?? "", /five fields/);
  assert.equal(cronProblem("75 9 * * *"), "“75” is not a valid minute (0–59).");
  assert.equal(cronProblem("0 24 * * *"), "“24” is not a valid hour (0–23).");
  assert.equal(cronProblem("0 9 0 * *"), "“0” is not a valid day of month (1–31).");
  assert.equal(cronProblem("0 9 * * 8"), "“8” is not a valid day of week (0–7).");
  assert.equal(cronProblem("*/0 * * * *"), "“*/0” has a step that is not a whole number above 0.");
  assert.equal(cronProblem("0 9 * * funday"), "“funday” is not a valid day of week (0–7).");
});

test("a schedule says what is missing, notes skipped months and reads as Ensemble words it", () => {
  assert.equal(scheduleProblem(schedule({ preset: "daily", time: "" })), "Pick a time, for example 09:00.");
  assert.equal(scheduleProblem(schedule({ preset: "hourly", minute: -1 })), "Pick a minute from 0 to 59.");
  assert.equal(scheduleProblem(schedule({ preset: "monthly", day: 32 })), "Pick a day from 1 to 31.");
  assert.equal(scheduleProblem(schedule({ preset: "weekly", weekday: 3 })), null);
  assert.equal(scheduleNote(schedule({ preset: "monthly", day: 31 })), "Months without a day 31 are skipped.");
  assert.equal(scheduleNote(schedule({ preset: "monthly", day: 28 })), null);
  assert.equal(scheduleText(schedule({ preset: "weekdays", time: "09:00" }), "Asia/Kolkata"), "Weekdays at 09:00 (Asia/Kolkata)");
  assert.equal(scheduleText(schedule({ preset: "daily", time: "7:05" }), "UTC"), "Every day at 07:05 (UTC)");
  assert.equal(scheduleText(schedule({ preset: "weekly", time: "10:00", weekday: 1 }), "Europe/London"), "Every Monday at 10:00 (Europe/London)");
  assert.equal(scheduleText(schedule({ preset: "monthly", time: "08:00", day: 1 }), "UTC"), "Every month on day 1 at 08:00 (UTC)");
  assert.equal(scheduleText(schedule({ preset: "hourly", minute: 5 }), "UTC"), "Every hour at :05");
  assert.equal(scheduleText(schedule({ preset: "custom", cron: "0 9 1-7 * *" }), "UTC"), "0 9 1-7 * * (UTC)");
  assert.equal(scheduleText(schedule({ preset: "daily", time: "nope" }), "UTC"), "");
});

test("the form's draft is checked before it is sent", () => {
  const draft = newDraft("lead", "Asia/Kolkata");
  assert.deepEqual(Object.keys(draftProblems(draft)).sort(), ["instruction", "title"]);
  const ready = { ...draft, title: "Morning summary", instruction: "Summarise what changed on my board." };
  assert.deepEqual(draftProblems(ready), {});
  assert.deepEqual(draftProblems({ ...ready, nodeId: "" }), { nodeId: "Pick the node that does it." });
  assert.deepEqual(Object.keys(draftProblems({ ...ready, timezone: "Mars/Olympus" })), ["timezone"]);
  assert.deepEqual(Object.keys(draftProblems({ ...ready, trigger: "webhook", timezone: "Mars/Olympus" })), [], "only a schedule needs its time zone checked");
  assert.deepEqual(draftProblems({ ...ready, trigger: "event", event: { ...ready.event, windowSeconds: "5" } }), { window: "From 10 seconds to 86,400 (a day)." });
  assert.deepEqual(draftProblems({ ...ready, schedule: schedule({ preset: "custom", cron: "0 9 * *" }) }).schedule?.startsWith("A schedule has five fields"), true);
  const plan = { ...ready, what: "plan" as const, template: "{ not json" };
  assert.match(draftProblems(plan).template ?? "", /^That is not valid JSON: /);
  assert.equal(draftProblems({ ...plan, template: "[]" }).template, "A saved plan is a JSON object with a goal and steps.");
  assert.equal(draftProblems({ ...plan, template: '{"goal":"Weekly release"}' }).template, "The plan needs at least one step.");
  assert.equal(draftProblems({ ...plan, template: '{"steps":[{}]}' }).template, "The plan needs a goal.");
  assert.deepEqual(draftProblems({ ...plan, template: '{"goal":"Weekly release","steps":[{"id":"s1","to":"builder","kind":"build","brief":"Cut it."}]}' }), {});
  assert.equal("value" in parseTemplate('{"goal":"g","steps":[1]}'), true);
});

test("what a new routine sends: one of instruction or plan, and only what its trigger needs", () => {
  const draft = { ...newDraft("lead", "Asia/Kolkata"), title: " Morning summary ", instruction: " Summarise my board. " };
  assert.deepEqual(createBody(draft), { title: "Morning summary", nodeId: "lead", instruction: "Summarise my board.", trigger: "schedule", timezone: "Asia/Kolkata", cron: "0 9 * * 1-5", notify: "always" });
  const plan = { ...draft, what: "plan" as const, template: '{"goal":"Release","steps":[{"id":"s1"}]}', roomId: "crew" };
  assert.deepEqual(createBody(plan), { title: "Morning summary", nodeId: "lead", roomId: "crew", template: { goal: "Release", steps: [{ id: "s1" }] }, trigger: "schedule", timezone: "Asia/Kolkata", cron: "0 9 * * 1-5", notify: "always" });
  const event = { ...draft, trigger: "event" as const, notify: "needed" as const, event: { on: "page" as const, actions: ["save", "move"], space: " ", windowSeconds: "120" } };
  assert.deepEqual(createBody(event).event, { on: "page", actions: ["save"], windowSeconds: 120 }, "actions of the other kind and an empty space are left out");
  assert.equal("cron" in createBody(event), false);
  assert.deepEqual(createBody({ ...event, event: { ...event.event, actions: [], space: "Team" } }).event, { on: "page", space: "Team", windowSeconds: 120 });
  const hook = createBody({ ...draft, trigger: "webhook" });
  assert.equal(hook.trigger, "webhook");
  assert.equal("cron" in hook || "event" in hook, false);
});

const routine = (extra: Partial<Routine> = {}): Routine => ({
  id: "r1",
  title: "Morning summary",
  nodeId: "lead",
  roomId: "dm",
  action: "prompt",
  instruction: "Summarise my board.",
  template: null,
  trigger: "schedule",
  cron: "0 9 * * 1-5",
  timezone: "Asia/Kolkata",
  event: null,
  webhook: null,
  notify: "always",
  status: "active",
  when: "Weekdays at 09:00 (Asia/Kolkata)",
  nextRunAt: null,
  lastRunAt: null,
  runs: [],
  ...extra,
});

test("a routine opens in its form as it is, and an edit sends where it reports only when that changed", () => {
  const before = draftOf(routine(), "me");
  assert.equal(before.schedule.preset, "weekdays");
  assert.equal(before.schedule.time, "09:00");
  assert.equal(before.roomId, "dm");
  const edited = { ...before, title: "Morning notes", schedule: schedule({ preset: "daily", time: "08:00" }) };
  assert.deepEqual(patchBody(edited, before), { title: "Morning notes", instruction: "Summarise my board.", trigger: "schedule", timezone: "Asia/Kolkata", cron: "0 8 * * *", notify: "always" });
  assert.equal(patchBody({ ...edited, roomId: "crew" }, before).roomId, "crew");
  const hook = patchBody({ ...before, trigger: "webhook" }, before);
  assert.equal("timezone" in hook || "cron" in hook, false);
  const plan = draftOf(routine({ action: "plan", instruction: null, template: { goal: "Release", steps: [] } }), "me");
  assert.equal(plan.what, "plan");
  assert.deepEqual(JSON.parse(plan.template), { goal: "Release", steps: [] });
  const own = draftOf(routine({ trigger: "event", cron: null, event: { on: "page", actions: ["save"], space: "me", windowSeconds: 90 } }), "me");
  assert.deepEqual(own.event, { on: "page", actions: ["save"], space: "", windowSeconds: "90" }, "the owner's own space shows empty");
  assert.equal(draftOf(routine({ trigger: "event", event: { on: "task", space: "space-2", windowSeconds: 60 } }), "me").event.space, "space-2");
});

const avatar = { shape: "orb" as const, color: "#fff", eyes: "dot" as const };
const node = (id: string): NodePublic => ({ id, ownerId: "me", slug: id, name: id, role: "r", avatar, status: "active" });
const nodeMember = (id: string, accountId = "me"): Member => ({ id: `m-${id}`, kind: "node", handle: id, accountId, representative: false, lead: false, node: { ...node(id), ownerId: accountId } });
const person = (accountId: string): Member => ({ id: `p-${accountId}`, kind: "person", handle: accountId, accountId, role: "member", name: accountId, responsibility: null, me: accountId === "me" });
const room = (id: string, kind: Room["kind"], title: string, members: Member[]): Room => ({ id, kind, title, createdBy: "me", lastSeq: 0, lastMessageAt: null, leadNodeIds: [], pinned: [], invites: [], members });

test("a routine reports in its node's chat or a crew where only its owner reads", () => {
  const rooms = [
    room("zcrew", "crew", "Zeta crew", [person("me"), nodeMember("lead"), nodeMember("builder")]),
    room("launch", "room", "Launch", [person("me"), person("ben"), nodeMember("lead"), nodeMember("scout", "ben")]),
    room("acrew", "crew", "Alpha crew", [person("me"), nodeMember("lead")]),
    room("other", "crew", "Builders", [person("me"), nodeMember("builder")]),
    room("task", "task", "Lead · Scout", [person("me"), nodeMember("lead")]),
    room("dm", "dm", "Lead", [person("me"), nodeMember("lead")]),
  ];
  assert.deepEqual(reportRooms(rooms, "lead", "me"), [
    { id: "dm", title: "Lead", chat: true },
    { id: "acrew", title: "Alpha crew", chat: false },
    { id: "zcrew", title: "Zeta crew", chat: false },
  ]);
  assert.deepEqual(reportRooms(rooms, "nobody", "me"), []);
});

test("routines group by node in the order of the nodes; runs read in words", () => {
  const groups = routinesByNode([routine({ id: "a", nodeId: "tester" }), routine({ id: "b", nodeId: "lead" }), routine({ id: "c", nodeId: "gone" }), routine({ id: "d", nodeId: "tester" })], [node("lead"), node("tester")]);
  assert.deepEqual(groups.map((group) => [group.nodeId, group.node?.id ?? null, group.routines.map((row) => row.id)]), [["lead", "lead", ["b"]], ["tester", "tester", ["a", "d"]], ["gone", null, ["c"]]]);
  assert.deepEqual(runBadge({ status: "pending", missionStatus: null }), { label: "Waiting", tone: "muted" });
  assert.deepEqual(runBadge({ status: "started", missionStatus: "running" }), { label: "Running", tone: "accent" });
  assert.deepEqual(runBadge({ status: "started", missionStatus: "succeeded" }), { label: "Succeeded", tone: "ok" });
  assert.deepEqual(runBadge({ status: "started", missionStatus: "partially_completed" }), { label: "Partly done", tone: "warn" });
  assert.deepEqual(runBadge({ status: "started", missionStatus: null }), { label: "Started", tone: "accent" });
  assert.deepEqual(runBadge({ status: "skipped", missionStatus: null }), { label: "Skipped", tone: "muted" });
  assert.deepEqual(runBadge({ status: "failed", missionStatus: null }), { label: "Failed", tone: "danger" });
  assert.equal(runLive({ status: "started", missionStatus: "reporting" }), true);
  assert.equal(runLive({ status: "started", missionStatus: "failed" }), false);
  assert.equal(runLive({ status: "starting", missionStatus: null }), true);
  assert.equal(runLive({ status: "skipped", missionStatus: null }), false);
  assert.equal(runTrigger("manual"), "By hand");
  assert.equal(runTrigger("event"), "On a change");
  assert.equal(itemsText({ trigger: "event", items: 3 }), "3 changes");
  assert.equal(itemsText({ trigger: "webhook", items: 1 }), "1 call");
  assert.equal(itemsText({ trigger: "schedule", items: 0 }), "");
});

test("when a routine runs next, and where its webhook is", () => {
  const now = Date.parse("2026-10-30T09:00:00Z");
  assert.equal(untilText("2026-10-30T09:00:20Z", now), "now");
  assert.equal(untilText("2026-10-30T08:55:00Z", now), "now", "a time just gone is due");
  assert.equal(untilText("2026-10-30T09:05:00Z", now), "in 5m");
  assert.equal(untilText("2026-10-30T12:00:00Z", now), "in 3h");
  assert.equal(untilText("2026-11-01T09:00:00Z", now), "in 2d");
  assert.equal(untilText("2026-11-20T09:00:00Z", now), "on 20 Nov");
  assert.equal(untilText(null, now), "");
  assert.equal(webhookUrl("https://api.ensemblework.com/", "/api/node/hooks/routines/r1"), "https://api.ensemblework.com/api/node/hooks/routines/r1");
  assert.equal(webhookUrl("https://api.example.com/base", "/api/node/hooks/routines/r1"), "https://api.example.com/api/node/hooks/routines/r1", "the API's origin");
  assert.equal(webhookUrl("http://localhost:4000", "api/node/hooks/routines/r1"), "http://localhost:4000/api/node/hooks/routines/r1");
});

test("time zones are found by city, by region and by their newer names", () => {
  const zones = ["UTC", "America/New_York", "Asia/Calcutta", "Asia/Kolkata", "Europe/Kiev", "Europe/London", "Australia/Perth"];
  assert.deepEqual(matchTimeZones(zones, "kolkata"), ["Asia/Calcutta", "Asia/Kolkata"]);
  assert.deepEqual(matchTimeZones(zones, "new york"), ["America/New_York"]);
  assert.deepEqual(matchTimeZones(zones, "europe/"), ["Europe/Kiev", "Europe/London"]);
  assert.deepEqual(matchTimeZones(zones, "kyiv"), ["Europe/Kiev"]);
  assert.deepEqual(matchTimeZones(zones, "ca"), ["Asia/Calcutta", "America/New_York"], "a city that starts with it before a name that only contains it");
  assert.deepEqual(matchTimeZones(zones, "", 2), ["UTC", "America/New_York"]);
  assert.equal(isTimeZone("Asia/Kolkata"), true);
  assert.equal(isTimeZone("Mars/Olympus"), false);
  assert.equal(isTimeZone(" "), false);
});
