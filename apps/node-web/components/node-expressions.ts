import { gsap } from "gsap";
import { AVATAR_MORPHS, AVATAR_PATHS, AVATAR_SHAPES } from "./node-avatar";

export type NodeExpression = "hello" | "wake" | "delight" | "wink" | "twinkle" | "double-blink";
export const CLICK_EXPRESSIONS: readonly NodeExpression[] = ["delight", "twinkle", "wink", "double-blink"];

/** Repeated presses replace the previous pose, including its partially morphed outline. */
export function nodeExpression(root: HTMLElement, expression: NodeExpression): gsap.core.Timeline {
  const svg = root.querySelector<SVGSVGElement>("[data-node-avatar]")!;
  const shape = AVATAR_SHAPES.find(id => id === svg.dataset.nodeShape) ?? "orb";
  const body = svg.querySelector(".node-body");
  const pose = svg.querySelector(".node-pose");
  const outline = svg.querySelector(".node-silhouette");
  const eyes = svg.querySelector(".node-eyes");
  const left = svg.querySelector(".node-eye-left");
  const right = svg.querySelector(".node-eye-right");
  const happy = svg.querySelector(".node-happy-eyes");
  const smile = svg.querySelector(".node-smile");
  const sparkles = svg.querySelector(".node-sparkles");
  root.dataset.expression = expression;
  const timeline = gsap.timeline({ onComplete: () => { delete root.dataset.expression; } });
  timeline.set(body, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    .set(pose, { rotation: 0 })
    .set(outline, { attr: { d: AVATAR_PATHS[shape] } })
    .set([eyes, left, right], { scaleY: 1, opacity: 1 })
    .set([happy, smile, sparkles], { opacity: 0 });

  if (expression === "wink" || expression === "double-blink") {
    const target = expression === "wink" ? left : eyes;
    timeline.to(body, { rotation: expression === "wink" ? -4 : 2, y: -1, duration: .18 })
      .to(target, { scaleY: .06, duration: .1 }, .1)
      .to(target, { scaleY: 1, duration: .16 }, .22);
    if (expression === "double-blink") timeline.to(target, { scaleY: .06, duration: .09 }, .46).to(target, { scaleY: 1, duration: .18 }, .6);
    else timeline.to(smile, { opacity: 1, duration: .12 }, .12).to(smile, { opacity: 0, duration: .2 }, .75);
    return timeline.to(body, { rotation: 0, y: 0, duration: .35, ease: "back.out(2)" }, .65);
  }

  const wake = expression === "wake";
  timeline.to(body, { scaleX: 1.07, scaleY: .93, y: 1.5, rotation: wake ? -4 : -3, duration: .16 })
    .to(outline, { attr: { d: AVATAR_MORPHS[shape] }, duration: .24, ease: "sine.inOut" }, 0)
    .to(body, { scaleX: .98, scaleY: 1.04, y: -4, rotation: 3, duration: .25, ease: "power2.out" })
    .to(body, { scaleX: 1, scaleY: 1, y: 0, rotation: 0, duration: .6, ease: "back.out(1.2)" })
    .to(outline, { attr: { d: AVATAR_PATHS[shape] }, duration: .45, ease: "power2.out" }, .4);
  if (wake) timeline.fromTo(eyes, { scaleY: .08 }, { scaleY: 1.2, duration: .4, ease: "power2.out", immediateRender: false }, .12).to(eyes, { scaleY: 1, duration: .2 }, .65);
  else timeline.to(eyes, { opacity: 0, duration: .08 }, .14).to([happy, smile], { opacity: 1, duration: .1 }, .14)
    .to([happy, smile], { opacity: 0, duration: .2 }, .85).to(eyes, { opacity: 1, duration: .15 }, .9);
  if (expression === "delight" || expression === "twinkle") {
    const rotation = shape === "spark" ? 0 : shape === "leaf" ? -4 : 3;
    timeline.to(pose, { rotation, duration: .7, ease: "sine.inOut" }, .15)
      .to(pose, { rotation: 0, duration: .3 }, .85)
      .fromTo(sparkles, { opacity: 0, scale: .5 }, { opacity: 1, scale: 1.1, duration: .25, immediateRender: false }, .2)
      .to(sparkles, { opacity: 0, scale: 1.3, duration: .35 }, .65);
  }
  return timeline;
}
