export const FACE_SHAPES: readonly ["orb", "square", "spark", "hex", "leaf", "compass", "pebble", "bloom", "gumdrop"];
export const FACE_EYES: readonly ["dot", "happy", "sleepy"];
export const FACE_STATES: readonly ["idle", "thinking", "working", "error", "sleeping"];
export const FACE_COLORS: readonly string[];
export const DEFAULT_THINK: "t1";
export const DEFAULT_WORK: "w1";
export const DEFAULT_PRESS: "c2";

export type FaceLook = {
  shape: string;
  eyes: string;
  state: string;
  color: string;
  think: string;
  work: string;
};

export function normalizeFace(input?: {
  shape?: string;
  color?: string;
  eyes?: string;
  state?: string;
  think?: string;
  work?: string;
}): FaceLook;

export function faceFromStatus(input?: {
  thinking?: boolean;
  resting?: boolean;
  attention?: boolean;
  workZone?: string;
}): { state: string; think: string; work: string };

export function paintNode(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec?: {
    shape?: string;
    color?: string;
    eyes?: string;
    state?: string;
    think?: string;
    work?: string;
    press?: string;
    time?: number;
    intensity?: number;
    phase?: number;
    lookX?: number;
    lookY?: number;
    ox?: number;
    oy?: number;
    loopPress?: boolean;
    pressStart?: number;
    pressUntil?: number;
    stage?: boolean;
    reduced?: boolean;
  },
): void;
