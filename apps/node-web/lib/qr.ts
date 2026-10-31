/**
 * A QR code (ISO/IEC 18004) for a short text such as a link, for "Open on your phone" on a sign-in
 * card. Byte mode (UTF-8), the smallest version that fits at the level asked for (M by default: about
 * 15 % of the symbol may be damaged), and the mask with the lowest penalty. Written for Node from the
 * standard: no dependency, a few kilobytes, checked against the standard's worked example and a decoder.
 */

export type QrLevel = "L" | "M" | "Q" | "H";

/** `dark[y * size + x]`: whether the module in row y, column x is dark. No quiet zone. */
export type QrCode = { version: number; size: number; level: QrLevel; mask: number; dark: Uint8Array };

const LEVELS: readonly QrLevel[] = ["L", "M", "Q", "H"];
/** The two format bits of each level. */
const FORMAT_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Per level (L, M, Q, H), indexed by version (0 unused): error correction codewords in each block, and how many blocks.
const ECC_PER_BLOCK: readonly (readonly number[])[] = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const BLOCKS: readonly (readonly number[])[] = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** The rows and columns of a version's alignment patterns' centres. */
export function alignmentCentres(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const centres = [6];
  for (let at = version * 4 + 10; centres.length < count; at -= step) centres.splice(1, 0, at);
  return centres;
}

/** Codewords a version holds for data and error correction together. */
function rawCodewords(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    modules -= (25 * count - 10) * count - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

/** Codewords a version holds for data at a level. */
export function dataCodewords(version: number, level: QrLevel): number {
  const row = LEVELS.indexOf(level);
  return rawCodewords(version) - ECC_PER_BLOCK[row]![version]! * BLOCKS[row]![version]!;
}

/** GF(2^8) multiplication with the QR code's polynomial, x^8 + x^4 + x^3 + x^2 + 1. */
function multiply(x: number, y: number): number {
  let product = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((y >>> bit) & 1) * x;
  }
  return product;
}

/** The Reed–Solomon generator of a degree, highest coefficient first, the leading 1 left out. */
function generator(degree: number): number[] {
  const poly = new Array<number>(degree).fill(0);
  poly[degree - 1] = 1;
  let root = 1;
  for (let round = 0; round < degree; round += 1) {
    for (let at = 0; at < degree; at += 1) {
      poly[at] = multiply(poly[at]!, root);
      if (at + 1 < degree) poly[at] ^= poly[at + 1]!;
    }
    root = multiply(root, 2);
  }
  return poly;
}

/** The error correction codewords of one block of data. */
export function reedSolomon(data: readonly number[], degree: number): number[] {
  const divisor = generator(degree);
  const rest = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rest.shift()!;
    rest.push(0);
    for (let at = 0; at < degree; at += 1) rest[at] ^= multiply(divisor[at]!, factor);
  }
  return rest;
}

/** The data codewords for `bytes` in byte mode at this version and level: header, data, terminator and padding. */
function dataStream(bytes: Uint8Array, version: number, capacity: number): number[] {
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let bit = length - 1; bit >= 0; bit -= 1) bits.push((value >>> bit) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) put(byte, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let at = 0; at < bits.length; at += 8) words.push(bits.slice(at, at + 8).reduce((word, bit) => (word << 1) | bit, 0));
  for (let pad = 0xec; words.length < capacity; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Splits the data into blocks, adds each block's error correction and interleaves them, as the symbol holds them. */
function codewords(data: readonly number[], version: number, level: QrLevel): number[] {
  const row = LEVELS.indexOf(level);
  const blocks = BLOCKS[row]![version]!;
  const eccLength = ECC_PER_BLOCK[row]![version]!;
  const raw = rawCodewords(version);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks) - eccLength;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let block = 0, at = 0; block < blocks; block += 1) {
    const length = shortLength + (block < shortBlocks ? 0 : 1);
    const part = data.slice(at, at + length);
    at += length;
    dataBlocks.push(part);
    eccBlocks.push(reedSolomon(part, eccLength));
  }
  const out: number[] = [];
  for (let column = 0; column <= shortLength; column += 1) for (const part of dataBlocks) if (column < part.length) out.push(part[column]!);
  for (let column = 0; column < eccLength; column += 1) for (const part of eccBlocks) out.push(part[column]!);
  return out;
}

