import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { keys, markRead, putMessage } from "./hooks";
import { optimisticMessage } from "./chat";
import type { Bootstrap, Room } from "./types";

test("live messages refresh unopened sidebar previews immediately; read markers for two chats both reach the server", async () => {
  const room = (id: string): Room => ({ id, title: id, kind: "dm", createdBy: "me", lastSeq: 0, lastMessageAt: null, members: [], pinned: [], invites: [], leadNodeIds: [], readSeq: 0, unread: 0 });
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: 0 } } });
  const boot: Bootstrap = {
    me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true },
    rooms: [room("a"), room("b")], nodes: [], computers: [], credits: null, invites: [],
    models: { default: "gpt-5-mini", options: [] }, templates: { nodes: [], crews: [] },
    limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: [], declineBlockDays: 30 },
  };
  client.setQueryData(keys.bootstrap, boot);
  const realFetch = globalThis.fetch;
  const reads: string[] = [];
  globalThis.fetch = (async input => {
    reads.push(String(input));
    return new Response("{}", { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    for (const id of ["a", "b"]) {
      putMessage(client, { ...optimisticMessage(id, "me", { body: `Reply ${id}`, clientId: id, private: false }), id: `server-${id}`, seq: 1, sending: false, authorKind: "node", authorNodeId: "n" });
    }
    assert.deepEqual(client.getQueryData<Bootstrap>(keys.bootstrap)?.rooms.map(row => [row.last?.body, row.unread]), [["Reply a", 1], ["Reply b", 1]]);
    markRead(client, "a", 1);
    markRead(client, "b", 1);
    await new Promise(resolve => setTimeout(resolve, 950));
    assert.equal(reads.filter(url => url.endsWith("/a/read")).length, 1);
    assert.equal(reads.filter(url => url.endsWith("/b/read")).length, 1);
    client.setQueryData(keys.bootstrap, { ...boot, me: { ...boot.me, id: "me-failure" }, rooms: [{ ...room("c"), lastSeq: 2, unread: 2 }] });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Read refused" }), { status: 503, headers: { "content-type": "application/json" } })) as typeof fetch;
    markRead(client, "c", 1);
    markRead(client, "c", 2);
    await new Promise(resolve => setTimeout(resolve, 950));
    assert.equal(client.getQueryData<Bootstrap>(keys.bootstrap)?.rooms[0]?.readSeq, 0, "a refused debounced read restores the confirmed marker, not another optimistic marker");
  } finally {
    globalThis.fetch = realFetch;
    client.clear();
  }
});
