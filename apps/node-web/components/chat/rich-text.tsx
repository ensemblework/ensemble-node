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
 * half-written id at the end.
 */
export function RichText({
  text,
  handles,
  small = false,
  refs,
  showIds = false,
  streaming = false,
}: {
  text: string;
  handles: ReadonlySet<string>;
  small?: boolean;
  refs?: readonly EntityRef[];
  showIds?: boolean;
  streaming?: boolean;
}) {
  // Only a node's own words are formatted; what people write shows as they wrote it.
  const shown = refs ? formatEntityText(text, refs, { showIds, streaming, app: ENSEMBLE_APP }) : text;
  return (
    <div className={`space-y-2 break-words leading-relaxed ${small ? "text-sm" : "text-[15px]"}`}>
      {blocks(shown).map((block, index) => {
        if (block.kind === "heading") return <p key={index} className="font-semibold">{<Inline text={block.text} handles={handles} />}</p>;
        if (block.kind === "code") return <CodeBlock key={index} code={block.text} lang={block.lang} />;
        if (block.kind === "quote") return <blockquote key={index} className="border-l-2 border-line pl-3 text-muted"><Inline text={block.text} handles={handles} /></blockquote>;
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