const MASKS: ReadonlyArray<(y: number, x: number) => boolean> = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/** The 15 format bits for a level and mask: BCH(15, 5), then the standard's XOR mask. */
export function formatBits(level: QrLevel, mask: number): number {
  const data = (FORMAT_BITS[level] << 3) | mask;
  let rest = data;
  for (let step = 0; step < 10; step += 1) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  return ((data << 10) | rest) ^ 0x5412;
}

/** The 18 version bits (version 7 and up): BCH(18, 6). */
function versionBits(version: number): number {
  let rest = version;
  for (let step = 0; step < 12; step += 1) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
  return (version << 12) | rest;
}

class Grid {
  readonly dark: Uint8Array;
  readonly fixed: Uint8Array;
  constructor(readonly size: number) {
    this.dark = new Uint8Array(size * size);
    this.fixed = new Uint8Array(size * size);
  }
  set(x: number, y: number, dark: boolean) {
    this.dark[y * this.size + x] = dark ? 1 : 0;
    this.fixed[y * this.size + x] = 1;
  }
  get(x: number, y: number): boolean {
    return this.dark[y * this.size + x] === 1;
  }
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const size = grid.size;
  for (let at = 0; at < size; at += 1) {
    grid.set(6, at, at % 2 === 0);
    grid.set(at, 6, at % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) grid.set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  const centres = alignmentCentres(version);
  const last = centres.length - 1;
  for (let i = 0; i <= last; i += 1) {
    for (let j = 0; j <= last; j += 1) {
      // Not over the three finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) grid.set(centres[i]! + dx, centres[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormat(grid, formatBits("M", 0));
  if (version >= 7) {
    const bits = versionBits(version);
    for (let at = 0; at < 18; at += 1) {
      const dark = ((bits >>> at) & 1) === 1;
      const a = size - 11 + (at % 3);
      const b = Math.floor(at / 3);
      grid.set(a, b, dark);
      grid.set(b, a, dark);
    }
  }
}

function drawFormat(grid: Grid, bits: number): void {
  const size = grid.size;
  const bit = (at: number) => ((bits >>> at) & 1) === 1;
  for (let at = 0; at <= 5; at += 1) grid.set(8, at, bit(at));
  grid.set(8, 7, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(7, 8, bit(8));
  for (let at = 9; at < 15; at += 1) grid.set(14 - at, 8, bit(at));
  for (let at = 0; at < 8; at += 1) grid.set(size - 1 - at, 8, bit(at));
  for (let at = 8; at < 15; at += 1) grid.set(8, size - 15 + at, bit(at));
  grid.set(8, size - 8, true);
}

/** Places the codewords in the zigzag the standard reads them in, two columns at a time from the bottom right. */
function drawCodewords(grid: Grid, words: readonly number[]): void {
  const size = grid.size;
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (let side = 0; side < 2; side += 1) {
        const x = right - side;
        if (grid.fixed[y * size + x] || at >= words.length * 8) continue;
        grid.dark[y * size + x] = (words[at >>> 3]! >>> (7 - (at & 7))) & 1;
        at += 1;
      }
    }
  }
}

function applyMask(grid: Grid, mask: number): void {
  const test = MASKS[mask]!;
  for (let y = 0; y < grid.size; y += 1) for (let x = 0; x < grid.size; x += 1) if (!grid.fixed[y * grid.size + x] && test(y, x)) grid.dark[y * grid.size + x] ^= 1;
}

const FINDER_LIKE = [
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
];

/** The standard's penalty for a masked symbol: long runs, 2×2 blocks, finder-like patterns and an uneven balance of dark and light. */
export function penalty(dark: Uint8Array, size: number): number {
  let score = 0;
  const at = (x: number, y: number) => dark[y * size + x]!;
  for (let line = 0; line < size; line += 1) {
    for (const horizontal of [true, false]) {
      const cell = (step: number) => (horizontal ? at(step, line) : at(line, step));
      let run = 1;
      for (let step = 1; step <= size; step += 1) {
        if (step < size && cell(step) === cell(step - 1)) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      for (let start = 0; start + 11 <= size; start += 1) {
        for (const pattern of FINDER_LIKE) if (pattern.every((value, offset) => cell(start + offset) === value)) score += 40;
      }
    }
  }
  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) {
      const value = at(x, y);
      if (value === at(x + 1, y) && value === at(x, y + 1) && value === at(x + 1, y + 1)) score += 3;
    }
  }
  const total = size * size;
  const darkCount = dark.reduce((sum, value) => sum + value, 0);
  score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The smallest version that holds `length` bytes at a level, or null when none does. */
export function versionFor(length: number, level: QrLevel): number | null {
  for (let version = 1; version <= 40; version += 1) {
    const bits = 4 + (version < 10 ? 8 : 16) + length * 8;
    if (length < (version < 10 ? 256 : 65_536) && bits <= dataCodewords(version, level) * 8) return version;
  }
  return null;
}

/** The QR code for a text (UTF-8, byte mode). Throws when the text is too long for any version. */
export function qrEncode(text: string, level: QrLevel = "M"): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length, level);
  if (version === null) throw new Error("That is too long for a QR code.");
  const words = codewords(dataStream(bytes, version, dataCodewords(version, level)), version, level);
  const size = version * 4 + 17;
  const grid = new Grid(size);
  drawFunctionPatterns(grid, version);
  drawCodewords(grid, words);
  let best = { mask: 0, score: Number.POSITIVE_INFINITY };
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(grid, mask);
    drawFormat(grid, formatBits(level, mask));
    const score = penalty(grid.dark, size);
    if (score < best.score) best = { mask, score };
    applyMask(grid, mask);
  }
  applyMask(grid, best.mask);
  drawFormat(grid, formatBits(level, best.mask));
  return { version, size, level, mask: best.mask, dark: grid.dark };
}

