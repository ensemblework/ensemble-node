/** A small Markdown subset for node replies, including GFM tables. */
export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  /** `lang`: the fence's language ("ts" from ```ts), or null. */
  | { kind: "code"; text: string; lang: string | null }
  | { kind: "quote"; text: string }
  | { kind: "table"; header: string[]; align: Array<"left" | "center" | "right" | null>; rows: string[][] }
  | { kind: "paragraph"; text: string };

const HEADING = /^(#{1,4})\s+(.*)$/;
const LIST_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;

function tableRow(line: string): { cells: string[]; hasPipe: boolean } {
  const text = line.trim();
  const cells: string[] = [];
  let cell = "";
  let slashes = 0;
  let hasPipe = false;
  let trailingPipe = false;
  for (const char of text) {
    trailingPipe = char === "|" && slashes % 2 === 0;
    if (trailingPipe) {
      cells.push(cell.trim());
      cell = "";
      hasPipe = true;
    } else {
      // GFM escapes a pipe even inside inline code; only an odd backslash count escapes it.
      cell = char === "|" ? `${cell.slice(0, -1)}|` : cell + char;
    }
    slashes = char === "\\" ? slashes + 1 : 0;
  }
  cells.push(cell.trim());
  if (text.startsWith("|")) cells.shift();
  if (trailingPipe) cells.pop();
  return { cells, hasPipe };
}

export function blocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      flush();
      const lang = /^```\s*([\w+#.-]+)/.exec(line)?.[1]?.toLowerCase() ?? null;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      out.push({ kind: "code", text: code.join("\n"), lang });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      out.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = Boolean(item[2]);
      const last = out[out.length - 1];
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item[3]!);
      else out.push({ kind: "list", ordered, items: [item[3]!] });
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      out.push({ kind: "quote", text: line.replace(/^>\s?/, "") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const separator = lines[i + 1];
    if (separator && /^[\s|:-]+$/.test(separator)) {
      const header = tableRow(line);
      const divider = tableRow(separator);
      if (
        (header.hasPipe || divider.hasPipe) &&
        header.cells.length > 0 &&
        header.cells.length === divider.cells.length &&
        divider.cells.every((cell) => /^:?-+:?$/.test(cell))
      ) {
        flush();
        const align = divider.cells.map((cell) => cell.startsWith(":") ? (cell.endsWith(":") ? "center" : "left") : cell.endsWith(":") ? "right" : null);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length) {
          const row = lines[i]!;
          if (!row.trim() || row.startsWith("```") || row.startsWith(">") || HEADING.test(row) || LIST_ITEM.test(row)) break;
          const { cells } = tableRow(row);
          rows.push(header.cells.map((_, column) => cells[column] ?? ""));
          i += 1;
        }
        i -= 1;
        out.push({ kind: "table", header: header.cells, align, rows });
        continue;
      }
    }
    paragraph.push(line);
  }
  flush();
  return out;
}

/** Splits **bold** from the rest; the rest still goes through mention/link/code splitting. */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), bold: false });
    out.push({ text: match[1]!, bold: true });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length ? out : [{ text, bold: false }];
}
