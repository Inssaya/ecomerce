/**
 * The looks. Each is a handful of numbers and two draw calls.
 *
 * All of them sit *behind* the existing cream page rather than replacing it,
 * and all of them are deliberately quieter than they want to be. This is a
 * shop: the thing that must be looked at is the photograph of the piece, and a
 * background that competes with it is a background that costs a sale.
 */
import type { Painter } from "./engine";

export type AmbientName = "none" | "night" | "autumn" | "dust" | "bench";

export interface AmbientOption {
  name: AmbientName;
  /** Whose idea it was — this gallery exists to be judged. */
  author: "owner" | "claude-code" | "claude-design";
  label: { en: string; ar: string };
  note: { en: string; ar: string };
  /** Page tint under the canvas, when the look needs one. */
  surface?: string;
  painter?: Painter;
}

// ── The owner's two ───────────────────────────────────────────────────────────

/** Stars, and every five seconds the constellation finds itself. */
const night: Painter = {
  density: 46,
  minSize: 0.7,
  maxSize: 2.1,
  speed: 5,
  linkDistance: 130,
  background({ ctx, width, height }) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#12151f");
    sky.addColorStop(1, "#1b1d26");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  },
  mote({ ctx, time }, mote) {
    // Each star breathes on its own clock, so the sky never pulses as one.
    const twinkle = 0.55 + 0.45 * Math.sin(time * 0.9 + mote.seed * 12);
    ctx.beginPath();
    ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 250, 240, ${(0.35 + mote.seed * 0.5) * twinkle})`;
    ctx.fill();
  },
  link({ ctx, pulse }, a, b, nearness) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(226, 214, 195, ${0.24 * nearness * pulse})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  },
};

/** Sun, leaves, and branches that reach between them and let go. */
const autumn: Painter = {
  density: 26,
  minSize: 4,
  maxSize: 9,
  speed: 9,
  linkDistance: 150,
  background({ ctx, width, height, time }) {
    ctx.fillStyle = "#FBF4E8";
    ctx.fillRect(0, 0, width, height);
    // A low sun that drifts a little, so the light is never quite static.
    const x = width * 0.78 + Math.sin(time * 0.05) * width * 0.02;
    const y = height * 0.16;
    const sun = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.55);
    sun.addColorStop(0, "rgba(243, 196, 116, 0.55)");
    sun.addColorStop(0.35, "rgba(238, 205, 155, 0.18)");
    sun.addColorStop(1, "rgba(238, 205, 155, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);
  },
  mote({ ctx, time }, mote) {
    // A leaf is a rotated teardrop, tumbling as it falls.
    const tumble = mote.angle + Math.sin(time * 0.7 + mote.seed * 8) * 0.5;
    const greens = ["#7C8F5A", "#A8A65C", "#C08A4A", "#96A36B"];
    ctx.save();
    ctx.translate(mote.x, mote.y);
    ctx.rotate(tumble);
    ctx.beginPath();
    ctx.ellipse(0, 0, mote.size, mote.size * 0.48, 0, 0, Math.PI * 2);
    ctx.fillStyle = greens[Math.floor(mote.seed * greens.length)];
    ctx.globalAlpha = 0.5 + mote.seed * 0.3;
    ctx.fill();
    ctx.restore();
  },
  link({ ctx, pulse }, a, b, nearness) {
    // Branches, not wires: a slight curve between the two leaves.
    const midX = (a.x + b.x) / 2 + (a.y - b.y) * 0.08;
    const midY = (a.y + b.y) / 2 + (b.x - a.x) * 0.08;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
    ctx.strokeStyle = `rgba(124, 96, 62, ${0.2 * nearness * pulse})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  },
};

// ── Mine ──────────────────────────────────────────────────────────────────────

/**
 * Dust in a shaft of light.
 *
 * Grounded in the subject rather than the season: this is what the air above a
 * bench actually looks like when a machine has been running. It is the
 * quietest of the four on purpose — it reads as atmosphere, not as an effect,
 * and it never once pulls the eye off a photograph.
 */
