# Ambient backgrounds

Drop-in animated backgrounds. Self-contained: this folder has no import from
anywhere else in the app, so it lifts straight into another project.

```tsx
import { AmbientProvider, useAmbient } from "@/components/ambient";

<AmbientProvider>{children}</AmbientProvider>   // renders the canvas + stores the choice
const { ambient, setAmbient } = useAmbient();   // switch it
```

The chosen name is written to `data-ambient` on `<html>`, which is what lets a
background also be a **theme** — `night` swaps the colour tokens in
`globals.css` and every component follows without knowing this folder exists.

## What's here

| | Whose | What it is |
|---|---|---|
| `none` | — | The page on its own. Fastest; never argues with a photograph. |
| `night` | owner | Stars drifting. Every 5s the constellation forms, holds, lets go. |
| `autumn` | owner | Low sun, tumbling leaves, branches that reach between them. |
| `dust` | Claude Code | Motes in a shaft of light — the air over a bench after the machine ran. |
| `bench` | Claude Code | The drawing grid a piece gets measured on, breathing. No particles. |

## Adding one

Write a `Painter` and add it to `AMBIENTS`. Nothing else. The loop, the sizing,
the pausing and the 5-second pulse are shared.

```ts
const mine: Painter = {
  density: 40,        // motes per million px² — this is a background, keep it low
  minSize: 1, maxSize: 3,
  speed: 5,           // px/sec. Slow. Nothing here should catch the eye.
  linkDistance: 120,  // 0 to skip the constellation entirely
  background(frame) { /* optional wash */ },
  mote(frame, mote) { /* one particle */ },
  link(frame, a, b, nearness) { /* only called while frame.pulse > 0 */ },
};
```

`frame.pulse` is 0..1 and eased: it rises over 1.4s, holds 0.7s, falls over
1.6s, then rests until the next 5-second mark.

## Why it is safe on a phone

99% of visitors are on one, and this is decoration:

- Stops completely when the tab is hidden or the canvas scrolls off screen.
- Never runs at all under `prefers-reduced-motion` — one still frame instead.
- Particle count scales with viewport area, hard-capped at 90.
- Device pixel ratio capped at 2; a 3× display would otherwise cost 9× the fill.
- Link distances compared squared, so there is no square root in the inner loop.
- Motes wrap rather than bounce — a bounce reads as an edge, and there is none.

## Two things worth knowing before choosing one

**A background competes with the product photo.** On a shop the photograph is
the entire argument for buying. `dust` and `bench` were built deliberately
quieter than they wanted to be for that reason.

**`night` is a theme, not a picture.** It inverts the text tokens. Without that
it would be charcoal text on a near-black sky.
