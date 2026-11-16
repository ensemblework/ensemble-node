/** Shared canvas face for Ensemble nodes. The design lab and the app both import this. No WebGL. */
const CAM = { y: 0.10, z: 2.42, spread: 1.16 };
const frame = { time: 0, intensity: 0.7, pressWhich: "c2" };

export const FACE_SHAPES = ["orb", "square", "spark", "hex", "leaf", "compass", "pebble", "bloom", "gumdrop"];
export const FACE_EYES = ["dot", "happy", "sleepy"];
export const FACE_STATES = ["idle", "thinking", "working", "error", "sleeping"];
export const DEFAULT_THINK = "t1";
export const DEFAULT_WORK = "w1";
export const DEFAULT_PRESS = "c2";

const COLORS = [
  { id: "gold", name: "Gold", hex: "#D7B56F" },
  { id: "blue", name: "Blue", hex: "#7FB3D5" },
  { id: "coral", name: "Coral", hex: "#E07A5F" },
  { id: "sage", name: "Sage", hex: "#81B29A" },
  { id: "lavender", name: "Lavender", hex: "#B39DDB" },
  { id: "sand", name: "Sand", hex: "#F2CC8F" },
  { id: "teal", name: "Teal", hex: "#5FB4A2" },
  { id: "pink", name: "Pink", hex: "#E8A3B5" },
];

const FLAT = {
  spark: "M50 4l11 24 25-6-14 22 20 18-26 3 2 26-18-18-18 18 2-26-26-3 20-18-14-22 25 6z",
  hex: "M50 5l39 22v46L50 95 11 73V27z",
  compass: "M50 4l14 32 32 14-32 14-14 32-14-32L4 50l32-14z",
};

