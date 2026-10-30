/**
 * Node replies name workspace records by title, not by id (Ensemble docs/11 §4.1). The same rules as
 * Ensemble's `formatEntityText` (`@ensemble/shared-types`), kept here because this is a separate repo.
 *
 * Ids stay in machine-readable places: the message's `refs`, tool chips and link targets. This turns a
 * reply into what a person reads: `[@Label](ensemble://kind/id)` shows its label and opens the record
 * in Ensemble, and a bare id of a known record becomes its title. An id or record link in brackets
 * right after the record's title (`Title (ensemble://task/id)`) links that title once; the label is
 * never inserted beside the same words. Unknown ids, code, block quotes, URLs and link targets stay as
 * written, and nothing changes when someone asked for ids.
 */

/** A record a reply or tool result names: `kind` is an Ensemble mention kind, `page`, `meeting`, `reminder`, `room` or `item`. */
export type EntityRef = { kind: string; id: string; label: string; detail?: string };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`);
const isUuid = (value: string) => UUID_ONLY.test(value);

/** Someone asked to see ids: replies then show them as written. */
export function asksForIds(message: string | null | undefined): boolean {
  return Boolean(message && /\b(?:ids?|uuids?|identifiers?)\b/i.test(message));
}

const KINDS: Record<string, string> = {
  person: "people",
  people: "people",
  project: "project",
  repo: "repo",
  repository: "repo",
  task: "task",
  todo: "task",
  deliverable: "deliverable",
  skill: "skill",
  diagram: "diagram",
  plot: "plot",
  dataset: "dataset",
  data: "dataset",
  file: "file",
  attachment: "file",
  page: "page",
  meeting: "meeting",
  reminder: "reminder",
  room: "room",
};

/** A kind as written in a link (`person`, `tasks`) → the ref kind, or null. */
export function refKind(word: string): string | null {
  const lower = word.toLowerCase();
  return KINDS[lower] ?? KINDS[lower.replace(/s$/, "")] ?? null;
}

/** Where a record opens: an Ensemble page under `app`, a room here, or null. */
export function refHref(ref: Pick<EntityRef, "kind" | "id" | "label">, app: string): string | null {
  const id = encodeURIComponent(ref.id);
  const label = encodeURIComponent(ref.label);
  switch (ref.kind) {
    case "room":
      return `/r/${id}`;
    case "task":
      return `${app}/tasks/${id}`;
    case "project":
      return `${app}/projects/${id}`;
    case "people":
      return `${app}/context?tab=people&search=${label}`;
    case "repo":
      return `${app}/context?tab=repos&search=${label}`;
    case "skill":
      return `${app}/skills?skill=${id}`;
    case "diagram":
      return `${app}/diagrams/${id}`;
    case "plot":
      return ref.id.includes("/") ? `${app}/plots?space=${encodeURIComponent(ref.id.split("/")[0]!)}&tile=${ref.id.split("/")[1]}` : `${app}/plots/${id}`;
    case "dataset":
      return `${app}/plots`;
    case "file":
      return `${app}/files/${id}`;
    case "deliverable":
      return `${app}/today?deliverable=${id}`;
    case "page":
      return `${app}/pages/${id}`;
    case "meeting":
      return `${app}/meetings?session=${id}`;
    default:
      return null;
  }
}

const KIND_WORD: Record<string, string> = { people: "person", repo: "repository", meeting: "meeting notes" };
const cleanLabel = (label: string) => label.replace(/\s+/g, " ").replace(/\[/g, "(").replace(/\]/g, ")").trim();

type Shown = EntityRef & { original: string };

/** One display label per record; records that share a title get a qualifier (kind, detail or a number). */
function displayRefs(refs: readonly EntityRef[]): Map<string, Shown> {
  const unique = new Map<string, EntityRef>();
  for (const ref of refs) if (ref.id && ref.label?.trim() && !unique.has(ref.id.toLowerCase())) unique.set(ref.id.toLowerCase(), ref);
  const groups = new Map<string, EntityRef[]>();
  for (const ref of unique.values()) groups.set(cleanLabel(ref.label).toLowerCase(), [...(groups.get(cleanLabel(ref.label).toLowerCase()) ?? []), ref]);
  const shown = new Map<string, Shown>();
  for (const group of groups.values()) {
    for (const ref of group) {
      const original = cleanLabel(ref.label);
      let label = original;
      if (group.length > 1) {
        const sameKind = group.filter((other) => other.kind === ref.kind);
        const detail = ref.detail?.trim();
        const qualifier =
          sameKind.length === 1 ? (KIND_WORD[ref.kind] ?? ref.kind) : detail && sameKind.filter((other) => other.detail?.trim() === detail).length === 1 ? detail : String(sameKind.indexOf(ref) + 1);
        label = `${original} (${qualifier})`;
      }
      shown.set(ref.id.toLowerCase(), { ...ref, label, original });
    }
  }
  return shown;
}

export type EntityTextOptions = {
  /** Someone asked for ids: bare ids stay. Links still show their labels. */
  showIds?: boolean;
  /** The text is still arriving: a half-written id or record link at the end is held back. */
  streaming?: boolean;
  /** Labels only, no Markdown links (one-line summaries). */
  plain?: boolean;
  /** Ensemble's app origin, for record links. */
  app?: string;
  /** A bare record link to a record the text does not name shows as its kind ("task"), linked, instead of its address. */
  kindLinks?: boolean;
};

const KIND_WORDS = "(?:tasks?|projects?|people|persons?|repos?|repositor(?:y|ies)|deliverables?|skills?|diagrams?|plots?|datasets?|files?|pages?|meetings?|reminders?|rooms?)";
const BARE_ID = new RegExp(`(?<![\\w/.=?&#%@-])(?:${KIND_WORDS}[:/])?(${UUID})(?![\\w-])`, "gi");
const OPENER = /\s*[([]\s*(?:[A-Za-z]+\s*[:#]?\s*)?$/;
/** Only a bracket opens a record link's annotation: "Title (ensemble://task/…)". */
const LINK_OPENER = /\s*[([]\s*$/;
const CLOSER = /^\s*[)\]]/;
const TITLE_END = /[”"'’*_]*$/;
const CLAUSE_END = /[.:;,!?]$/;
const SEPARATORS = new Set(["—", "–", "-", "|", "·", "/"]);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * How many characters at the end of `text` name the record titled `title`: its whole title, or the
 * title's first clause of two words or more (a long label such as "Title. Description…" or
 * "Title — detail"). 0 when the text does not end with it. Case and spacing do not matter.
 */
export function titledEnd(text: string, title: string): number {
  const words = title.split(/\s+/).filter(Boolean);
  for (let count = words.length; count >= 1; count -= 1) {
    const whole = count === words.length;
    const clause = CLAUSE_END.test(words[count - 1]!) || SEPARATORS.has(words[count] ?? "");
    if (!whole && (count < 2 || !clause)) continue;
    const last = words[count - 1]!.replace(/[.:;,!?]+$/, "");
    if (!last || SEPARATORS.has(last)) continue;
    const pattern = [...words.slice(0, count - 1), last].map(escapeRegExp).join("\\s+");
    const found = new RegExp(`(?:^|(?<=[^\\p{L}\\p{N}_]))${pattern}$`, "iu").exec(text);
    if (found) return found[0].length;
  }
  return 0;
}
const FENCE = /^\s{0,3}(?:`{3,}|~{3,})/;
const QUOTE = /^\s{0,3}>/;
const TOKEN =
  /``[^`\n]+``|`[^`\n]+`|\[([^\]\n]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)|<[a-z][a-z0-9+.-]*:[^\s<>]*>|\b(?:https?|ftp|mailto|file):[^\s<>]+|\bwww\.[^\s<>]+|\bensemble:\/\/([a-z]+)\/([^\s)\]>]+)/gi;
const RECORD_LINK = /^ensemble:\/\/([a-z]+)\/(.+)$/i;

function holdBack(text: string, ids: readonly string[]): string {
  let out = text;
  const link = /\[@?([^\]\n]*)\]\(([^)\s]*)$/.exec(out);
  if (link) out = out.slice(0, link.index) + link[1]!;
  const unlinked = out.replace(/\bensemble:\/\/\S*$/i, "");
  // `Title (ensemble://…` is held back with its bracket: the title links once the bracket closes.
  if (unlinked !== out) out = unlinked.replace(LINK_OPENER, "");
  const run = /(?<![\w-])((?:[a-z]+[:/])?)([0-9a-f][0-9a-f-]{3,})(\s*)$/i.exec(out);
  if (run) {
    const partial = run[2]!.toLowerCase();
    const complete = run[2]!.length >= 36;
    const opened = OPENER.exec(out.slice(0, run.index));
    if (!complete && ids.some((id) => id.startsWith(partial))) out = out.slice(0, opened && opened[0].trim() ? opened.index : run.index);
    else if (complete && opened && opened[0].trim() && ids.includes(partial)) out = out.slice(0, opened.index);
  }
  return out;
}

/** A reply as people read it: records by title (linked unless `plain`); ids only where they belong. */
export function formatEntityText(text: string, given: readonly EntityRef[] | null | undefined, options: EntityTextOptions = {}): string {
  if (!text) return text;
  const refs = (given ?? []).filter((ref) => ref && typeof ref.id === "string" && typeof ref.label === "string" && typeof ref.kind === "string");
  const source = options.streaming ? holdBack(text, refs.map((ref) => ref.id.toLowerCase())) : text;
  const lower = source.toLowerCase();
  const named = displayRefs(refs.filter((ref) => lower.includes(ref.id.toLowerCase())));
  const known = (id: string) => named.get(id.toLowerCase());
  const show = (ref: EntityRef, label = ref.label): string => {
    const clean = cleanLabel(label);
    if (options.plain) return clean;
    const href = refHref(ref, options.app ?? "");
    return href ? `[${clean}](${href})` : clean;
  };
  /**
   * `Title (id)` or `Title (ensemble://task/id)`: the annotation names the words just before it. Those
   * words become the record's link and the annotation goes, so the title is never shown twice.
   * `head` ends where the annotation's bracket opened; null when it does not end with the title.
   */
  const linkTitle = (head: string, ref: Shown): string | null => {
    const quote = TITLE_END.exec(head)![0];
    const title = head.slice(0, head.length - quote.length);
    const length = titledEnd(title, ref.original);
    if (!length) return null;
    const at = title.length - length;
    return title.slice(0, at) + show(ref, title.slice(at)) + quote;
  };

  const ids = (segment: string): string => {
    if (options.showIds || !/[0-9a-f]{8}-/i.test(segment)) return segment;
    let out = segment;
    for (const match of [...segment.matchAll(BARE_ID)].reverse()) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const ref = known(match[1]!);
      const before = out.slice(0, start);
      const after = out.slice(end);
      const opener = OPENER.exec(before);
      const closer = CLOSER.exec(after);
      if (opener && opener[0].trim() && closer) {
        const head = before.slice(0, opener.index);
        const tail = after.slice(closer[0].length);
        const quote = TITLE_END.exec(head)![0];
        const titled = ref ? linkTitle(head, ref) : null;
        if (titled !== null) {
          out = titled + tail;
        } else if (ref) {
          out = head + opener[0].replace(/[A-Za-z]+\s*[:#]?\s*$/, "").replace(/\s+$/, "") + show(ref) + closer[0].trimStart() + tail;
        } else if (/[”"]$/.test(quote)) {
          out = head + tail;
        }
        continue;
      }
      if (ref) out = before + show(ref) + after;
    }
    return out;
  };

  const line = (row: string): string => {
    let out = "";
    let last = 0;
    for (const match of row.matchAll(TOKEN)) {
      const at = match.index ?? 0;
      out += ids(row.slice(last, at));
      const bare = match[3] !== undefined;
      // A sentence's full stop after a bare record link is not part of its address.
      const token = bare ? match[0].replace(/[.,;:!?]+$/, "") : match[0];
      last = at + token.length;
      const dest = match[2] !== undefined ? match[2] : bare ? token : null;
      const record = dest ? RECORD_LINK.exec(dest) : null;
      const kind = record ? refKind(record[1]!) : null;
      let id = record?.[2] ?? "";
      try {
        id = decodeURIComponent(id);
      } catch {
        id = "";
      }
      const ref = id ? known(id) : undefined;
      if (record && kind && id && bare) {
        const opener = LINK_OPENER.exec(out);
        const closer = CLOSER.exec(row.slice(last));
        const titled = ref && opener && opener[0].trim() && closer ? linkTitle(out.slice(0, opener.index), ref) : null;
        if (titled !== null) {
          out = titled;
          last += closer![0].length;
          continue;
        }
      }
      const written = match[1] !== undefined ? match[1].replace(/^@+/, "").trim() : "";
      const label = written && !isUuid(written) ? written : (ref?.label ?? "");
      if (record && kind && id && label) out += show(ref ?? { kind, id, label }, label);
      else if (record && kind && id && bare && options.kindLinks) out += show({ kind, id, label: KIND_WORD[kind] ?? kind });
      else out += token;
    }
    return out + ids(row.slice(last));
  };

  let fenced = false;
  return source
    .split("\n")
    .map((row) => {
      if (FENCE.test(row)) {
        fenced = !fenced;
        return row;
      }
      return fenced || QUOTE.test(row) ? row : line(row);
    })
    .join("\n");
}

/** Well-formed refs from message data. */
export function refsOf(value: unknown): EntityRef[] {
  return Array.isArray(value)
    ? value.filter((ref): ref is EntityRef => Boolean(ref) && typeof ref.id === "string" && typeof ref.label === "string" && typeof ref.kind === "string")
    : [];
}

/** The records a node message names: those saved on it, then those its tool calls returned. */
export function messageRefs(data: Record<string, unknown> | null | undefined): EntityRef[] {
  const tools = Array.isArray(data?.tools) ? (data!.tools as Array<{ refs?: unknown }>) : [];
  return [...refsOf(data?.refs), ...[...tools].reverse().flatMap((tool) => refsOf(tool?.refs))];
}

/** A message's text for one-line previews, quotes and copies: a node's records by title, a person's words as written. */
export function readableBody(message: { authorKind: string; body: string; data?: Record<string, unknown> | null }): string {
  return message.authorKind === "node" ? formatEntityText(message.body, messageRefs(message.data), { plain: true, showIds: message.data?.showIds === true }) : message.body;
}
