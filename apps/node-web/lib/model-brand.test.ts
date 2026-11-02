import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AVATAR_MORPHS, AVATAR_PATHS, AVATAR_SHAPES, avatarTones, NodeAvatar } from "../components/node-avatar";
import { ModelLogo } from "../components/model-logo";
import { MODEL_BRANDS, modelBrand } from "./model-brand";
import manifest from "../public/providers/manifest.json";

test("real model signatures take precedence over the provider or agent that routed them", () => {
  for (const [model, brand] of [["gpt-6.1-sol", "openai"], ["claude-sonnet-4-6", "claude"], ["grok-4.7", "grok"], ["gemini-3-pro", "gemini"], ["mai-code-2-flash", "microsoft"], ["deepseek-r1", "deepseek"], ["qwen3-coder", "qwen"], ["kimi-k2", "kimi"], ["codestral", "mistral"]]) {
    assert.equal(modelBrand(model, "copilot-cli"), brand);
  }
  assert.equal(modelBrand(null, "copilot-cli"), "copilot");
  assert.equal(modelBrand(null, "cursor-agent"), "cursor");
  assert.equal(modelBrand("my-custom-model", "private-provider"), null);
});

test("each signature is a local canonical vector with provenance, not a placeholder or remote script", () => {
  for (const key of Object.keys(MODEL_BRANDS)) {
    const provenance = manifest.marks[key as keyof typeof manifest.marks];
    assert.ok(provenance?.source, key);
    const svg = readFileSync(new URL(`../public/providers/${key}.svg`, import.meta.url), "utf8");
    assert.match(svg, /<svg/);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:/i);
  }
  const icon = renderToStaticMarkup(createElement(ModelLogo, { model: "gpt-5-mini" }));
  assert.match(icon, /aria-label="OpenAI"/);
  assert.match(icon, /providers\/openai\.svg/);
});

test("nodes keep their saved signature face independently of their model or provider", () => {
  const avatar = { shape: "hex" as const, color: "#B39DDB", eyes: "wide" as const };
  const render = (node: { avatar: typeof avatar; model?: string | null; provider?: string | null }) =>
    renderToStaticMarkup(createElement(NodeAvatar, { node }));
  const signature = render({ avatar });
  assert.match(signature, /<svg[^>]+data-node-avatar/);
  assert.match(signature, /d="M50 5l39 22v46L50 95 11 73V27z"/);
  assert.match(signature, /stop-color="#B39DDB"/);
  assert.equal([...signature.matchAll(/<ellipse /g)].length, 2);
  assert.doesNotMatch(signature, /data-model-brand|providers\//);
  assert.equal(render({ avatar, model: "gpt-5-mini", provider: "ensemble" }), signature);
  assert.equal(render({ avatar, model: "claude-sonnet-4-6", provider: "anthropic" }), signature);
  assert.equal(render({ avatar, model: null, provider: null }), signature);
});

test("signature shape and eyes remain editable without sharing SVG gradients", () => {
  const faces = AVATAR_SHAPES.map((shape, index) => createElement(NodeAvatar, {
    key: shape, avatar: { shape, color: "#7FB3D5", eyes: (["dot", "line", "wide"] as const)[index % 3]! },
  }));
  const markup = renderToStaticMarkup(createElement(Fragment, null, ...faces));
  const gradients = [...markup.matchAll(/<radialGradient id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(gradients).size, faces.length);
  assert.equal(new Set([...markup.matchAll(/<path\b(?=[^>]*class="node-silhouette")[^>]*\bd="([^"]+)"/g)].map(match => match[1])).size, faces.length);
  for (const id of gradients) assert.ok(markup.includes(`fill="url(#${id})"`));
  for (const element of ["circle", "rect", "ellipse"]) assert.equal([...markup.matchAll(new RegExp(`<${element} `, "g"))].length, 4);
});

test("each outline can morph and return without changing its SVG command structure", () => {
  for (const shape of AVATAR_SHAPES) {
    assert.deepEqual(AVATAR_PATHS[shape].match(/[a-z]/gi), AVATAR_MORPHS[shape].match(/[a-z]/gi), shape);
    assert.equal(AVATAR_PATHS[shape].match(/-?\d+(?:\.\d+)?/g)?.length, AVATAR_MORPHS[shape].match(/-?\d+(?:\.\d+)?/g)?.length, shape);
  }
});

test("an unspecified node keeps the original default face and status styling", () => {
  const markup = renderToStaticMarkup(createElement(NodeAvatar, { thinking: true, dim: true, title: "Scout" }));
  assert.match(markup, /aria-label="Scout"/);
  assert.match(markup, /node-thinking/);
  assert.match(markup, /opacity-50 grayscale/);
  assert.match(markup, /stop-color="#D7B56F"/);
  assert.equal([...markup.matchAll(/<circle /g)].length, 2);
  assert.doesNotMatch(markup, /data-model-brand|providers\//);
});

test("a face is shaded in its own hue, opaque, with a darker edge and eyes that contrast with it", () => {
  const gold = avatarTones("#D7B56F");
  assert.deepEqual([gold.light, gold.shade, gold.edge, gold.eyes], ["#EBDAB7", "#C2A364", "#977F4E", "#14110C"]);
  assert.equal(avatarTones("#2B3A67").eyes, "#FBF8F1", "light eyes on a dark colour");
  const markup = renderToStaticMarkup(createElement(NodeAvatar, { avatar: { shape: "orb", color: "#F2CC8F", eyes: "dot" } }));
  assert.doesNotMatch(markup, /stop-opacity|#ffffff/i, "no see-through white highlight");
  assert.match(markup, /stroke="#A98F64"/);
  assert.match(markup, /class="node-eyes" fill="#14110C"/);
});

test("eyes sit inside every shape, the narrow spark and compass included", () => {
  // The largest distance from the centre each shape's body keeps all around (inner ring, inner square), less its edge.
  const inside: Record<string, (x: number, y: number) => boolean> = {
    spark: (x, y) => Math.hypot(x - 50, y - 50) <= 18,
    compass: (x, y) => Math.abs(y - 50) <= 13 && Math.abs(x - 50) <= 26 - Math.abs(y - 50),
  };
  for (const shape of ["spark", "compass"] as const) {
    for (const eyes of ["dot", "line", "wide"] as const) {
      const markup = renderToStaticMarkup(createElement(NodeAvatar, { avatar: { shape, color: "#B39DDB", eyes } }));
      const points: Array<[number, number]> = [];
      for (const [, cx, cy, r] of markup.matchAll(/<circle\b[^>]*cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) points.push([+cx! - +r!, +cy!], [+cx! + +r!, +cy!], [+cx!, +cy! - +r!], [+cx!, +cy! + +r!]);
      for (const [, cx, cy, rx, ry] of markup.matchAll(/<ellipse\b[^>]*cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)) points.push([+cx! - +rx!, +cy!], [+cx! + +rx!, +cy!], [+cx!, +cy! - +ry!], [+cx!, +cy! + +ry!]);
      for (const [, x, y, w, h] of markup.matchAll(/<rect\b[^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) points.push([+x!, +y!], [+x! + +w!, +y!], [+x!, +y! + +h!], [+x! + +w!, +y! + +h!]);
      assert.equal(points.length, 8, `${shape} ${eyes}`);
      for (const [x, y] of points) assert.ok(inside[shape]!(x, y), `${shape} ${eyes} eye point ${x},${y}`);
    }
  }
});
