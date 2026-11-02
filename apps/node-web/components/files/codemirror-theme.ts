import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags, type Tag } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import type { IdeTheme, TokenRole } from "@ensemble/ide-theme";

const ROLES: Record<TokenRole, Tag | readonly Tag[]> = {
  comment: tags.comment, string: tags.string, number: tags.number, keyword: tags.keyword,
  controlKeyword: tags.controlKeyword, operator: tags.operator, function: tags.function(tags.variableName),
  type: tags.typeName, className: tags.className, tag: tags.tagName, attribute: tags.attributeName,
  variable: tags.variableName, property: tags.propertyName, constant: [tags.atom, tags.bool, tags.null],
  regexp: tags.regexp, punctuation: tags.punctuation, invalid: tags.invalid, heading: tags.heading,
  emphasis: tags.emphasis, strong: tags.strong, link: tags.link, inserted: tags.inserted, deleted: tags.deleted,
};
export function codeMirrorTheme(theme: IdeTheme) {
  if (!theme.editor) return [];
  const editor = theme.editor;
  return [
    EditorView.theme({
      "&": { backgroundColor: editor.background, color: editor.foreground },
      ".cm-content": { caretColor: editor.caret },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: editor.caret },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: editor.selection },
      ".cm-selectionMatch": { backgroundColor: editor.selectionMatch },
      ".cm-activeLine": { backgroundColor: editor.lineHighlight },
      ".cm-gutters": { backgroundColor: editor.gutterBackground, color: editor.gutterForeground, borderRight: `1px solid ${editor.gutterBorder}` },
      ".cm-activeLineGutter": { backgroundColor: editor.lineHighlight, color: editor.gutterActiveForeground },
    }, { dark: theme.kind !== "light" }),
    syntaxHighlighting(HighlightStyle.define(theme.tokens.map(token => ({
      tag: ROLES[token.role],
      ...(token.color ? { color: token.color } : {}),
      ...(token.fontStyle?.includes("italic") ? { fontStyle: "italic" } : {}),
      ...(token.fontStyle?.includes("bold") ? { fontWeight: "bold" } : {}),
      ...(/underline|strikethrough/.test(token.fontStyle ?? "") ? { textDecoration: [token.fontStyle?.includes("underline") ? "underline" : "", token.fontStyle?.includes("strikethrough") ? "line-through" : ""].filter(Boolean).join(" ") } : {}),
    })))),
  ];
}