const SHAPES = [
  { id: "orb", name: "Orb", solid: true, shader: 0, radius: 0.78, face: { x: 0, y: 0.08, z: 0.62, gap: 0.2, scale: 1 } },
  { id: "square", name: "Square", solid: true, shader: 1, radius: 0.7, face: { x: 0, y: 0.06, z: 0.62, gap: 0.2, scale: 1 } },
  { id: "spark", name: "Spark", solid: false, face: { x: 50, y: 50, gap: 9, scale: 0.85 } },
  { id: "hex", name: "Hex", solid: false, face: { x: 50, y: 50, gap: 11, scale: 1 } },
  { id: "leaf", name: "Leaf", solid: true, shader: 2, radius: 0.8, face: { x: 0, y: 0.02, z: 0.58, gap: 0.18, scale: 0.96 } },
  { id: "compass", name: "Compass", solid: false, face: { x: 50, y: 50, gap: 8, scale: 0.66 } },
  { id: "pebble", name: "Pebble", solid: true, shader: 3, radius: 0.78, face: { x: 0, y: 0.04, z: 0.55, gap: 0.18, scale: 0.96 } },
  { id: "bloom", name: "Bloom", solid: true, shader: 4, radius: 1.02, face: { x: 0, y: 0.02, z: 0.5, gap: 0.18, scale: 0.82 } },
  { id: "gumdrop", name: "Gumdrop", solid: true, shader: 5, radius: 1.05, face: { x: 0, y: -0.12, z: 0.55, gap: 0.16, scale: 0.8 } },
];


  let frameMs = 0;
  let workMs = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const backOut = (t) => {
    t = clamp(t, 0, 1);
    const c = 1.35;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  };
  function mix(rgb, target, amount) {
    return rgb.map((c, i) => Math.round(c + ((typeof target === "number" ? target : target[i]) - c) * amount));
  }
  function css(rgb, a) {
    return a == null ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967295;
  }
  function parseHex(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    const value = match ? parseInt(match[1], 16) : 0xd7b56f;
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  function luminance(rgb) {
    const l = rgb.map((part) => {
      const c = part / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }
  function tonesOf(hex) {
    const base = parseHex(hex);
    return {
      base,
      light: mix(base, 255, 0.52),
      shade: mix(base, 0, 0.2),
      deep: mix(base, 0, 0.45),
      hot: mix(mix(base, 255, 0.52), 255, 0.55),
      eyes: luminance(base) > 0.179 ? [20, 17, 12] : [251, 248, 241],
    };
  }
  const shapeOf = (id) => SHAPES.find((s) => s.id === id);
  const colorOf = (hex) => COLORS.find((c) => c.hex.toUpperCase() === String(hex).toUpperCase()) || COLORS[0];
  const eyeOf = (id) => EYES.find((e) => e.id === id);
  const stateOf = (id) => STATES.find((s) => s.id === id);

  function rotX(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }
  function rotY(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  }
  function rotZ(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }
  function xform(p, pose) {
    let q = { x: p.x * pose.sx, y: p.y * pose.sy, z: p.z * pose.sz };
    q = rotZ(q, pose.roll);
    q = rotX(q, pose.pitch);
    q = rotY(q, pose.yaw);
    q.y += pose.lift;
    return q;
  }
  function project(p, w, h, focus, zoom) {
    const roY = CAM.y + (focus || 0);
    const dz = CAM.z * (zoom || 1) - p.z;
    const uvx = p.x / dz / CAM.spread;
    const uvy = (p.y - roY) / dz / CAM.spread;
    return { x: w * 0.5 + uvx * h, y: h * 0.5 - uvy * h, unit: h / dz / CAM.spread };
  }

  function showError(err) {
    const box = document.getElementById("error");
    box.style.display = "block";
    box.textContent = String(err && err.stack || err);
    console.error(err);
  }

  function traceSolid(ctx, shape, r) {
    ctx.beginPath();
    if (shape.shader === 0) {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else if (shape.shader === 1) {
      const s = r * 1.62;
      roundRect(ctx, -s / 2, -s / 2, s, s, r * 0.46);
    } else if (shape.shader === 2) {
      ctx.ellipse(0, r * 0.06, r * 0.78, r * 1.18, 0, 0, Math.PI * 2);
    } else if (shape.shader === 3) {
      ctx.ellipse(-r * 0.04, r * 0.06, r * 1.08, r * 0.78, -0.08, 0, Math.PI * 2);
    } else if (shape.shader === 4) {
      ctx.moveTo(-0.871 * r, 0.486 * r);
      ctx.bezierCurveTo(-1.043 * r, 0.413 * r, -1.151 * r, 0.239 * r, -1.139 * r, 0.052 * r);
      ctx.bezierCurveTo(-1.127 * r, -0.134 * r, -0.999 * r, -0.293 * r, -0.818 * r, -0.344 * r);
      ctx.bezierCurveTo(-0.723 * r, -0.371 * r, -0.670 * r, -0.426 * r, -0.616 * r, -0.510 * r);
      ctx.bezierCurveTo(-0.585 * r, -0.560 * r, -0.537 * r, -0.599 * r, -0.482 * r, -0.621 * r);
      ctx.bezierCurveTo(-0.426 * r, -0.643 * r, -0.365 * r, -0.646 * r, -0.307 * r, -0.630 * r);
      ctx.bezierCurveTo(-0.217 * r, -0.606 * r, -0.139 * r, -0.609 * r, -0.063 * r, -0.663 * r);
      ctx.bezierCurveTo(0.034 * r, -0.731 * r, 0.155 * r, -0.756 * r, 0.270 * r, -0.730 * r);
      ctx.bezierCurveTo(0.385 * r, -0.705 * r, 0.485 * r, -0.632 * r, 0.544 * r, -0.530 * r);
      ctx.bezierCurveTo(0.586 * r, -0.457 * r, 0.606 * r, -0.393 * r, 0.682 * r, -0.357 * r);
      ctx.bezierCurveTo(0.692 * r, -0.353 * r, 0.702 * r, -0.347 * r, 0.711 * r, -0.341 * r);
      ctx.bezierCurveTo(0.787 * r, -0.291 * r, 0.848 * r, -0.288 * r, 0.933 * r, -0.256 * r);
      ctx.bezierCurveTo(1.036 * r, -0.218 * r, 1.117 * r, -0.137 * r, 1.156 * r, -0.034 * r);
      ctx.bezierCurveTo(1.194 * r, 0.069 * r, 1.187 * r, 0.183 * r, 1.135 * r, 0.280 * r);
      ctx.bezierCurveTo(1.083 * r, 0.377 * r, 0.991 * r, 0.446 * r, 0.884 * r, 0.471 * r);
      ctx.bezierCurveTo(0.773 * r, 0.496 * r, 0.707 * r, 0.527 * r, 0.604 * r, 0.573 * r);
      ctx.bezierCurveTo(0.562 * r, 0.592 * r, 0.517 * r, 0.601 * r, 0.472 * r, 0.600 * r);
      ctx.bezierCurveTo(0.370 * r, 0.597 * r, 0.298 * r, 0.615 * r, 0.212 * r, 0.670 * r);
      ctx.bezierCurveTo(0.117 * r, 0.730 * r, -0.003 * r, 0.737 * r, -0.104 * r, 0.686 * r);
      ctx.bezierCurveTo(-0.193 * r, 0.641 * r, -0.268 * r, 0.630 * r, -0.366 * r, 0.652 * r);
      ctx.bezierCurveTo(-0.443 * r, 0.669 * r, -0.524 * r, 0.659 * r, -0.595 * r, 0.623 * r);
      ctx.bezierCurveTo(-0.699 * r, 0.570 * r, -0.763 * r, 0.531 * r, -0.871 * r, 0.486 * r);
      ctx.closePath();
    } else {
      ctx.moveTo(0, -r * 0.92);
      ctx.bezierCurveTo(r * 0.42, -r * 0.92, r * 0.98, -r * 0.05, r * 0.98, r * 0.48);
      ctx.quadraticCurveTo(r * 0.98, r * 0.98, 0, r * 0.98);
      ctx.quadraticCurveTo(-r * 0.98, r * 0.98, -r * 0.98, r * 0.48);
      ctx.bezierCurveTo(-r * 0.98, -r * 0.05, -r * 0.42, -r * 0.92, 0, -r * 0.92);
      ctx.closePath();
    }
  }

  function drawSolid(ctx, cx, cy, bodyPx, pose, shape, tones) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pose.roll || 0);
    ctx.scale(pose.sx, pose.sy);
    traceSolid(ctx, shape, bodyPx);
    ctx.clip();
    const hx = bodyPx * (-0.32 - pose.yaw * 1.1);
    const hy = bodyPx * (-0.4 - (pose.pitch - 0.16) * 0.45);
    const g = ctx.createRadialGradient(hx, hy, bodyPx * 0.05, bodyPx * 0.08, bodyPx * 0.12, bodyPx * 1.25);
    g.addColorStop(0, css(tones.light));
    g.addColorStop(0.34, css(tones.base));
    g.addColorStop(0.78, css(mix(tones.base, tones.shade, 0.55)));
    g.addColorStop(1, css(tones.shade));
    ctx.fillStyle = g;
    ctx.fillRect(-bodyPx * 2, -bodyPx * 2, bodyPx * 4, bodyPx * 4);
    const belly = ctx.createLinearGradient(0, -bodyPx * 0.2, 0, bodyPx * 1.15);
    belly.addColorStop(0, "rgba(0,0,0,0)");
    belly.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = belly;
    ctx.fillRect(-bodyPx * 2, -bodyPx * 2, bodyPx * 4, bodyPx * 4);
    if (shape.shader === 4) {
      const lobes = [[-0.70, 0.08, 0.44], [-0.38, -0.36, 0.28], [0.18, -0.32, 0.42], [0.58, -0.14, 0.24], [0.80, 0.10, 0.38]];
      for (const [lx, ly, lr] of lobes) {
        const px = (lx - lr * 0.32) * bodyPx;
        const py = (ly - lr * 0.38) * bodyPx;
        const rad = lr * bodyPx * 1.55;
        const light = ctx.createRadialGradient(px, py, rad * 0.04, px, py, rad);
        light.addColorStop(0, "rgba(255,255,255,0.30)");
        light.addColorStop(0.45, "rgba(255,255,255,0.08)");
        light.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = light;
        ctx.fillRect(-bodyPx * 2, -bodyPx * 2, bodyPx * 4, bodyPx * 4);
      }
      const dusk = ctx.createRadialGradient(bodyPx * 0.55, bodyPx * 0.42, bodyPx * 0.08, bodyPx * 0.15, bodyPx * 0.05, bodyPx * 1.25);
      dusk.addColorStop(0, "rgba(0,0,0,0.18)");
      dusk.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dusk;
      ctx.fillRect(-bodyPx * 2, -bodyPx * 2, bodyPx * 4, bodyPx * 4);
    } else {
      const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, bodyPx * 0.48);
      spec.addColorStop(0, "rgba(255,255,255,0.62)");
      spec.addColorStop(0.45, "rgba(255,255,255,0.16)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fillRect(-bodyPx * 2, -bodyPx * 2, bodyPx * 4, bodyPx * 4);
    }
    if (shape.shader === 2) {
      ctx.strokeStyle = css(tones.shade, 0.4);
      ctx.lineWidth = Math.max(1, bodyPx * 0.045);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -bodyPx * 0.95);
      ctx.quadraticCurveTo(bodyPx * 0.04, -bodyPx * 0.55, 0, -bodyPx * 0.28);
      ctx.stroke();
    }
    if (pose.glow > 0.02) {
      const glow = ctx.createRadialGradient(0, bodyPx * 0.55, 2, 0, bodyPx * 0.45, bodyPx);
      glow.addColorStop(0, `rgba(255,255,255,${0.45 * pose.glow})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-bodyPx * 2, -bodyPx * 2, bodyPx * 4, bodyPx * 4);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function paintSphere(ctx, x, y, r, rgb) {
    if (r < 0.7) return;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.08, x, y, r);
    g.addColorStop(0, css(mix(rgb, [255, 255, 255], 0.72)));
    g.addColorStop(0.42, css(rgb));
    g.addColorStop(1, css(mix(rgb, [0, 0, 0], 0.38)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawEyes(ctx, x, y, gap, r, style, shiftX, shiftY, rgb, alpha) {
    if (alpha < 0.02 || r < 0.4) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const lx = x - gap + shiftX, rx = x + gap + shiftX, ey = y + shiftY;
    if (style === "happy") {
      ctx.strokeStyle = css(rgb);
      ctx.lineWidth = Math.max(1.25, r * 0.5);
      ctx.lineCap = "round";
      for (const px of [lx, rx]) {
        ctx.beginPath();
        ctx.moveTo(px - r * 0.95, ey + r * 0.15);
        ctx.quadraticCurveTo(px, ey - r * 0.95, px + r * 0.95, ey + r * 0.15);
        ctx.stroke();
      }
    } else if (style === "sleepy") {
      const w = r * 2.35, h = Math.max(1.4, r * 0.62);
      ctx.fillStyle = css(rgb);
      for (const px of [lx, rx]) {
        roundRect(ctx, px - w / 2, ey - h / 2, w, h, h / 2);
        ctx.fill();
      }
    } else {
      for (const px of [lx, rx]) {
        ctx.fillStyle = css(rgb);
        ctx.beginPath();
        ctx.arc(px, ey, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.beginPath();
        ctx.arc(px - r * 0.32, ey - r * 0.34, Math.max(0.6, r * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawFrown(ctx, x, y, w, rgb) {
    ctx.save();
    ctx.strokeStyle = css(rgb);
    ctx.lineWidth = Math.max(1.2, w * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - w, y + w * 0.35);
    ctx.quadraticCurveTo(x, y - w * 0.45, x + w, y + w * 0.35);
    ctx.stroke();
    ctx.restore();
  }
  function drawHand(ctx, x, y, s, angle, rgb) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = css(rgb);
    ctx.beginPath();
    ctx.arc(0, s * 0.05, s * 0.62, 0, Math.PI * 2);
    ctx.arc(-s * 0.58, -s * 0.28, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, -s * 0.2, s * 0.28, s * 0.4, s * 0.55, s * 0.16);
    ctx.fill();
    ctx.restore();
  }
  function drawLaptop(ctx, cx, baseY, bodyPx, open, present, peek, tones) {
    if (present < 0.02) return;
    const small = bodyPx < 34;
    const w = bodyPx * (peek ? 0.78 : 1.05);
    const lidH = Math.max(small ? 5 : 8, bodyPx * (peek ? 0.42 : 0.46) * Math.max(open, 0.08));
    const baseH = Math.max(small ? 2.5 : 4, bodyPx * 0.11);
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(present, present);
    ctx.fillStyle = css(tones.shade);
    roundRect(ctx, -w * 0.62, -baseH * 0.2, w * 1.24, baseH, baseH * 0.45);
    ctx.fill();
    const top = -baseH * 0.2 - lidH;
    const bezel = small ? 1.25 : Math.max(3, bodyPx * 0.06);
    ctx.fillStyle = css(tones.deep);
    roundRect(ctx, -w / 2, top, w, lidH, small ? 2 : 5);
    ctx.fill();
    if (lidH > bezel * 2.2) {
      const pulse = 0.75 + 0.25 * Math.sin(frame.time * 3.2);
      ctx.fillStyle = css(mix(tones.hot, [255, 255, 255], 0.35), 0.55 + pulse * 0.4);
      roundRect(ctx, -w / 2 + bezel, top + bezel, w - bezel * 2, lidH - bezel * 1.6, small ? 1.5 : 3);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawFlat(ctx, shape, cx, cy, bodyPx, pose, tones) {
    const path = new Path2D(FLAT[shape.id]);
    const s = (bodyPx * 2.05) / 92;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pose.roll);
    ctx.scale(s * pose.sx, s * pose.sy);
    ctx.translate(-50, -50);
    const g = ctx.createRadialGradient(32, 26, 6, 50, 52, 62);
    g.addColorStop(0, css(tones.light));
    g.addColorStop(0.42, css(tones.base));
    g.addColorStop(1, css(tones.shade));
    ctx.lineJoin = "round";
    ctx.lineWidth = shape.id === "spark" ? 7 : 12;
    ctx.strokeStyle = css(tones.deep);
    ctx.stroke(path);
    ctx.fillStyle = g;
    ctx.fill(path);
    if (pose.glow > 0.02) {
      ctx.clip(path);
      const glow = ctx.createRadialGradient(50, 70, 4, 50, 62, 48);
      glow.addColorStop(0, `rgba(255,255,255,${0.4 * pose.glow})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 100, 100);
    }
    ctx.restore();
  }

  function orbPoint(mode, index, time, radius) {
    const base = index * 2.0944;
    if (mode === "t3") {
      const swing = Math.sin(time * 1.15) * 0.95;
      const a = swing + (index - 1) * 0.42;
      return { x: Math.sin(a) * radius * 0.95, y: 0.55 + Math.cos(a) * 0.28, z: 0.35 + Math.cos(a) * 0.15 };
    }
    if (mode === "t4") {
      const a = time * 1.15 + base;
      return { x: radius * 0.95, y: Math.sin(a) * radius * 0.72, z: Math.cos(a) * 0.48 };
    }
    const speed = mode === "t2" ? 0.55 : 1.05;
    const rad = mode === "t2" ? radius + 0.34 : radius;
    const a = time * speed + base;
    const x = Math.cos(a) * rad * (mode === "t2" ? 1 : 0.9);
    const z = Math.sin(a) * (mode === "t5" ? 0.38 : 0.55);
    const y = (mode === "t5" ? 0.22 : 0.34) + (mode === "t5" ? Math.sin(a) * 0.42 : Math.max(0, -Math.sin(a)) * 0.48);
    return { x, y, z };
  }

  function workPose(id, time) {
    const out = { present: 0, open: 0, lift: 0, pitch: 0, glow: 0, bob: 0, squash: 0, peek: id === "w3" };
    if (id === "w4") {
      const t = time % 5.2;
      const inn = t < 0.35 ? smoothstep(t / 0.35) : 1;
      const lap = t < 0.2 ? 0 : t < 0.55 ? backOut((t - 0.2) / 0.35) : t < 4.35 ? 1 : t < 4.7 ? 1 - smoothstep((t - 4.35) / 0.35) : 0;
      const back = t < 4.5 ? 1 : t < 4.95 ? 1 - smoothstep((t - 4.5) / 0.45) : 0;
      const k = inn * back;
      out.present = clamp(lap, 0, 1) * (back > 0 ? 1 : 0);
      out.open = out.present;
      out.lift = k * 0.04;
      out.pitch = k * 0.24;
      out.squash = k;
      out.glow = (t > 0.45 && t < 4.4) ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3.4)) : out.present * 0.4;
      out.bob = (t > 0.6 && t < 4.3) ? Math.sin(time * 6.2) * 0.012 : 0;
      return out;
    }
    const dur = id === "w2" ? 4.2 : 3.8;
    const u = (time % dur) / dur;
    let k;
    if (u < 0.16) k = id === "w1" ? backOut(u / 0.16) : smoothstep(u / 0.16);
    else if (u < 0.78) k = 1;
    else k = 1 - smoothstep((u - 0.78) / 0.22);
    k = clamp(k, 0, 1);
    if (id === "w2") {
      out.present = k;
      out.open = clamp(k * 1.15, 0, 1);
      out.lift = k * 0.03;
      out.pitch = k * 0.18;
    } else if (id === "w3") {
      out.present = k;
      out.open = clamp(0.35 + k * 0.65, 0, 1);
      out.lift = k * 0.02;
      out.pitch = k * 0.3;
      out.glow = k;
    } else {
      out.present = clamp(k * 1.05, 0, 1);
      out.open = k;
      out.lift = k * 0.04;
      out.pitch = k * 0.24;
    }
    out.squash = k;
    if (!out.glow) out.glow = (u > 0.16 && u < 0.78) ? 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(time * 3.2)) : k * 0.35;
    out.bob = (u > 0.2 && u < 0.78) ? Math.sin(time * 6) * 0.01 : 0;
    return out;
  }
  function pressAmount(actor) {
    if (actor.loopPress) {
      const u = (frame.time + actor.phase) % 2.5;
      return u < 0.85 ? u / 0.85 : -1;
    }
    if (actor.pressUntil > frame.time) return clamp((frame.time - actor.pressStart) / 0.78, 0, 1);
    return -1;
  }

  function computePose(actor, look) {
    const shape = shapeOf(look.shape);
    const amp = 0.22 + frame.intensity * 0.78;
    const person = shape.id === "pebble" ? 0.7 : shape.id === "spark" ? 1.15 : 1;
    const breathe = Math.sin(frame.time * 1.5 * person + actor.phase) * 0.028 * amp;
    const pose = {
      yaw: 0, pitch: shape.solid ? 0.16 : 0, roll: 0,
      sx: 1 - breathe * 0.45, sy: 1 + breathe, sz: 1 - breathe * 0.35,
      lift: (shape.solid ? breathe * 0.4 : 0),
      focus: 0,
      zoom: 1,
      eye: look.eyes,
      shiftX: 0, shiftY: 0,
      glow: 0, frown: 0, hand: 0, wave: 0, zs: 0,
      orbs: [],
      laptop: null,
    };
    if (actor.lookX) {
      pose.yaw += clamp(actor.lookX.x, -1, 1) * 0.18 * amp;
      pose.pitch += clamp(actor.lookY.x, -1, 1) * 0.12 * amp;
      pose.shiftX += actor.lookX.x * 0.35;
      pose.shiftY += actor.lookY.x * 0.28;
    }
    if (!shape.solid) pose.pitch = 0;
    const glance = ((frame.time + actor.phase) % 6.4);
    if (look.state === "idle" && glance < 0.9) {
      const dir = Math.sin(actor.phase * 4) >= 0 ? 1 : -1;
      const g = Math.sin((glance / 0.9) * Math.PI) * amp;
      pose.yaw += dir * 0.16 * g * (shape.solid ? 1 : 0);
      pose.roll += dir * 0.05 * g;
      pose.shiftX += dir * 0.45 * g;
    }
    const blinkAt = (frame.time + actor.phase * 1.7) % (look.state === "sleeping" ? 9 : 4.2);
    if (blinkAt > 3.85 && look.state === "idle" && look.eyes === "dot") pose.eye = "sleepy";

    if (look.state === "thinking") {
      const radius = shape.radius ? shape.radius + 0.42 : 1.15;
      for (let i = 0; i < 3; i++) pose.orbs.push(orbPoint(look.think, i, frame.time + actor.phase, radius));
      pose.zoom = 1.16;
      if (look.think === "t6") {
        const a = frame.time * 0.85 + actor.phase;
        pose.shiftX += Math.sin(a) * 0.7;
        pose.shiftY += Math.cos(a) * 0.28;
      }
      pose.pitch += shape.solid ? -0.06 : 0;
      pose.shiftY -= 0.2;
    } else if (look.state === "working") {
      const work = workPose(look.work, frame.time + actor.phase * 0.2);
      pose.lift += work.lift + work.bob;
      if (shape.solid) pose.pitch += work.pitch;
      pose.sy *= 1 - 0.08 * work.squash;
      pose.sx *= 1 + 0.05 * work.squash;
      pose.sz *= 1 + 0.04 * work.squash;
      pose.shiftY += 0.22 * work.squash;
      pose.glow = work.glow * (look.work === "w3" ? 1 : 0.7);
      pose.focus = -0.02 * work.present;
      pose.zoom = 1 + work.present * 0.46;
      pose.laptop = work;
    } else if (look.state === "error") {
      pose.eye = "dot";
      pose.shiftY -= 0.35;
      pose.shiftX *= 0.4;
      pose.frown = 1;
      pose.hand = 1;
      pose.wave = Math.sin(frame.time * 2.6 + actor.phase) * 0.35;
      pose.yaw += Math.sin(frame.time * 1.4) * 0.04 * amp;
    } else if (look.state === "sleeping") {
      pose.eye = "sleepy";
      pose.yaw *= 0.15;
      pose.shiftX *= 0.2;
      pose.shiftY *= 0.2;
      pose.roll += shape.solid ? -0.08 : -0.05;
      pose.zs = 1;
      pose.sy += Math.sin(frame.time * 0.8 + actor.phase) * 0.02 * amp;
    }

    const press = pressAmount(actor);
    const which = actor.lockPress || frame.pressWhich;
    if (press >= 0 && look.state !== "sleeping") {
      const env = Math.sin(clamp(press, 0, 1) * Math.PI);
      if (which === "c1") {
        pose.sy *= 1 - 0.14 * env;
        pose.sx *= 1 + 0.1 * env;
        pose.sz *= 1 + 0.08 * env;
        pose.lift += env * 0.05;
      } else {
        const nod = press < 0.42 ? -Math.sin(press / 0.42 * Math.PI) : Math.sin((press - 0.42) / 0.58 * Math.PI);
        if (shape.solid) pose.pitch += nod * 0.22;
        else pose.roll += nod * 0.08;
        pose.lift += Math.sin(press * Math.PI) * 0.07;
      }
      if (look.state !== "error") pose.eye = "happy";
    }
    pose.yaw = clamp(pose.yaw, -0.24, 0.24);
    if (shape.solid) pose.pitch = clamp(pose.pitch, -0.12, 0.48);
    pose.roll = clamp(pose.roll, -0.16, 0.16);
    return pose;
  }