const dust: Painter = {
  density: 40,
  minSize: 0.6,
  maxSize: 2.2,
  speed: 4,
  linkDistance: 0,
  background({ ctx, width, height, time }) {
    ctx.fillStyle = "#FAF6F0";
    ctx.fillRect(0, 0, width, height);
    // One slow diagonal of light, as if from a high window.
    const drift = Math.sin(time * 0.04) * width * 0.05;
    const shaft = ctx.createLinearGradient(width * 0.15 + drift, 0, width * 0.85 + drift, height);
    shaft.addColorStop(0, "rgba(255, 244, 224, 0)");
    shaft.addColorStop(0.45, "rgba(255, 238, 205, 0.5)");
    shaft.addColorStop(1, "rgba(255, 244, 224, 0)");
    ctx.fillStyle = shaft;
    ctx.fillRect(0, 0, width, height);
  },
  mote({ ctx, time }, mote) {
    const shimmer = 0.4 + 0.6 * Math.sin(time * 1.4 + mote.seed * 20);
    ctx.beginPath();
    ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(150, 118, 82, ${0.22 * shimmer})`;
    ctx.fill();
  },
};

/**
 * The bench.
 *
 * A drawing grid with tick marks, breathing very slightly — the paper a piece
 * gets measured out on before it is made. No particles at all, which makes it
 * the cheapest of the four and the only one that costs a phone essentially
 * nothing.
 */
const bench: Painter = {
  density: 0,
  minSize: 0,
  maxSize: 0,
  speed: 0,
  linkDistance: 0,
  background({ ctx, width, height, time }) {
    ctx.fillStyle = "#FAF6F0";
    ctx.fillRect(0, 0, width, height);

    const breath = 1 + Math.sin(time * 0.25) * 0.02;
    const step = 34 * breath;
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += step) {
      const major = Math.round(x / step) % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.strokeStyle = major ? "rgba(180, 120, 90, 0.10)" : "rgba(46, 42, 38, 0.045)";
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      const major = Math.round(y / step) % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.strokeStyle = major ? "rgba(180, 120, 90, 0.10)" : "rgba(46, 42, 38, 0.045)";
      ctx.stroke();
    }
  },
  mote() {
    // Nothing floats on a bench.
  },
};

export const AMBIENTS: AmbientOption[] = [
  {
    name: "none",
    author: "claude-code",
    label: { en: "Nothing", ar: "بلا خلفية" },
    note: {
      en: "The warm page on its own. Fastest, and it never argues with a photograph.",
      ar: "الصفحة الدافئة وحدها. الأسرع، ولا تنازع الصورة أبداً.",
    },
  },
  {
    name: "night",
    author: "owner",
    label: { en: "Night sky", ar: "سماء الليل" },
    note: {
      en: "Stars drifting. Every five seconds the constellation finds itself, then lets go.",
      ar: "نجوم تنساب. كل خمس ثوانٍ يتشكّل البرج ثم ينحلّ.",
    },
    surface: "#151824",
    painter: night,
  },
  {
    name: "autumn",
    author: "owner",
    label: { en: "Sun and leaves", ar: "شمس وأوراق" },
    note: {
      en: "A low sun and leaves tumbling. Branches reach between them and let go.",
      ar: "شمس منخفضة وأوراق تتقلّب. أغصان تمتدّ بينها ثم تتلاشى.",
    },
    surface: "#FBF4E8",
    painter: autumn,
  },
  {
    name: "dust",
    author: "claude-code",
    label: { en: "Dust in the light", ar: "غبار في الضوء" },
    note: {
      en: "The air above a bench after the machine has run. Atmosphere, not an effect.",
      ar: "الهواء فوق طاولة العمل بعد أن دارت الآلة. أجواء، لا حيلة بصرية.",
    },
    surface: "#FAF6F0",
    painter: dust,
  },
  {
    name: "bench",
    author: "claude-code",
    label: { en: "Drawing paper", ar: "ورق الرسم" },
    note: {
      en: "The grid a piece gets measured on, breathing. No particles — costs a phone nothing.",
      ar: "الشبكة التي تُقاس عليها القطعة، تتنفّس. بلا جزيئات — لا تكلّف الهاتف شيئاً.",
    },
    surface: "#FAF6F0",
    painter: bench,
  },
];

export function ambientByName(name: string): AmbientOption {
  return AMBIENTS.find((option) => option.name === name) ?? AMBIENTS[0];
}
