"use client";

/**
 * A room's own work settings (Ensemble docs/35 §12.11–12.14), in its settings: the space that holds the
 * room's work (its creator links one they own, or makes one; everyone sees which, and answers their own
 * offer to join it), whether my finished tasks there move to Done by themselves, and the room's steward.
 */
import { Crown, ExternalLink, Folder, FolderPlus, Link2, Unlink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { useOwnSpaces, useRoomPrefs, useRoomSpace, useSetRoomPrefs, useSpaceActions, useSteward, useStewardActions } from "@/lib/hooks";
import { offerOpen, spaceLine } from "@/lib/room-work";
import { toast, toastError } from "@/lib/toast";
import type { Member, Room } from "@/lib/types";
import { NodeAvatar } from "../node-avatar";
import { Button, External, Input, Notice, Segmented, Spinner } from "../ui";

type NodeMember = Extract<Member, { kind: "node" }>;
type PersonMember = Extract<Member, { kind: "person" }>;

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The creator links a space they own, or makes one named for the room. */
function LinkSpace({ room, onDone }: { room: Room; onDone?: () => void }) {
  const own = useOwnSpaces(true);
  const { link } = useSpaceActions(room.id);
  const [picked, setPicked] = useState("");
  const [name, setName] = useState(`${room.title} space`);
  const done = (label: string) => ({ onSuccess: () => (toast(label, "ok"), onDone?.()), onError: toastError });
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg/60 p-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Link one of your spaces</p>
        {own.isLoading ? (
          <Spinner className="h-4 w-4 text-muted" />
        ) : own.error ? (
          <p className="text-sm text-danger">{own.error.message}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select aria-label="Your space" value={picked} onChange={(event) => setPicked(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm">
              <option value="">Pick a space…</option>
              {(own.data ?? []).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                  {space.primary ? " (your main space)" : ""}
                </option>
              ))}
            </select>
            <Button tone="ghost" disabled={!picked} busy={link.isPending && "spaceId" in (link.variables ?? {})} onClick={() => link.mutate({ spaceId: picked }, done("Linked. Everyone here is offered to join it."))}>
              <Link2 size={15} /> Link
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-1.5 border-t border-line pt-3">
        <p className="text-sm font-medium">Or make one for this room</p>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Its name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} className="min-w-0 flex-1" />
          <Button tone="ghost" disabled={!name.trim()} busy={link.isPending && "create" in (link.variables ?? {})} onClick={() => link.mutate({ create: true, name: name.trim() }, done(`Made “${name.trim()}” and linked it.`))}>
            <FolderPlus size={15} /> Make it
          </Button>
        </div>
      </div>
      {link.error ? <p className="text-sm text-danger">{link.error.message}</p> : null}
    </div>
  );
}

/** Which space holds the room's work; its creator links or unlinks it; each person answers their own offer to join it. */
export function SpaceSettings({ room, meId, open }: { room: Room; meId: string; open: boolean }) {
  const space = useRoomSpace(room.id, open);
  const { unlink, join } = useSpaceActions(room.id);
  const [changing, setChanging] = useState(false);
  const creator = room.createdBy === meId;
  const creatorName = room.members.find((row): row is PersonMember => row.kind === "person" && row.accountId === room.createdBy)?.name ?? "Whoever made this room";
  const view = space.data;
  const linked = view?.space;
  return (
    <Section title="The room's space" hint="Where the room's work lives: its board, pages and decisions. Joining the room does not add anyone to it: each person is offered to join it as an editor.">
      {space.isLoading ? (
        <Spinner className="h-4 w-4 text-muted" />
      ) : space.error ? (
        <Notice tone="error">{space.error.message}</Notice>
      ) : linked ? (
        <div className="space-y-2 rounded-xl border border-line bg-bg px-3 py-2.5">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <Folder size={15} className="shrink-0 text-accent" aria-hidden /> <span className="truncate">{linked.name ?? "The room's space"}</span>
          </p>
          <p className="text-xs text-muted">{spaceLine(view, meId)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {linked.role ? (
              <External href={ENSEMBLE_LINKS.inSpace("/board", linked.id)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Open in Ensemble <ExternalLink size={11} aria-hidden />
              </External>
            ) : view.offer && offerOpen(view.offer.status) ? (
              <>
                <Button size="sm" busy={join.isPending && join.variables?.join} disabled={join.isPending} onClick={() => join.mutate({ join: true, cardId: view.offer?.messageId }, { onSuccess: () => toast("You joined it as an editor.", "ok"), onError: toastError })}>
                  Join as editor
                </Button>
                {view.offer.status === "pending" ? (
                  <Button size="sm" tone="ghost" disabled={join.isPending} onClick={() => join.mutate({ join: false, cardId: view.offer?.messageId }, { onError: toastError })}>
                    Not now
                  </Button>
                ) : null}
              </>
            ) : null}
            {creator ? (
              <>
                <Button size="sm" tone="ghost" onClick={() => setChanging(!changing)} aria-expanded={changing}>
                  <Link2 size={13} /> Link another
                </Button>
                <Button
                  size="sm"
                  tone="danger"
                  busy={unlink.isPending}
                  onClick={() => {
                    if (!confirm(`Unlink “${linked.name ?? "the space"}”? The space, its board and its members stay as they are; open offers to join it end.`)) return;
                    unlink.mutate(undefined, { onSuccess: () => toast("Unlinked.", "ok"), onError: toastError });
                  }}
                >
                  <Unlink size={13} /> Unlink
                </Button>
              </>
            ) : null}
          </div>
          {join.error ? <p className="text-sm text-danger">{join.error.message}</p> : null}
          {creator && changing ? <LinkSpace room={room} onDone={() => setChanging(false)} /> : null}
        </div>
      ) : creator ? (
        <LinkSpace room={room} />
      ) : (
        <p className="text-sm text-muted">No space yet. {creatorName} can link one; until then each person&apos;s work stays in their own space.</p>
      )}
    </Section>
  );
}

/** Whether a result delivered for my task moves it to Done, or I close it myself. */
export function WorkPrefs({ roomId, open }: { roomId: string; open: boolean }) {
  const prefs = useRoomPrefs(roomId, open);
  const save = useSetRoomPrefs(roomId);
  return (
    <Section title="When your work here is done" hint="A result delivered for one of your tasks on the room's board moves it to Done, unless you close your tasks yourself.">
      {prefs.isLoading ? (
        <Spinner className="h-4 w-4 text-muted" />
      ) : prefs.error ? (
        <Notice tone="error">{prefs.error.message}</Notice>
      ) : (
        <Segmented
          label="When your work here is done"
          size="sm"
          value={prefs.data?.closeTasks ?? "auto"}
          onChange={(closeTasks) => save.mutate({ closeTasks }, { onSuccess: () => toast(closeTasks === "auto" ? "Your finished tasks move to Done." : "You close your tasks yourself.", "ok"), onError: toastError })}
          options={[
            { id: "auto", label: "Move my task to Done" },
            { id: "me", label: "I close my tasks" },
          ]}
        />
      )}
    </Section>
  );
}

/** The room's steward: one of my nodes here (not my lead), acting for whoever names it, only when asked. */
export function StewardSettings({ room, meId, open }: { room: Room; meId: string; open: boolean }) {
  const steward = useSteward(room.id, open);
  const actions = useStewardActions(room.id);
  const nodes = room.members.filter((row): row is NodeMember => row.kind === "node");
  const current = steward.data ? nodes.find((row) => row.node.id === steward.data!.nodeId) : undefined;
  const sponsor = steward.data ? room.members.find((row): row is PersonMember => row.kind === "person" && row.accountId === steward.data!.sponsorId) : undefined;
  const mine = nodes.filter((row) => row.accountId === meId && !row.lead && !row.node.parentNodeId);
  const canEnd = steward.data && (steward.data.sponsorId === meId || room.createdBy === meId);
  return (
    <Section title="Steward" hint="A node that writes meeting notes (with proposed tasks for the people named) and suggests how to tidy the board, when someone names it. It acts for whoever asks, only when asked; its usage and drafts are its sponsor's.">
      {steward.isLoading ? (
        <Spinner className="h-4 w-4 text-muted" />
      ) : steward.error ? (
        <Notice tone="error">{steward.error.message}</Notice>
      ) : steward.data ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
          <NodeAvatar node={current?.node} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{current ? `@${current.handle}` : "A node"} is the steward</span>
            <span className="block truncate text-xs text-muted">sponsored by {steward.data.sponsorId === meId ? "you" : (sponsor?.name ?? "someone")}</span>
          </span>
          {canEnd ? (
            <Button size="sm" tone="ghost" busy={actions.end.isPending} onClick={() => actions.end.mutate(undefined, { onSuccess: () => toast("The room has no steward now.", "ok"), onError: toastError })}>
              End
            </Button>
          ) : null}
        </div>
      ) : mine.length ? (
        <ul className="space-y-1.5">
          {mine.map((row) => (
            <li key={row.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2">
              <NodeAvatar node={row.node} size={24} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.node.name} <span className="font-mono text-xs text-muted">@{row.handle}</span>
              </span>
              <Button size="sm" tone="ghost" busy={actions.set.isPending && actions.set.variables === row.node.id} disabled={actions.set.isPending} onClick={() => actions.set.mutate(row.node.id, { onSuccess: () => toast(`@${row.handle} is the room's steward.`, "ok"), onError: toastError })}>
                <Crown size={13} /> Make steward
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None. To sponsor one, bring another of your nodes here: your lead answers for you, so it cannot be the steward.</p>
      )}
      {actions.set.error ? <p className="text-sm text-danger">{actions.set.error.message}</p> : null}
    </Section>
  );
}