const SHAPE_ALIAS = { puff: "bloom", capsule: "pebble" };
const EYE_ALIAS = { line: "sleepy", wide: "dot", star: "dot", soft: "dot" };
const STATE_ALIAS = { listening: "idle", success: "idle" };

/** Old saved looks become the set the lab ships. Unknown values fall back rather than throw. */
export function normalizeFace(input = {}) {
  const rawShape = String(input.shape || "orb").toLowerCase();
  const shape = SHAPE_ALIAS[rawShape] || (FACE_SHAPES.includes(rawShape) ? rawShape : "orb");
  const rawEyes = String(input.eyes || "dot").toLowerCase();
  const eyes = EYE_ALIAS[rawEyes] || (FACE_EYES.includes(rawEyes) ? rawEyes : "dot");
  const rawState = String(input.state || "idle").toLowerCase();
  const state = STATE_ALIAS[rawState] || (FACE_STATES.includes(rawState) ? rawState : "idle");
  const hex = String(input.color || "").trim();
  const color = /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "#D7B56F";
  return { shape, eyes, state, color, think: input.think || DEFAULT_THINK, work: input.work || DEFAULT_WORK };
}

/** Which lab state a live node is in. Thinking uses T1 Orbit; working uses W1 Unfold. */
export function faceFromStatus({ thinking = false, resting = false, attention = false, workZone } = {}) {
  if (attention) return { state: "error", think: DEFAULT_THINK, work: DEFAULT_WORK };
  if (resting && !thinking) return { state: "sleeping", think: DEFAULT_THINK, work: DEFAULT_WORK };
  if (thinking && workZone === "chat") return { state: "working", think: DEFAULT_THINK, work: DEFAULT_WORK };
  if (thinking) return { state: "thinking", think: DEFAULT_THINK, work: DEFAULT_WORK };
  return { state: "idle", think: DEFAULT_THINK, work: DEFAULT_WORK };
}

