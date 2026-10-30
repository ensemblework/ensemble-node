"use client";

/**
 * A person's own side of a room with other people (rooms v2, Ensemble docs/35 §12): what their lead
 * may do for others without asking them (for everyone, or one person), the month's budget for answers
 * in its own words, the items it may share here, their away status, and asking someone something
 * through their lead. Everything here is theirs alone; nobody else sees these settings.
 */
import { CheckSquare, FileText, Moon, Paperclip, Plus, RotateCcw, Search, Sun, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useCreateRequest, useRoomStatus, useSetAway, useSetShareable, useSetTrust, useShareable, useShareCandidates, useTrust } from "@/lib/hooks";
import { awayLine, awayUntil, requestBody, requestProblems, REQUEST_KINDS, type AwayFor, type RequestDraft } from "@/lib/rooms";
import { toast, toastError } from "@/lib/toast";
import { ACCEPT_KINDS, budgetLine, mergeTrust, ownSettings, TRUST_FIELDS, trustPatch, trustSummary } from "@/lib/trust";
import type { Member, PeerKind, PeerRequest, Room, ShareableItem, TrustSettings } from "@/lib/types";
import { PersonAvatar } from "../node-avatar";
import { Button, Drawer, Field, Input, Notice, Segmented, Spinner, Textarea } from "../ui";

