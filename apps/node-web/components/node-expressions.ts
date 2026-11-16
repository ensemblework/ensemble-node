import { gsap } from "gsap";

export type NodeExpression = "hello" | "wake" | "delight" | "wink" | "twinkle" | "double-blink";
export const CLICK_EXPRESSIONS: readonly NodeExpression[] = ["delight", "twinkle", "wink", "double-blink"];

/** A press plays the lab's nod on the canvas face. The timeline only marks how long that lasts. */
export function nodeExpression(root: HTMLElement, expression: NodeExpression): gsap.core.Timeline {
  const face = root.querySelector("[data-node-avatar]") ?? root;
  face.dispatchEvent(new CustomEvent("node-react", { detail: expression }));
  root.dataset.expression = expression;
  return gsap.timeline({ onComplete: () => { delete root.dataset.expression; } }).to({}, { duration: 0.78 });
}
