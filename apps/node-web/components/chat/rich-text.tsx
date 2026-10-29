/** @jsxRuntime automatic */

import { Fragment } from "react";
import { ENSEMBLE_APP } from "@/lib/config";
import { formatEntityText, type EntityRef } from "@/lib/entity-text";
import { blocks, boldParts } from "@/lib/markdown";
import { linkTarget, pieces } from "@/lib/text";
import { CodeBlock } from "./code-block";

function Inline({ text, handles }: { text: string; handles: ReadonlySet<string> }) {
  return (
    <>
      {boldParts(text).map((part, index) => {
        const inner = pieces(part.text, handles).map((piece, at) => {
          if (piece.code) {
            return (
              <code key={at} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em]">
                {piece.text}
              </code>
            );
          }
          if (piece.link) {
            const target = linkTarget(piece.link, ENSEMBLE_APP);
            return (
              <a key={at} href={target.href} {...(target.here ? {} : { target: "_blank", rel: "noopener noreferrer" })} className="text-accent underline underline-offset-2">
                {piece.text}
              </a>
            );
          }
          return piece.mention ? (
            <span key={at} className="rounded bg-accent/15 px-1 font-medium text-accent">
              {piece.text}
            </span>
          ) : (
            <Fragment key={at}>{piece.text}</Fragment>
          );
        });
        return part.bold ? <strong key={index}>{inner}</strong> : <Fragment key={index}>{inner}</Fragment>;
      })}
    </>
  );
}

/**
 * A message body: Markdown blocks with mentions, links and code. `small` for text inside a card.
 * With `refs` (a node's message), records show by title (lib/entity-text.ts): record links show
 * their label and a known id its title, linked, unless `showIds`. `streaming` holds back a
 * half-written id at the end. `kindLinks` (briefs and reports on cards) shows a record link nobody
 * named as its kind, linked.
 */
export function RichText({
  text,
  handles,
  small = false,
  refs,
  showIds = false,
  streaming = false,
  kindLinks = false,
}: {
  text: string;
  handles: ReadonlySet<string>;
  small?: boolean;
  refs?: readonly EntityRef[];
  showIds?: boolean;
  streaming?: boolean;
  kindLinks?: boolean;
}) {
  // Only a node's own words are formatted; what people write shows as they wrote it.
  const shown = refs || kindLinks ? formatEntityText(text, refs ?? [], { showIds, streaming, app: ENSEMBLE_APP, kindLinks }) : text;
  return (
    <div className={`min-w-0 max-w-full space-y-2 break-words leading-relaxed ${small ? "text-sm" : "text-[15px]"}`}>
      {blocks(shown).map((block, index) => {
        if (block.kind === "heading") return <p key={index} className="font-semibold">{<Inline text={block.text} handles={handles} />}</p>;
        if (block.kind === "code") return <CodeBlock key={index} code={block.text} lang={block.lang} />;
        if (block.kind === "quote") return <blockquote key={index} className="border-l-2 border-line pl-3 text-muted"><Inline text={block.text} handles={handles} /></blockquote>;
        if (block.kind === "table") {
          return (
            <div key={index} className="scroll-thin max-w-full overflow-x-auto rounded-lg border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" role="region" aria-label="Table" tabIndex={0}>
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {block.header.map((cell, column) => (
                      <th key={column} scope="col" className="bg-raised px-3 py-2 font-semibold" style={{ textAlign: block.align[column] ?? undefined }}>
                        <Inline text={cell} handles={handles} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, at) => (
                    <tr key={at} className="border-t border-line">
                      {row.map((cell, column) => (
                        <td key={column} className="px-3 py-2 align-top" style={{ textAlign: block.align[column] ?? undefined }}>
                          <Inline text={cell} handles={handles} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, at) => (
                <li key={at}>
                  <Inline text={item} handles={handles} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            <Inline text={block.text} handles={handles} />
          </p>
        );
      })}
    </div>
  );
}