type PersonMember = Extract<Member, { kind: "person" }>;

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The six choices, as plain questions; requests for work also take which kinds it accepts on its own. */
function TrustFields({ value, onChange, idPrefix }: { value: TrustSettings; onChange: (next: TrustSettings) => void; idPrefix: string }) {
  return (
    <div className="space-y-3.5">
      {TRUST_FIELDS.map((field) => (
        <div key={field.key} role="group" aria-label={field.label} className="space-y-1.5">
          <p className="text-sm font-medium">{field.label}</p>
          <Segmented label={field.label} size="sm" value={value[field.key]} onChange={(next) => onChange({ ...value, [field.key]: next } as TrustSettings)} options={field.options} />
          <p className="text-xs text-muted">{field.hint}</p>
          {field.key === "workRequests" && value.workRequests === "accept" ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {ACCEPT_KINDS.map((kind) => {
                const on = value.acceptKinds.includes(kind.id);
                return (
                  <label key={kind.id} htmlFor={`${idPrefix}-${kind.id}`} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm transition ${on ? "border-accent/60 bg-accent/5" : "border-line"}`}>
                    <input
                      id={`${idPrefix}-${kind.id}`}
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--accent))]"
                      checked={on}
                      onChange={(event) => onChange({ ...value, acceptKinds: event.target.checked ? [...value.acceptKinds, kind.id] : value.acceptKinds.filter((row) => row !== kind.id) })}
                    />
                    {kind.label}
                  </label>
                );
              })}
              {!value.acceptKinds.length ? <p className="w-full text-xs text-warn">Tick what it accepts on its own; anything else still asks you.</p> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const ITEM_ICON = { page: FileText, task: CheckSquare, file: Paperclip } as const;

/** Pages, tasks and files my lead may read out in this room. They save as soon as they change. */
function ShareableItems({ roomId, open }: { roomId: string; open: boolean }) {
  const items = useShareable(roomId, open);
  const set = useSetShareable(roomId);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  // My own space's pages, tasks and files, and the room's linked space's when I can open it.
  const candidates = useShareCandidates(roomId, q.trim(), adding);
  const shared = new Set((items.data ?? []).map((row) => `${row.kind}:${row.id}`));
  const spaces = new Set((candidates.data?.items ?? []).map((row) => row.spaceId));
  const found = (candidates.data?.items ?? [])
    .filter((row) => !row.shared && !shared.has(`${row.kind}:${row.id}`))
    .slice(0, 14)
    .map((row) => ({ kind: row.kind, id: row.id, title: row.title || "Untitled", spaceId: row.spaceId, where: spaces.size > 1 ? row.spaceName : null }));
  const change = (item: { kind: ShareableItem["kind"]; id: string; spaceId?: string }, next: boolean) =>
    set.mutate({ kind: item.kind, id: item.id, ...(item.spaceId ? { spaceId: item.spaceId } : {}), shared: next }, { onSuccess: () => toast(next ? "Your lead may share it here." : "Taken back.", "ok"), onError: toastError });
  return (
    <Section title="Items it may share here" hint="Your lead may read these out in this room, at any time, without asking you. Anything else of yours follows the rule above.">
      {items.isLoading ? (
        <Spinner />
      ) : items.error ? (
        <Notice tone="error">{items.error.message}</Notice>
      ) : items.data?.length ? (
        <ul className="space-y-1.5">
          {items.data.map((item) => {
            const Icon = ITEM_ICON[item.kind] ?? FileText;
            return (
              <li key={`${item.kind}:${item.id}`} className="flex items-center gap-2 rounded-xl border border-line bg-bg px-2.5 py-1.5 text-sm">
                <Icon size={14} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{item.kind}</span>
                <button type="button" aria-label={`Stop sharing ${item.title}`} title="Stop sharing" disabled={set.isPending} onClick={() => change(item, false)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-danger">
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing yet.</p>
      )}
      {adding ? (
        <div className="space-y-1.5 rounded-xl border border-line bg-bg/60 p-2.5">
          <div className="flex items-center gap-2">
            <Search size={14} className="shrink-0 text-muted" aria-hidden />
            <Input autoFocus aria-label="Find a page, task or file" placeholder="Find a page, task or file" value={q} onChange={(event) => setQ(event.target.value)} className="py-1.5" />
            <button type="button" aria-label="Close the search" onClick={() => (setAdding(false), setQ(""))} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink">
              <X size={14} />
            </button>
          </div>
          {candidates.isLoading ? (
            <div className="flex justify-center py-2 text-muted">
              <Spinner className="h-3.5 w-3.5" />
            </div>
          ) : found.length ? (
            <ul className="max-h-60 space-y-0.5 overflow-y-auto scroll-thin" aria-label="Results">
              {found.map((row) => {
                const Icon = ITEM_ICON[row.kind];
                return (
                  <li key={`${row.kind}:${row.id}`}>
                    <button type="button" disabled={set.isPending} onClick={() => change(row, true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised disabled:opacity-50">
                      <Icon size={14} className="shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{row.title}</span>
                      {row.where ? <span className="max-w-[40%] shrink-0 truncate text-[11px] text-muted">{row.where}</span> : null}
                      <Plus size={13} className="shrink-0 text-accent" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 py-1 text-xs text-muted">{q.trim() ? "Nothing matches." : "Nothing to add."}</p>
          )}
        </div>
      ) : (
        <Button size="sm" tone="ghost" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add an item
        </Button>
      )}
    </Section>
  );
}

/**
 * What my lead may do for others in this room without asking me (§12.5): for everyone, and for one
 * person over that; the month's budget for answers in its own words; the items it may share. Only what
 * changed is sent, when Save is pressed; the items save at once.
 */
export function TrustSheet({ room, meId, open, onClose }: { room: Room; meId: string; open: boolean; onClose: () => void }) {
  const trust = useTrust(room.id, open);
  const save = useSetTrust(room.id);
  const [everyone, setEveryone] = useState<TrustSettings | null>(null);
  const [people, setPeople] = useState<Record<string, TrustSettings | null>>({});
  const [budget, setBudget] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const view = trust.data;
  const lead = room.members.find((row) => row.kind === "node" && row.accountId === meId && row.lead);
  const everyoneNow = everyone ?? view?.everyone ?? mergeTrust();
  const budgetNow = budget ?? (view?.budget.credits === null || view?.budget.credits === undefined ? "" : String(view.budget.credits));
  const budgetValue = budgetNow.trim() ? Number(budgetNow) : null;
  const budgetBad = budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0);
  const changed = Boolean(view) && (Object.keys(trustPatch(view!.everyone, everyoneNow)).length > 0 || Object.keys(people).length > 0 || (budget !== null && budgetValue !== (view!.budget.credits ?? null)));
  const reset = () => {
    setEveryone(null);
    setPeople({});
    setBudget(null);
    setEditing(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = () => {
    if (!view || budgetBad) return;
    const everyonePatch = trustPatch(view.everyone, everyoneNow);
    const peoplePatch: Record<string, Partial<TrustSettings> | null> = {};
    for (const [accountId, draft] of Object.entries(people)) {
      const person = view.people.find((row) => row.accountId === accountId);
      if (!person) continue;
      if (draft === null) peoplePatch[accountId] = null;
      else {
        const patch = trustPatch(person.effective, draft);
        if (Object.keys(patch).length) peoplePatch[accountId] = patch;
      }
    }
    save.mutate(
      {
        ...(Object.keys(everyonePatch).length ? { everyone: everyonePatch } : {}),
        ...(Object.keys(peoplePatch).length ? { people: peoplePatch } : {}),
        ...(budget !== null && budgetValue !== (view.budget.credits ?? null) ? { budget: budgetValue } : {}),
      },
      {
        onSuccess: () => {
          reset();
          toast("Saved. Your lead follows it from now on.", "ok");
        },
      },
    );
  };
  return (
    <Drawer open={open} onClose={close} title="What your lead may share">
      {trust.isLoading ? (
        <div className="flex justify-center py-8 text-muted">
          <Spinner />
        </div>
      ) : trust.error ? (
        <Notice tone="error">{trust.error.message}</Notice>
      ) : view ? (
        <div className="space-y-7 pb-20">
          <p className="text-sm text-muted">
            {lead ? `@${lead.handle}` : "Your lead"} answers others here within these rules. Anything else waits for you, on a card in My crew. Nobody else sees these settings.
          </p>
          <Section title="For everyone here">
            <TrustFields value={everyoneNow} onChange={setEveryone} idPrefix="everyone" />
          </Section>
          {view.people.length ? (
            <Section title="For one person" hint="Their own rules come over everyone's.">
              <ul className="space-y-2">
                {view.people.map((person) => {
                  const draft = people[person.accountId];
                  const effective = draft === null ? mergeTrust(view.everyone) : (draft ?? person.effective);
                  const own = draft === null ? [] : draft ? ["changed"] : ownSettings(person.overrides);
                  const open_ = editing === person.accountId;
                  return (
                    <li key={person.accountId} className="rounded-xl border border-line bg-bg/60">
                      <div className="flex items-center gap-2.5 px-2.5 py-2">
                        <PersonAvatar name={person.name} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{person.name}</span>
                          <span className="block text-xs text-muted">{draft === null ? "As for everyone (after Save)" : trustSummary(effective, everyoneNow)}</span>
                        </span>
                        {own.length ? (
                          <button
                            type="button"
                            title="Use everyone's rules for them"
                            aria-label={`Use everyone's rules for ${person.name}`}
                            onClick={() => {
                              setPeople({ ...people, [person.accountId]: null });
                              if (open_) setEditing(null);
                            }}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink"
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : null}
                        <Button size="sm" tone="ghost" aria-expanded={open_} aria-label={open_ ? `Done with ${person.name}'s rules` : `Change ${person.name}'s rules`} onClick={() => setEditing(open_ ? null : person.accountId)}>
                          {open_ ? "Done" : "Change"}
                        </Button>
                      </div>
                      {open_ ? (
                        <div className="border-t border-line px-2.5 py-3">
                          <TrustFields value={effective} onChange={(next) => setPeople({ ...people, [person.accountId]: next })} idPrefix={`person-${person.accountId}`} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
          <Section title="Monthly budget" hint="At most this many of your credits a month go on your lead answering others in its own words. Leave it empty for no limit.">
            <div className="flex items-center gap-2">
              <div className="w-32 shrink-0">
                <Input type="number" inputMode="numeric" min={0} aria-label="Monthly credits for answering others" placeholder="No limit" value={budgetNow} onChange={(event) => setBudget(event.target.value)} />
              </div>
              <span className="text-sm text-muted">credits a month</span>
            </div>
            {budgetBad ? <p className="text-xs text-danger">A number of credits, 0 or more.</p> : <p className="text-xs text-muted">{budgetLine(view.budget)}</p>}
          </Section>
          <ShareableItems roomId={room.id} open={open} />
          {save.error ? <Notice tone="error">{save.error.message}</Notice> : null}
          <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-line bg-panel px-5 py-3">
            <Button busy={save.isPending} disabled={!changed || budgetBad} onClick={submit}>
              Save
            </Button>
            <Button tone="ghost" disabled={!changed || save.isPending} onClick={reset}>
              Undo changes
            </Button>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

const AWAY_CHOICES: ReadonlyArray<{ id: AwayFor; label: string }> = [
  { id: "open", label: "Until I am back" },
  { id: "hour", label: "For an hour" },
  { id: "evening", label: "Until 18:00" },
  { id: "tomorrow", label: "Until tomorrow, 09:00" },
  { id: "custom", label: "Until…" },
];

/** My status in this room: here, or away (until when, with a note), as others' status cards show it. */
export function MyStatus({ roomId, meId, open }: { roomId: string; meId: string; open: boolean }) {
  const status = useRoomStatus(roomId, open);
  const setAway = useSetAway(roomId);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [until, setUntil] = useState<AwayFor>("open");
  const [picked, setPicked] = useState("");
  const card = status.data?.find((row) => row.accountId === meId);
  const away = card?.away ? awayLine(card.away) : null;
  const choices = AWAY_CHOICES.filter((row) => row.id !== "evening" || new Date().getHours() < 18);
  const submit = () => {
    const at = awayUntil(until, new Date(), picked);
    if (until === "custom" && (!at || Date.parse(at) <= Date.now())) return toast("Pick a time that is still to come.");
    setAway.mutate({ away: true, until: at, note: note.trim() || null }, { onSuccess: () => (setEditing(false), toast("You are away here. Your status card says so.", "ok")), onError: toastError });
  };
  return (
    <Section title="Your status here" hint="Others see it on your status card and beside your name. Away does not stop your lead: it answers within your rules.">
      {status.isLoading ? (
        <Spinner />
      ) : away ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-sm">
          <Moon size={15} className="shrink-0 text-warn" aria-hidden />
          <span className="min-w-0 flex-1">{away}</span>
          <Button size="sm" tone="ghost" busy={setAway.isPending} onClick={() => setAway.mutate({ away: false }, { onSuccess: () => toast("Welcome back.", "ok"), onError: toastError })}>
            <Sun size={13} /> I am back
          </Button>
        </div>
      ) : editing ? (
        <div className="space-y-2.5 rounded-xl border border-line bg-bg/60 p-3">
          <Field label="How long">
            <select aria-label="How long" value={until} onChange={(event) => setUntil(event.target.value as AwayFor)} className="w-full rounded-xl border border-line bg-bg px-2.5 py-2 text-sm text-ink outline-none transition focus:border-accent">
              {choices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </Field>
          {until === "custom" ? <Input type="datetime-local" aria-label="Away until" value={picked} onChange={(event) => setPicked(event.target.value)} /> : null}
          <Input aria-label="A note (optional)" placeholder="A note (optional): “At a workshop”" value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={setAway.isPending} onClick={submit}>
              <Moon size={13} /> Set away
            </Button>
            <Button size="sm" tone="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ok" aria-hidden /> Here
          </span>
          <Button size="sm" tone="ghost" onClick={() => setEditing(true)}>
            <Moon size={13} /> Set away
          </Button>
        </div>
      )}
    </Section>
  );
}

const EMPTY_REQUEST: Omit<RequestDraft, "to"> = { kind: "question", text: "", repo: "", commit: "", url: "" };

/** Ask another person here something, through their lead: a question, a share, a review of an exact candidate, or work. */
export function RequestForm({ room, meId, open, onClose, onMade }: { room: Room; meId: string; open: boolean; onClose: () => void; onMade: (request: PeerRequest) => void }) {
  const create = useCreateRequest(room.id);
  const others = useMemo(() => room.members.filter((row): row is PersonMember => row.kind === "person" && row.accountId !== meId), [room.members, meId]);
  const leadOf = (accountId: string) => room.members.find((row) => row.kind === "node" && row.accountId === accountId && row.lead)?.handle;
  const [draft, setDraft] = useState<RequestDraft>({ ...EMPTY_REQUEST, to: others.length === 1 ? others[0]!.accountId : "" });
  const [tried, setTried] = useState(false);
  const problems = requestProblems(draft);
  const kind = REQUEST_KINDS.find((row) => row.id === draft.kind)!;
  const set = (patch: Partial<RequestDraft>) => setDraft({ ...draft, ...patch });
  const close = () => {
    setDraft({ ...EMPTY_REQUEST, to: others.length === 1 ? others[0]!.accountId : "" });
    setTried(false);
    create.reset();
    onClose();
  };
  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    create.mutate(requestBody(draft), {
      onSuccess: (request) => {
        toast("Asked. Its card is in the room.", "ok");
        close();
        onMade(request);
      },
    });
  };
  const target = others.find((row) => row.accountId === draft.to);
  return (
    <Drawer open={open} onClose={close} title="Ask someone here">
      {others.length ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p className="text-sm text-muted">Their lead answers for them, within the rules they set. A request for a review or work waits for their yes; nothing runs before it.</p>
          <Field label="To" error={tried ? problems.to : null}>
            <select aria-label="To" value={draft.to} onChange={(event) => set({ to: event.target.value })} className="w-full rounded-xl border border-line bg-bg px-2.5 py-2 text-sm text-ink outline-none transition focus:border-accent">
              <option value="">Pick a person</option>
              {others.map((row) => (
                <option key={row.accountId} value={row.accountId}>
                  {row.name}
                  {leadOf(row.accountId) ? ` (lead @${leadOf(row.accountId)})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What kind" group hint={kind.hint}>
            <Segmented label="What kind" size="sm" value={draft.kind} onChange={(next) => set({ kind: next as PeerKind })} options={REQUEST_KINDS.map((row) => ({ id: row.id, label: row.label }))} />
          </Field>
          <Field label="What you need" error={tried ? problems.text : null}>
            <Textarea aria-label="What you need" rows={4} maxLength={4000} value={draft.text} onChange={(event) => set({ text: event.target.value })} placeholder={draft.kind === "review" ? "Check the sign-up flow on this build; it should work on a phone." : draft.kind === "work" ? "Add the export button to the reports page." : "When does the API change land?"} />
          </Field>
          {draft.kind === "review" || draft.kind === "work" ? (
            <div className="space-y-2.5 rounded-xl border border-line bg-bg/60 p-3">
              <p className="text-sm font-medium">{draft.kind === "review" ? "What to review" : "What it is about (optional)"}</p>
              <p className="text-xs text-muted">An exact commit in a repository, or a web address.</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                <Input aria-label="Repository" placeholder="Repository: acme/web" value={draft.repo} onChange={(event) => set({ repo: event.target.value })} maxLength={300} />
                <Input aria-label="Commit" className="font-mono" placeholder="Commit" spellCheck={false} value={draft.commit} onChange={(event) => set({ commit: event.target.value })} maxLength={64} />
              </div>
              <Input aria-label="Or a web address" type="url" placeholder="Or a web address: https://…" value={draft.url} onChange={(event) => set({ url: event.target.value })} maxLength={2000} />
              {tried && problems.candidate ? (
                <p className="text-xs text-danger" role="alert">
                  {problems.candidate}
                </p>
              ) : null}
            </div>
          ) : null}
          {create.error ? <Notice tone="error">{create.error.message}</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={create.isPending}>
              Send request{target ? ` to ${target.name}` : ""}
            </Button>
            <Button type="button" tone="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">Nobody else is in this room yet. Invite someone from the room settings.</p>
      )}
    </Drawer>
  );
}