/** An SVG path drawing the dark modules, one unit each, offset by the quiet zone (4 modules, as the standard asks). */
export function qrPath(code: Pick<QrCode, "size" | "dark">, quiet = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) {
      if (!code.dark[y * code.size + x]) continue;
      // Joins a run of dark modules in a row into one rectangle.
      let end = x;
      while (end + 1 < code.size && code.dark[y * code.size + end + 1]) end += 1;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x + 1}v1h${-(end - x + 1)}z`);
      x = end;
    }
  }
  return parts.join("");
}

/** The quiet zone the standard asks for: four light modules on every side. */
export const QR_QUIET = 4;

/**
 * How large a code is drawn so phones read it from a screen: a whole number of the screen's pixels per
 * module (every module the same size, edges sharp), and at least `minCss` CSS pixels across, quiet
 * zone included. `dpr` is the screen's device pixel ratio.
 */
export function qrScale(size: number, minCss: number, dpr: number): { modulePx: number; devicePx: number; cssSize: number } {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const side = size + QR_QUIET * 2;
  const modulePx = Math.max(1, Math.ceil((minCss * ratio) / side));
  return { modulePx, devicePx: side * modulePx, cssSize: (side * modulePx) / ratio };
}

/**
 * The code as RGBA pixels, `modulePx` per module: dark modules black on white, with the quiet zone,
 * whatever the page's theme (a phone's camera reads dark on light, not the reverse).
 */
export function qrPixels(code: Pick<QrCode, "size" | "dark">, modulePx: number): { width: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const width = (code.size + QR_QUIET * 2) * modulePx;
  const data = new Uint8ClampedArray(new ArrayBuffer(width * width * 4)).fill(255);
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) {
      if (!code.dark[y * code.size + x]) continue;
      for (let dy = 0; dy < modulePx; dy += 1) {
        const row = ((y + QR_QUIET) * modulePx + dy) * width;
        for (let dx = 0; dx < modulePx; dx += 1) {
          const at = (row + (x + QR_QUIET) * modulePx + dx) * 4;
          data[at] = 0;
          data[at + 1] = 0;
          data[at + 2] = 0;
        }
      }
    }
  }
  return { width, data };
}
