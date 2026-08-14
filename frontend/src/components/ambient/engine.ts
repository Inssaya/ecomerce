/**
 * One canvas loop, many looks.
 *
 * Every ambient background shares this engine and differs only in a `Painter`.
 * Writing a second canvas loop for the second theme is how you end up with
 * four subtly different ones that drift apart — so the loop, the sizing, the
 * pausing and the constellation rhythm are written once here.
 *
 * The rules this file exists to enforce, because 99% of visitors are on a
 * phone and this is decoration:
 *
 *  - It stops completely when the tab is hidden or the canvas is off-screen.
 *  - It never runs at all for someone who asked for reduced motion; they get
 *    one still frame.
 *  - Particle count scales with viewport area and is capped hard on small
 *    screens.
 *  - Device pixel ratio is capped at 2. A 3x phone display would otherwise
 *    make us paint nine times the pixels for a background nobody looks at.
 */

export interface Mote {
  x: number;
  y: number;
  /** Velocity, in pixels per second. */
  vx: number;
  vy: number;
  size: number;
  /** 0..1, for painters that vary opacity or rotation per mote. */
  seed: number;
  angle: number;
  spin: number;
}

export interface Frame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  motes: Mote[];
  /** Seconds since the field started. */
  time: number;
  /**
   * 0..1 — how strongly the constellation lines are drawn right now.
   * Rises slowly, holds, fades out, then rests until the next pulse.
   */
  pulse: number;
}

export interface Painter {
  /** Motes per million square pixels. Keep it low; this is a background. */
  density: number;
  minSize: number;
  maxSize: number;
  /** Pixels per second. Slow: nothing here should catch the eye. */
  speed: number;
  /** How far apart two motes can be and still be joined by a line. */
  linkDistance: number;
  background?: (frame: Frame) => void;
  mote: (frame: Frame, mote: Mote) => void;
  link?: (frame: Frame, a: Mote, b: Mote, nearness: number) => void;
}

const MAX_DPR = 2;
const MAX_MOTES = 90;
/** The rhythm: rest, rise, hold, fall. Seconds. */
const PULSE_PERIOD = 5;
const PULSE_RISE = 1.4;
const PULSE_HOLD = 0.7;
const PULSE_FALL = 1.6;

function pulseAt(time: number): number {
  const into = time % PULSE_PERIOD;
  if (into < PULSE_RISE) return into / PULSE_RISE;
  if (into < PULSE_RISE + PULSE_HOLD) return 1;
  const falling = into - PULSE_RISE - PULSE_HOLD;
  if (falling < PULSE_FALL) return 1 - falling / PULSE_FALL;
  return 0;
}

/** Ease so the lines arrive and leave softly instead of switching on. */
function ease(value: number): number {
  return value * value * (3 - 2 * value);
}

function seedMotes(painter: Painter, width: number, height: number): Mote[] {
  const area = (width * height) / 1_000_000;
  const count = Math.min(MAX_MOTES, Math.max(8, Math.round(painter.density * area)));
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * painter.speed * (0.4 + Math.random() * 0.6),
      vy: Math.sin(angle) * painter.speed * (0.4 + Math.random() * 0.6),
      size: painter.minSize + Math.random() * (painter.maxSize - painter.minSize),
      seed: Math.random(),
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.6,
    };
  });
}

/**
 * Start a field on a canvas. Returns a stop function; call it on unmount.
 */
export function startField(canvas: HTMLCanvasElement, painter: Painter): () => void {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => undefined;

  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let motes: Mote[] = [];
  let raf = 0;
  let running = false;
  let startedAt = 0;
  let lastAt = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context!.setTransform(dpr, 0, 0, dpr, 0, 0);
    motes = seedMotes(painter, width, height);
  }

  function draw(time: number, step: number) {
    const ctx = context!;
    ctx.clearRect(0, 0, width, height);
    const frame: Frame = { ctx, width, height, motes, time, pulse: ease(pulseAt(time)) };

    painter.background?.(frame);

    if (step > 0) {
      for (const mote of motes) {
        mote.x += mote.vx * step;
        mote.y += mote.vy * step;
        mote.angle += mote.spin * step;
        // Wrap rather than bounce: a bounce reads as an edge, and there is no
        // edge — the field is meant to feel like it continues past the screen.
        if (mote.x < -20) mote.x = width + 20;
        if (mote.x > width + 20) mote.x = -20;
        if (mote.y < -20) mote.y = height + 20;
        if (mote.y > height + 20) mote.y = -20;
      }
    }

    if (painter.link && frame.pulse > 0.01) {
      const reach = painter.linkDistance;
      for (let i = 0; i < motes.length; i += 1) {
        for (let j = i + 1; j < motes.length; j += 1) {
          const dx = motes[i].x - motes[j].x;
          const dy = motes[i].y - motes[j].y;
          // Compare squared distances: no square root in the inner loop.
          const squared = dx * dx + dy * dy;
          if (squared > reach * reach) continue;
          painter.link(frame, motes[i], motes[j], 1 - Math.sqrt(squared) / reach);
        }
      }
    }

    for (const mote of motes) painter.mote(frame, mote);
  }

  function tick(now: number) {
    if (!running) return;
    if (!startedAt) startedAt = now;
    // Clamp the step so a backgrounded tab does not teleport every mote when
    // it wakes up.
    const step = Math.min((now - (lastAt || now)) / 1000, 0.05);
    lastAt = now;
    draw((now - startedAt) / 1000, step);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    lastAt = 0;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  resize();
  if (reduced) {
    // One still frame, mid-pulse, so the shape of the idea is still visible to
    // someone who does not want it moving.
    draw(PULSE_RISE, 0);
  } else {
    start();
  }

  const onResize = () => {
    resize();
    if (reduced) draw(PULSE_RISE, 0);
  };
  const onVisibility = () => (document.hidden ? stop() : start());

  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);

  // Scrolled past means not painted. On a long page this is most of the time.
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()))
      : null;
  observer?.observe(canvas);

  return () => {
    stop();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    observer?.disconnect();
  };
}