/** Paint one node into a context already scaled to CSS pixels. */
export function paintNode(ctx, w, h, spec = {}) {
  if (!(w > 1) || !(h > 1)) return;
  const look = normalizeFace(spec);
  if (spec.state) look.state = normalizeFace({ state: spec.state }).state;
  if (spec.think) look.think = spec.think;
  if (spec.work) look.work = spec.work;
  frame.time = spec.time ?? 0;
  frame.intensity = spec.reduced ? Math.min(0.15, spec.intensity ?? 0.15) : (spec.intensity ?? 0.7);
  frame.pressWhich = spec.press || DEFAULT_PRESS;
  const actor = {
    phase: spec.phase ?? 0,
    lookX: spec.lookX == null ? null : { x: spec.lookX },
    lookY: spec.lookY == null ? null : { x: spec.lookY },
    ox: spec.ox || 0,
    oy: spec.oy || 0,
    loopPress: Boolean(spec.loopPress),
    pressStart: spec.pressStart ?? -10,
    pressUntil: spec.pressUntil ?? -10,
    lockPress: spec.press || null,
    role: spec.stage ? "hero" : "cell",
  };
  const shape = shapeOf(look.shape);
  const tones = tonesOf(look.color);
  const pose = computePose(actor, look);
  ctx.clearRect(0, 0, w, h);
  const focus = pose.focus || 0;
  const zoom = pose.zoom || 1;
  const center = project(xform({ x: 0, y: 0, z: 0 }, pose), w, h, focus, zoom);
  const unit = h / (CAM.z * zoom) / CAM.spread;
  const bodyPx = (shape.radius || 0.78) * unit;
  if (actor.role === "hero") {
    ctx.fillStyle = "rgba(255,255,255,.035)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.78, bodyPx * 1.35, bodyPx * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const ground = project({ x: 0, y: -bodyPx / unit, z: 0 }, w, h, 0, zoom);
  ctx.save();
  ctx.translate(w / 2, ground.y + bodyPx * 0.08);
  ctx.scale(bodyPx * (0.92 + Math.abs(pose.yaw) * 0.2) * pose.sx, bodyPx * 0.24);
  const sg = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 1);
  const sh = clamp(0.38 - pose.lift * 0.45, 0.12, 0.42);
  sg.addColorStop(0, `rgba(0,0,0,${sh})`);
  sg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const placed = pose.orbs.map((o) => ({ o, p: project(o, w, h, focus, zoom) }));
  ctx.save();
  ctx.translate(actor.ox || 0, actor.oy || 0);
  for (const item of placed) if (item.o.z < 0.02) paintSphere(ctx, item.p.x, item.p.y, Math.max(3, bodyPx * 0.2), tones.light);
  if (shape.solid) drawSolid(ctx, center.x, center.y, bodyPx, pose, shape, tones);
  else drawFlat(ctx, shape, center.x, center.y, bodyPx, pose, tones);
  for (const item of placed) if (item.o.z >= 0.02) paintSphere(ctx, item.p.x, item.p.y, Math.max(3, bodyPx * 0.2), tones.light);
  let eyeX, eyeY, gap, eyeR;
  if (shape.solid) {
    const anchor = xform({ x: shape.face.x, y: shape.face.y, z: shape.face.z }, pose);
    const at = project(anchor, w, h, focus, zoom);
    eyeX = at.x; eyeY = at.y;
    gap = shape.face.gap * unit;
    eyeR = Math.min(w, h) * 0.052 * shape.face.scale;
  } else {
    const s = (bodyPx * 2.05) / 92;
    const c = Math.cos(pose.roll), sn = Math.sin(pose.roll);
    const lx = (shape.face.x - 50) * s * pose.sx;
    const ly = (shape.face.y - 50) * s * pose.sy;
    eyeX = center.x + c * lx - sn * ly;
    eyeY = center.y + sn * lx + c * ly;
    gap = shape.face.gap * s;
    eyeR = 5.5 * shape.face.scale * s;
  }
  if (pose.laptop) {
    const lap = pose.laptop;
    drawLaptop(ctx, center.x, center.y + bodyPx * (lap.peek ? 1.05 : 1.22), bodyPx, lap.open, lap.present, lap.peek, tones);
  }
  if (pose.hand > 0) drawHand(ctx, eyeX + gap + eyeR * 3.4, eyeY - eyeR * 3.1, Math.max(5.5, eyeR * 1.7), -0.6 + pose.wave, tones.base);
  drawEyes(ctx, eyeX, eyeY, gap, eyeR, pose.eye, pose.shiftX * eyeR, pose.shiftY * eyeR, tones.eyes, 1);
  if (pose.frown) drawFrown(ctx, eyeX, eyeY + eyeR * 2.15, eyeR * 1.15, tones.eyes);
  if (pose.zs) {
    ctx.fillStyle = css(tones.light);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 2; i++) {
      const u = (frame.time * 0.22 + actor.phase + i * 0.5) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9;
      ctx.font = `700 ${Math.max(8, bodyPx * 0.28)}px ui-sans-serif, system-ui`;
      ctx.fillText("z", eyeX + gap + eyeR * 2.1, eyeY - eyeR * (0.4 + u * 3.2));
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export const FACE_COLORS = COLORS.map((color) => color.hex);
