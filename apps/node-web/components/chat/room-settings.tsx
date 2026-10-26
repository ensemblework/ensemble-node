"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Download, LogOut, MailPlus, Plus, Trash2, UserMinus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { keys, limitsOf, putRoom } from "@/lib/hooks";
import { ago } from "@/lib/text";
import { toast } from "@/lib/toast";
import type { Bootstrap, Member, NodeFull, Room, RoomInvite } from "@/lib/types";
import { ModelPicker } from "../model-picker";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { Button, Drawer, Field, Input, Notice, Pill } from "../ui";

type NodeMember = Extract<Member, { kind: "node" }>;
type PersonMember = Extract<Member, { kind: "person" }>;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

function SmallButton({ children, onClick, disabled, title, tone }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; tone?: "danger" | "accent" }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${tone === "danger" ? "text-muted hover:bg-danger/10 hover:text-danger" : "text-muted hover:bg-raised hover:text-accent"}`}
    >
      {children}
    </button>
  );
}

function InviteRow({ invite, onWithdraw, busy }: { invite: RoomInvite; onWithdraw: () => void; busy: boolean }) {
  const tone = invite.status === "accepted" ? "ok" : invite.status === "declined" ? "danger" : "warn";
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
      <PersonAvatar name={invite.name} size={28} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{invite.name}</span>
          <Pill tone={tone}>{invite.status}</Pill>
        </span>
        <span className="block break-words text-xs text-muted">
          {invite.email ? `${invite.email} · ` : ""}
          {invite.status === "pending"
            ? `asked ${ago(invite.createdAt)} ago`
            : invite.status === "accepted"
              ? `joined ${invite.respondedAt ? day(invite.respondedAt) : ""}`
              : `declined ${invite.respondedAt ? day(invite.respondedAt) : ""}${invite.askAgainAfter ? ` · ask again after ${day(invite.askAgainAfter)}` : ""}`}
        </span>
      </span>
      {invite.status === "pending" ? (
        <SmallButton tone="danger" onClick={onWithdraw} disabled={busy} title="Withdraw the request">
          <X size={13} /> Withdraw
        </SmallButton>
      ) : null}
    </li>
  );
}

/** Settings for a conversation: a DM's node, a crew's nodes and lead, a room's people, nodes and requests to join. */
export function RoomSettings({ room, boot, open, onClose, onExport }: { room: Room; boot: Bootstrap; open: boolean; onClose: () => void; onExport: () => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const me = boot.me.id;
  const limits = limitsOf(boot);
  const creator = room.createdBy === me;
  const meMember = room.members.find((row): row is PersonMember => row.kind === "person" && row.accountId === me);
  const nodeMembers = room.members.filter((row): row is NodeMember => row.kind === "node");
  const peopleMembers = room.members.filter((row): row is PersonMember => row.kind === "person");
  const myNodes = nodeMembers.filter((row) => row.accountId === me);
  const inRoom = new Set(nodeMembers.map((row) => row.node.id));
  const [title, setTitle] = useState(room.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviteNote, setInviteNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [duty, setDuty] = useState(meMember?.responsibility ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (name: string, work: () => Promise<unknown>, done?: string): Promise<boolean> => {
    setError(null);
    setBusy(name);
    try {
      const result = (await work()) as { room?: Room } | undefined;
      if (result?.room) putRoom(client, result.room);
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      if (done) toast(done, "ok");
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rename = async () => {
    setTitleError(null);
    setBusy("title");
    try {
      const result = await api<{ room: Room }>(`/api/node/rooms/${room.id}`, { method: "PATCH", body: { title: title.trim() } });
      putRoom(client, result.room);
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      toast("Renamed.", "ok");
    } catch (failure) {
      setTitleError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };

  const makeLead = (member: NodeMember) =>
    act("lead", () => api(`/api/node/rooms/${room.id}/members/${member.id}`, { method: "PATCH", body: { lead: true } }), `@${member.handle} leads${room.kind === "room" ? " for you" : ""} now.`);

  const removeNode = (member: NodeMember) =>
    act("remove", async () => {
      await api(`/api/node/rooms/${room.id}/members/${member.id}`, { method: "DELETE" });
      // A crew whose lead left gets the first node left as its lead.
      const rest = nodeMembers.filter((row) => row.id !== member.id && row.accountId === me);
      if (room.kind === "crew" && member.lead && rest[0]) await api(`/api/node/rooms/${room.id}`, { method: "PATCH", body: { leadNodeIds: [rest[0].node.id] } });
    }, `@${member.handle} left.`);

  const addNode = (node: NodeFull, lead = false) => act("add", () => api(`/api/node/rooms/${room.id}/nodes`, { body: { nodeId: node.id, ...(lead ? { lead: true } : {}) } }), `@${node.slug} joined.`);

  const leave = () => {
    if (!meMember || !confirm(`Leave “${room.title}”? Your nodes leave with you.`)) return;
    void act("leave", async () => {
      await api(`/api/node/rooms/${room.id}/members/${meMember.id}`, { method: "DELETE" });
      router.replace("/chat");
    });
  };

  const invite = async () => {
    setInviteNote(null);
    setBusy("invite");
    try {
      const result = await api<{ room: Room }>(`/api/node/rooms/${room.id}/invites`, { body: { email: email.trim() } });
      putRoom(client, result.room);
      setInviteNote({ tone: "ok", text: `Asked ${email.trim()} to join. They answer in Node's Requests.` });
      setEmail("");
    } catch (failure) {
      setInviteNote({ tone: "error", text: failure instanceof ApiError || failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setBusy(null);
    }
  };

  const nodeRow = (member: NodeMember, controls: ReactNode) => (
    <li key={member.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
      <NodeAvatar node={member.node} size={28} dim={member.node.status === "paused"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
          {member.node.name}
          {member.lead ? (
            <Pill tone="accent">
              <Crown size={10} /> Lead
            </Pill>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted">
          @{member.handle} · {member.node.role}
        </span>
      </span>
      {controls}
    </li>
  );

  const titleField =
    creator && room.kind !== "dm" ? (
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Field label="Name" error={titleError}>
            <Input value={title} onChange={(event) => (setTitle(event.target.value), setTitleError(null))} maxLength={80} />
          </Field>
        </div>
        <Button tone="ghost" className="mt-7" busy={busy === "title"} disabled={!title.trim() || title.trim() === room.title} onClick={() => void rename()}>
          Save
        </Button>
      </div>
    ) : null;

  const footer = (
    <section className="flex flex-wrap gap-2 border-t border-line pt-4">
      <Button tone="ghost" onClick={onExport}>
        <Download size={15} /> Export as Markdown
      </Button>
      {room.kind === "room" && !creator ? (
        <Button tone="danger" busy={busy === "leave"} onClick={leave}>
          <LogOut size={15} /> Leave room
        </Button>
      ) : null}
      {creator && room.kind !== "dm" ? (
        <Button
          tone="danger"
          busy={busy === "delete"}
          onClick={() => {
            if (!confirm(room.kind === "room" ? `Delete “${room.title}” for everyone in it? Open requests are withdrawn.` : `Delete the crew “${room.title}”? Its nodes stay.`)) return;
            void act("delete", async () => {
              await api(`/api/node/rooms/${room.id}`, { method: "DELETE" });
              router.replace("/chat");
            });
          }}
        >
          <Trash2 size={15} /> Delete {room.kind === "room" ? "room" : "crew"}
        </Button>
      ) : null}
    </section>
  );

  if (room.kind === "dm") {
    const node = boot.nodes.find((row) => row.id === nodeMembers[0]?.node.id);
    return (
      <Drawer open={open} onClose={onClose} title="Direct chat">
        <div className="space-y-6">
          {node ? (
            <>
              <div className="flex items-center gap-3">
                <NodeAvatar node={node} size={48} dim={node.status === "paused"} />
                <div>
                  <div className="font-semibold">{node.name}</div>
                  <div className="text-sm text-muted">
                    @{node.slug} · {node.role}
                    {node.status === "paused" ? " · paused" : ""}
                  </div>
                </div>
              </div>
              <Field label="Chat model" group>
                <ModelPicker
                  value={{ provider: node.provider, model: node.model }}
                  onChange={(next) => act("model", () => api(`/api/node/nodes/${node.id}`, { method: "PATCH", body: { provider: next.provider, model: next.model } }), "Model saved.").then(() => undefined)}
                />
              </Field>
              <Link href={`/n/${node.id}`} onClick={onClose} className="inline-flex text-sm text-accent hover:underline">
                Name, look, charter, memory and more
              </Link>
            </>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {footer}
        </div>
      </Drawer>
    );
  }

  if (room.kind === "crew") {
    return (
      <Drawer open={open} onClose={onClose} title="Crew settings">
        <div className="space-y-6">
          {titleField}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Section title={`Nodes in this crew (${nodeMembers.length})`} hint="The lead takes every message nobody is @mentioned in, plans, and hands out work.">
            <ul className="space-y-1.5">
              {nodeMembers.map((member) =>
                nodeRow(
                  member,
                  <>
                    {!member.lead ? (
                      <SmallButton onClick={() => void makeLead(member)} disabled={Boolean(busy)} title="Make this node the crew's lead">
                        <Crown size={13} /> Make lead
                      </SmallButton>
                    ) : null}
                    <SmallButton tone="danger" onClick={() => void removeNode(member)} disabled={Boolean(busy) || nodeMembers.length <= 1} title={nodeMembers.length <= 1 ? "A crew keeps at least one node" : "Remove from the crew (the node itself stays)"}>
                      <UserMinus size={13} /> Remove
                    </SmallButton>
                  </>,
                ),
              )}
            </ul>
          </Section>
          <Section title="Your nodes" hint={`A crew holds up to ${limits.crewNodes} nodes. Make a new node from New.`}>
            <ul className="space-y-1.5">
              {boot.nodes.map((node) => (
                <li key={node.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
                  <NodeAvatar node={node} size={24} dim={node.status === "paused"} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {node.name} <span className="font-mono text-xs text-muted">@{node.slug}</span>
                  </span>
                  {inRoom.has(node.id) ? (
                    <span className="inline-flex items-center gap-1 px-2 text-xs text-ok">
                      <Check size={13} /> In the crew
                    </span>
                  ) : (
                    <SmallButton onClick={() => void addNode(node)} disabled={Boolean(busy) || nodeMembers.length >= limits.crewNodes}>
                      <Plus size={13} /> Add
                    </SmallButton>
                  )}
                </li>
              ))}
            </ul>
          </Section>
          {footer}
        </div>
      </Drawer>
    );
  }

  const addable = boot.nodes.filter((node) => !inRoom.has(node.id));
  const pending = room.invites.filter((row) => row.status === "pending").length;
  const seats = limits.roomPeople - peopleMembers.length - pending;
  return (
    <Drawer open={open} onClose={onClose} title="Room settings">
      <div className="space-y-6">
        {titleField}
        {error ? <Notice tone="error">{error}</Notice> : null}

        <Section title="People and their nodes" hint={`Each person brings 1–${limits.nodesPerPerson} of their own nodes; their lead answers for them. You only see other people's nodes by name and role.`}>
          <ul className="space-y-3">
            {peopleMembers.map((person) => {
              const theirs = nodeMembers.filter((row) => row.accountId === person.accountId);
              const mineNow = person.accountId === me;
              return (
                <li key={person.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={person.name} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {person.name}
                        {mineNow ? <Pill>you</Pill> : null}
                        {person.accountId === room.createdBy ? <Pill>made this room</Pill> : null}
                      </span>
                      {person.responsibility ? <span className="block truncate text-xs text-muted">Handles: {person.responsibility}</span> : null}
                    </span>
                    {creator && !mineNow ? (
                      <SmallButton
                        tone="danger"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (confirm(`Remove ${person.name} and their nodes from “${room.title}”?`)) void act("remove", () => api(`/api/node/rooms/${room.id}/members/${person.id}`, { method: "DELETE" }), `${person.name} was removed.`);
                        }}
                      >
                        <UserMinus size={13} /> Remove
                      </SmallButton>
                    ) : null}
                  </div>
                  <ul className="space-y-1.5 pl-8">
                    {theirs.map((member) =>
                      nodeRow(
                        member,
                        mineNow ? (
                          <>
                            {!member.lead ? (
                              <SmallButton onClick={() => void makeLead(member)} disabled={Boolean(busy)} title="Make this node your lead here">
                                <Crown size={13} /> Make lead
                              </SmallButton>
                            ) : null}
                            <SmallButton
                              tone="danger"
                              onClick={() => void removeNode(member)}
                              disabled={Boolean(busy) || myNodes.length <= 1}
                              title={myNodes.length <= 1 ? "Keep at least one of your nodes here, or leave the room" : "Take this node out of the room"}
                            >
                              <UserMinus size={13} /> Remove
                            </SmallButton>
                          </>
                        ) : null,
                      ),
                    )}
                  </ul>
                  {mineNow && myNodes.length <= 1 && !creator ? <p className="pl-8 text-xs text-muted">Your last node here stays while you are in the room. To take it out, leave the room.</p> : null}
                </li>
              );
            })}
          </ul>
        </Section>

        {myNodes.length < limits.nodesPerPerson && addable.length ? (
          <Section title="Bring another of your nodes" hint={`You have ${myNodes.length} of ${limits.nodesPerPerson} here.`}>
            <ul className="space-y-1.5">
              {addable.map((node) => (
                <li key={node.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
                  <NodeAvatar node={node} size={24} dim={node.status === "paused"} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {node.name} <span className="font-mono text-xs text-muted">@{node.slug}</span>
                  </span>
                  <SmallButton onClick={() => void addNode(node)} disabled={Boolean(busy)}>
                    <Plus size={13} /> Add
                  </SmallButton>
                  <SmallButton onClick={() => void addNode(node, true)} disabled={Boolean(busy)} title="Add it as your lead here">
                    <Crown size={13} /> As lead
                  </SmallButton>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="What you handle here" hint="Helps the room send the right questions to your lead node, for example “backend and the database”.">
          <div className="flex gap-2">
            <Input value={duty} onChange={(event) => setDuty(event.target.value)} maxLength={300} placeholder="backend" aria-label="What you handle here" />
            <Button tone="ghost" busy={busy === "duty"} onClick={() => void act("duty", () => api(`/api/node/rooms/${room.id}`, { method: "PATCH", body: { responsibility: duty.trim() || null } }), "Saved.")}>
              Save
            </Button>
          </div>
        </Section>

        {creator ? (
          <Section
            title="Requests to join"
            hint={`Up to ${limits.roomPeople} people, counting open requests (${Math.max(0, seats)} left). Someone who declines can be asked again after ${limits.declineBlockDays} days. Only you see this list.`}
          >
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(event) => (setEmail(event.target.value), setInviteNote(null))}
                onKeyDown={(event) => event.key === "Enter" && email.includes("@") && void invite()}
                placeholder="their Ensemble email"
                aria-label="Invite by email"
              />
              <Button busy={busy === "invite"} disabled={!email.includes("@") || seats <= 0} onClick={() => void invite()}>
                <MailPlus size={15} /> Invite
              </Button>
            </div>
            {inviteNote ? <Notice tone={inviteNote.tone}>{inviteNote.text}</Notice> : null}
            {room.invites.length ? (
              <ul className="space-y-1.5">
                {room.invites.map((row) => (
                  <InviteRow key={row.id} invite={row} busy={Boolean(busy)} onWithdraw={() => void act("withdraw", () => api(`/api/node/rooms/${room.id}/invites/${row.id}`, { method: "DELETE" }), `Withdrew the request to ${row.name}.`)} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No requests yet. They need an Ensemble account; signing up on Node makes one.</p>
            )}
          </Section>
        ) : null}

        {footer}
      </div>
    </Drawer>
  );
}
