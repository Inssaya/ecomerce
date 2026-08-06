"use client";

import { useEffect, useRef } from "react";

import { startField } from "./engine";
import { ambientByName, type AmbientName } from "./painters";

/**
 * An ambient background, behind everything.
 *
 * `fixed` and `-z-10`, so it sits under the page rather than replacing it —
 * the warm cream layout stays exactly as it is and this goes beneath. Marked
 * `aria-hidden` and `pointer-events-none`: it is decoration, it must never be
 * announced to a screen reader and must never intercept a tap.
 */
export function Ambient({ name }: { name: AmbientName }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const option = ambientByName(name);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !option.painter) return;
    return startField(canvas, option.painter);
  }, [option]);

  if (!option.painter) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: option.surface }}
    >
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
