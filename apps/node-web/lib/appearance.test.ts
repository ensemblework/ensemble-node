import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { ACCENTS, APPEARANCE_SCRIPT, DEFAULT_APPEARANCE, PALETTES, normaliseAppearance } from "./appearance";
import { SIDEBAR_DEFAULT, sidebarWidth } from "./sidebar";

test("saved appearance accepts known choices, not arbitrary CSS, missing or obsolete values", () => {
  const saved = { mode: "light", palette: "graphite", accent: "tide", doodle: "orbits", motion: "off" };
  assert.deepEqual(normaliseAppearance(saved), saved);
  assert.deepEqual(normaliseAppearance({ ...saved, mode: "auto", doodle: 'url("https://example.com")' }), { ...saved, mode: "system", doodle: "none" });
  for (const value of [null, [], "light", false]) assert.deepEqual(normaliseAppearance(value), DEFAULT_APPEARANCE);
});

test("pre-hydration appearance agrees with restored choices and follows the system only in system mode", () => {
  const paint = (saved: string, light: boolean) => {
    const dataset: Record<string, string> = {};
    runInNewContext(APPEARANCE_SCRIPT, { document: { documentElement: { dataset } }, localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: light }), console: { warn() {} } });
    return dataset;
  };
  assert.equal(paint('{"mode":"dark","palette":"graphite"}', true).theme, "dark");
  assert.equal(paint('{"mode":"system"}', true).theme, "light");
  assert.equal(paint('{"mode":"system"}', false).theme, "dark");
  assert.deepEqual(paint("{broken", true), { ...DEFAULT_APPEARANCE, theme: "light" });
  assert.equal(paint('{"accent":"invalid","doodle":"botanical"}', false).accent, "gold");
});

const rgb = (value: string) => value.startsWith("#")
  ? [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16))
  : value.split(" ").map(Number);
const luminance = (value: string) => rgb(value).map(part => part / 255).map(part => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4)
  .reduce((sum, part, index) => sum + part * [.2126, .7152, .0722][index]!, 0);
const contrast = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + .05) / (values[1]! + .05);
};

test("every theme keeps body, secondary and accent text and filled controls readable in either mode", () => {
  for (const palette of PALETTES) for (const mode of ["light", "dark"] as const) {
    for (const surface of palette[mode].slice(0, 3)) {
      for (const ink of palette[mode].slice(4)) assert.ok(contrast(surface, ink) >= 4.5, `${palette.id} ${mode}: text contrast`);
      for (const accent of ACCENTS) assert.ok(contrast(surface, accent[mode]) >= 4.5, `${palette.id} ${mode} ${accent.id}: accent contrast`);
    }
    for (const accent of ACCENTS) assert.ok(contrast(accent[mode], mode === "light" ? "#FFFFFF" : "#14120F") >= 4.5, `${mode} ${accent.id}: button contrast`);
  }
});

test("sidebar resizing clamps to usable limits and recovers from missing or corrupt preferences", () => {
  assert.equal(sidebarWidth(180), 248);
  assert.equal(sidebarWidth(800), 420);
  assert.equal(sidebarWidth("316.8"), 317);
  for (const value of [null, undefined, "", "broken", Infinity]) assert.equal(sidebarWidth(value), SIDEBAR_DEFAULT);
});
