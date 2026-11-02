import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "./api";
import { FileBuffers } from "./file-buffers";
import { originalKey, selectionQuote, splitAt, type OriginalData, type OriginalEntry } from "./original-files";
import { optimisticMessage, resendInput, sendBody } from "./chat";

const entry: OriginalEntry = { source: { kind: "job", id: "run", path: "src/answer.ts" } };
const data = (content = "original", hash = "1".repeat(40)): OriginalData => ({ path: entry.source.path, name: "answer.ts", location: "/project/src/answer.ts", content, hash, size: content.length, binary: false, truncated: false, readOnly: null });
const key = originalKey(entry);

test("saves serialize and coalesce the newest draft without losing edits typed during a save", async () => {
  const calls: Array<{ content: string; hash: string }> = [];
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  const buffers = new FileBuffers({
    read: async () => data(),
    save: async (_source, content, hash) => {
      calls.push({ content, hash });
      if (calls.length === 1) await first;
      return { hash: String(calls.length + 1).repeat(40) };
    },
  }, 50);
  await buffers.open(entry);
  buffers.change(key, "first");
  const saving = buffers.save(key);
  buffers.change(key, "intermediate");
  buffers.change(key, "latest");
  const queued = buffers.save(key);
  release();
  await Promise.all([saving, queued]);
  assert.deepEqual(calls, [{ content: "first", hash: "1".repeat(40) }, { content: "latest", hash: "2".repeat(40) }]);
  assert.equal(buffers.get(key)?.text, "latest");
  assert.equal(buffers.get(key)?.base, "latest");
  assert.equal(buffers.dirty(key), false);
  buffers.dispose();
});

test("typing during a save still waits for the next quiet interval, rather than continuously writing", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  const buffers = new FileBuffers({
    read: async () => data(),
    save: async (_source, text) => { calls.push(text); if (calls.length === 1) await first; return { hash: String(calls.length + 1).repeat(40) }; },
  }, 30);
  await buffers.open(entry);
  buffers.change(key, "first");
  const saving = buffers.save(key);
  buffers.change(key, "typing again");
  release();
  await saving;
  assert.deepEqual(calls, ["first"]);
  assert.equal(buffers.dirty(key), true);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(calls, ["first", "typing again"]);
  assert.equal(buffers.dirty(key), false);
  buffers.dispose();
});

test("conflicts retain the draft and require an explicit comparison before saving over a newer version", async () => {
  let count = 0;
  let latest = data();
  const buffers = new FileBuffers({
    read: async () => latest,
    save: async (_source, content, hash) => {
      count += 1;
      if (hash !== latest.hash) throw new ApiError(409, "Changed on computer", "FILE_CONFLICT");
      latest = data(content, "3".repeat(40));
      return { hash: latest.hash! };
    },
  }, 10_000);
  await buffers.open(entry);
  buffers.change(key, "my draft");
  latest = data("computer draft", "2".repeat(40));
  await buffers.save(key);
  assert.equal(buffers.get(key)?.status, "conflict");
  buffers.change(key, "my revised draft");
  await buffers.save(key);
  assert.equal(count, 1, "typing after a conflict must not quietly overwrite the computer");
  await buffers.compare(key);
  assert.equal(buffers.get(key)?.text, "my revised draft");
  assert.equal(buffers.get(key)?.latest?.content, "computer draft");
  await buffers.keepDraft(key);
  assert.equal(count, 2);
  assert.equal(latest.content, "my revised draft");
  assert.equal(buffers.dirty(key), false);
  buffers.dispose();
});

test("offline errors keep drafts; discarding cancels pending autosave rather than saving unwanted edits", async () => {
  let offline = true, count = 0;
  const buffers = new FileBuffers({
    read: async () => data(),
    save: async () => { count += 1; if (offline) throw new ApiError(409, "Computer offline", "FILE_OFFLINE"); return { hash: "2".repeat(40) }; },
  }, 10_000);
  await buffers.open(entry);
  buffers.change(key, "keep this");
  await buffers.save(key);
  assert.equal(buffers.get(key)?.text, "keep this");
  assert.equal(buffers.get(key)?.status, "error");
  offline = false;
  await buffers.save(key);
  assert.equal(buffers.dirty(key), false);
  buffers.change(key, "discard this");
  await buffers.discard(key);
  assert.equal(buffers.get(key), undefined);
  assert.equal(count, 2, "discard is not another save");
  buffers.dispose();
});

test("quoted selections keep exact text, correct line boundaries and survive optimistic failure/retry", () => {
  const text = "one\ntwo\nthree\n";
  assert.equal(selectionQuote(entry.source, text, 2, 2, null, false), null);
  const quote = selectionQuote(entry.source, text, 8, 4, "1".repeat(40), true)!;
  assert.deepEqual({ from: quote.from, to: quote.to, text: quote.text, draft: quote.draft }, { from: 2, to: 2, text: "two\n", draft: true });
  const input = { body: "Explain these lines", private: true, clientId: "send", fileQuotes: [quote] };
  const optimistic = optimisticMessage("room", "me", input);
  assert.deepEqual(optimistic.data.fileQuotes, [quote]);
  assert.deepEqual(sendBody(resendInput(optimistic)).fileQuotes, [quote]);
});

test("split resizing respects pane minimums before snapping focus at either end", () => {
  assert.equal(splitAt(0.71, 1000).mode, "editor");
  assert.equal(splitAt(0.29, 1000).mode, "chat");
  assert.deepEqual(splitAt(0.5, 720), { mode: "split", ratio: 400 / 720 });
  assert.deepEqual(splitAt(0.5, 1000), { mode: "split", ratio: 0.5 });
});

test("agent refreshes update clean originals but preserve dirty drafts as conflicts", async () => {
  let latest = data();
  const buffers = new FileBuffers({ read: async () => latest, save: async () => ({ hash: "3".repeat(40) }) }, 10_000);
  await buffers.open(entry);
  latest = data("agent update", "2".repeat(40));
  await buffers.refresh(key);
  assert.equal(buffers.get(key)?.text, "agent update");
  buffers.change(key, "my unsaved work");
  latest = data("another agent update", "3".repeat(40));
  await buffers.refresh(key);
  assert.equal(buffers.get(key)?.text, "my unsaved work");
  assert.equal(buffers.get(key)?.latest?.content, "another agent update");
  assert.equal(buffers.get(key)?.status, "conflict");
  buffers.dispose();
});

test("a delayed refresh cannot replace a newer acknowledged save", async () => {
  let resolve!: (value: OriginalData) => void;
  let reads = 0;
  const buffers = new FileBuffers({
    read: async () => ++reads === 1 ? data() : new Promise<OriginalData>(done => { resolve = done; }),
    save: async () => ({ hash: "2".repeat(40) }),
  }, 10_000);
  await buffers.open(entry);
  const refreshing = buffers.refresh(key);
  await Promise.resolve();
  buffers.change(key, "new saved version");
  await buffers.save(key);
  resolve(data());
  await refreshing;
  assert.equal(buffers.get(key)?.text, "new saved version");
  assert.equal(buffers.get(key)?.hash, "2".repeat(40));
  buffers.dispose();
});
