"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Crown, Trash2, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import { keys } from "@/lib/hooks";
import type { Bootstrap, Room } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { Button, Drawer, Field, Input, Notice, Pill } from "../ui";

export function RoomSettings({ room, boot, open, onClose }: { room: Room; boot: Bootstrap; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const me = boot.me.id;
  const creator = room.createdBy === me;
  const mine = room.members.find((row) => row.kind === "person" && row.accountId === me);
  const [title, setTitle] = useState(room.title);
  const [email, setEmail] = useState("");
  const [duty, setDuty] = useState(mine?.kind === "person" ? (mine.responsibility ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inRoom = new Set(room.members.filter((row) => row.kind === "node").map((row) => (row.kind === "node" ? row.node.id : "")));
  const addable = boot.nodes.filter((node) => !inRoom.has(node.id));
  const names = new Map(room.members.flatMap((row) => (row.kind === "person" ? [[row.accountId, row.name] as const] : [])));

  const act = async (name: string, work: () => Promise<unknown>, done?: string) => {
    setError(null);
    setNote(null);
    setBusy(name);
    try {
      await work();
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      if (done) setNote(done);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={room.kind === "dm" ? "Direct chat" : room.kind === "crew" ? "Crew room" : "Group room"}>
      <div className="space-y-6">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {note ? <Notice tone="ok">{note}</Notice> : null}

        {creator && room.kind !== "dm" ? (
          <div className="flex items-end gap-2">
            <Field label="Name">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
            </Field>
            <Button tone="ghost" busy={busy === "title"} disabled={!title.trim() || title === room.title} onClick={() => act("title", () => api(`/api/node/rooms/${room.id}`, { method: "PATCH", body: { title } }), "Renamed.")}>
              Save
            </Button>
          </div>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Members</h3>
          <ul className="space-y-1.5">
            {room.members.map((member) => {
              const removable = member.accountId === me || creator;
              const isLead = member.kind === "node" && room.leadNodeIds.includes(member.node.id);
              return (
                <li key={member.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
                  {member.kind === "node" ? <NodeAvatar avatar={member.node.avatar} size={28} /> : <PersonAvatar name={member.name} size={28} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {member.kind === "node" ? member.node.name : member.name}
                      {member.kind === "person" && member.me ? <Pill>you</Pill> : null}
                      {isLead ? (
                        <Pill tone="accent">
                          <Crown size={10} /> lead
                        </Pill>
                      ) : null}
                      {member.kind === "node" && member.representative && room.kind === "group" ? <Pill tone="accent">represents</Pill> : null}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      @{member.handle}
                      {member.kind === "node" ? ` · ${member.node.role}${member.accountId !== me ? ` · ${names.get(member.accountId) ?? "someone"}'s` : ""}` : member.responsibility ? ` · ${member.responsibility}` : ""}
                    </span>
                  </span>
                  {creator && member.kind === "node" && room.kind !== "dm" && !isLead ? (
                    <button className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-accent" title="Make lead" onClick={() => act("lead", () => api(`/api/node/rooms/${room.id}`, { method: "PATCH", body: { leadNodeIds: [member.node.id] } }), "Lead changed.")}>
                      <Crown size={15} />
                    </button>
                  ) : null}
                  {removable && room.kind !== "dm" && !(member.kind === "person" && member.accountId === room.createdBy) ? (
                    <button
                      className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-danger"
                      title={member.kind === "person" && member.accountId === me ? "Leave" : "Remove"}
                      onClick={() =>
                        act("remove", async () => {
                          await api(`/api/node/rooms/${room.id}/members/${member.id}`, { method: "DELETE" });
                          if (member.kind === "person" && member.accountId === me) router.replace("/chat");
                        })
                      }
                    >
                      <UserMinus size={15} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {room.kind !== "dm" && addable.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Add one of your nodes</h3>
            <div className="flex flex-wrap gap-2">
              {addable.map((node) => (
                <button key={node.id} className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg px-2.5 py-1.5 text-sm hover:border-accent" onClick={() => act("add", () => api(`/api/node/rooms/${room.id}/nodes`, { body: { nodeId: node.id } }), `@${node.slug} joined.`)}>
                  <NodeAvatar avatar={node.avatar} size={20} /> {node.name}
                </button>
              ))}
            </div>
            {room.kind === "group" ? <p className="text-xs text-muted">In a group, your node represents you: it answers what concerns you and asks you before it posts.</p> : null}
          </section>
        ) : null}

        {room.kind === "group" ? (
          <>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Invite someone</h3>
              <div className="flex gap-2">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="their Ensemble email" />
                <Button busy={busy === "invite"} disabled={!email.includes("@")} onClick={() => act("invite", async () => (await api(`/api/node/rooms/${room.id}/people`, { body: { email } }), setEmail("")), "Added. They can add their own node.")}>
                  Invite
                </Button>
              </div>
              <p className="text-xs text-muted">They need an Ensemble account (they can make one at Node in a minute).</p>
            </section>
            <section className="space-y-2">
              <Field label="What you handle here" hint="Helps the room send the right questions to your node, for example “backend and the database”.">
                <div className="flex gap-2">
                  <Input value={duty} onChange={(event) => setDuty(event.target.value)} maxLength={300} placeholder="backend" />
                  <Button tone="ghost" busy={busy === "duty"} onClick={() => act("duty", () => api(`/api/node/rooms/${room.id}`, { method: "PATCH", body: { responsibility: duty.trim() || null } }), "Saved.")}>
                    Save
                  </Button>
                </div>
              </Field>
            </section>
          </>
        ) : null}

        {creator && room.kind !== "dm" ? (
          <section className="border-t border-line pt-4">
            <Button
              tone="danger"
              busy={busy === "delete"}
              onClick={() => {
                if (!confirm(`Delete “${room.title}” for everyone in it?`)) return;
                void act("delete", async () => {
                  await api(`/api/node/rooms/${room.id}`, { method: "DELETE" });
                  router.replace("/chat");
                });
              }}
            >
              <Trash2 size={15} /> Delete room
            </Button>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}
