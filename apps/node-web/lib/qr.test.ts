import assert from "node:assert/strict";
import test from "node:test";
import { alignmentCentres, dataCodewords, formatBits, qrEncode, qrPath, reedSolomon, versionFor } from "./qr";

test("error correction is the standard's worked example (version 1-M)", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(reedSolomon(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("format bits, data capacity and alignment patterns follow the standard's tables", () => {
  assert.equal(formatBits("M", 0), 0b101010000010010);
  assert.equal(formatBits("L", 0), 0b111011111000100);
  assert.equal(formatBits("Q", 0), 0b011010101011111);
  assert.equal(formatBits("H", 0), 0b001011010001001);
  assert.equal(formatBits("M", 5), 0b100000011001110);
  const table: Record<number, [number, number, number, number]> = { 1: [19, 16, 13, 9], 2: [34, 28, 22, 16], 5: [108, 86, 62, 46], 7: [156, 124, 88, 66], 10: [274, 216, 154, 122], 40: [2956, 2334, 1666, 1276] };
  for (const [version, counts] of Object.entries(table)) assert.deepEqual((["L", "M", "Q", "H"] as const).map((level) => dataCodewords(Number(version), level)), counts, `version ${version}`);
  assert.deepEqual(alignmentCentres(1), []);
  assert.deepEqual(alignmentCentres(7), [6, 22, 38]);
  assert.deepEqual(alignmentCentres(32), [6, 34, 60, 86, 112, 138]);
  // A card's link on the production site fits version 7 at level M (122 bytes).
  assert.equal(versionFor("https://node.ensemblework.com/r/5e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b#m-0c1d2e3f-4a5b-4e6f-8a9b-5e1f2a3b4c5d".length, "M"), 7);
  assert.equal(versionFor(14, "M"), 1);
  assert.equal(versionFor(15, "M"), 2);
  assert.equal(versionFor(3000, "M"), null);
});

test("a symbol has its finder patterns, timing and dark module, and a path for SVG", () => {
  const code = qrEncode("https://node.ensemblework.com/r/dm-a3#m-c-login");
  assert.equal(code.size, code.version * 4 + 17);
  const dark = (x: number, y: number) => code.dark[y * code.size + x] === 1;
  for (const [cx, cy] of [[3, 3], [code.size - 4, 3], [3, code.size - 4]]) {
    assert.ok(dark(cx!, cy!) && !dark(cx! + 2, cy!) && dark(cx! + 3, cy!), "a finder's centre, light ring and dark edge");
  }
  for (let at = 8; at < code.size - 8; at += 1) assert.equal(dark(at, 6), at % 2 === 0, "timing");
  assert.ok(dark(8, code.size - 8), "the dark module");
  const path = qrPath(code);
  assert.match(path, /^M4 4h7v1h-7z/);
  assert.throws(() => qrEncode("x".repeat(3000)), /too long/);
});
