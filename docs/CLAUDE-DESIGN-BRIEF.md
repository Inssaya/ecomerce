# Brief for Claude Design

Paste the block below into [claude.ai/design](https://claude.ai/design). Link
this repository first if it offers to — it reads React components and will pull
the real tokens instead of inventing new ones.

Everything it produces is a **proposal**. Nothing ships until it is reviewed
against the rules in `BRAND.md`, and the two hard ones are worth stating up
front because a design tool will not know them: **no stock photography, ever**,
and **no invented scarcity** — no countdown, no "only 3 left!" unless three
physically exist.

---

## The prompt

```
You are designing for MoStyle, a one-person workshop in Morocco. Read the
codebase if you can: the design tokens, the fonts and the components are
already built and I want you to work inside them, not replace them.

WHO WE ARE
We are a workshop, not a shop. We own the machines and make our pieces one at a
time — 3D printed, machined, finished by hand. Our position is "Made, not
resold" / "نصنع، لا نعيد البيع". Almost everything sold online in Morocco
arrived in a shipping container and was photographed by someone who never
touched it. The photo on our page is the actual object you will receive,
because there is only one of it and we made it.

Two offers, and they are genuinely different things:
- The Shelf — pieces already made. Finite: we made four, there are four.
- The Workshop — you describe it, we make it. No stock, but a real date.

WHO IS LOOKING
99% are on a phone, in Morocco, on mobile data. They pay cash at the door when
it arrives — nothing before. That means the whole design has one job beyond
looking good: stop anyone being surprised by the box. Between 15% and 30% of
cash-on-delivery packages in this market are refused at the door, always for
the same reason, and every refusal costs shipping twice and earns nothing.

WHAT ALREADY EXISTS — please keep it
- Palette: cream #FAF6F0 page, #FFFDF9 surfaces, sand #E8DFD4 lines, clay
  #B4785A as the single accent, ink #2E2A26 text, #7A7069 secondary.
- Type: IBM Plex Sans Arabic for everything, both scripts, one family. IBM
  Plex Mono for every number.
- Numbers are the signature. Piece labels, order references, prices, counts —
  all mono, tabular, always Latin numerals so a reference survives being read
  aloud and dialled. This is the one loud thing; everything else stays quiet.
- Large radii (20–24px), diffuse warm shadows, no hard borders.
- Motion is slow: 280ms, ease-out. Nothing snaps.
- Everything tappable is at least 44px. Inputs are exactly 16px or iOS zooms.
- English and Arabic, both authored. Arabic runs RTL at 17px with 1.9 line
  height and lighter headings, because heavy weights close up connected
  letterforms.

WHAT I WANT FROM YOU
1. A wordmark for "MoStyle". It is currently just text in the body font. It
   should feel made rather than branded — closer to something stamped into a
   finished piece than to a startup logo. Works at 20px in a header and on a
   sticker on a box. One colour.
2. The product page, laid out with a real photograph in it. I have designed it
   against empty grey squares and I cannot tell whether the proportions hold
   when a real object is in the frame. Show it both ways: a shelf piece with
   its batch of numbers, and a made-to-order piece with its lead time.
3. The moment after someone orders. Right now it is a reference number and a
   list of steps. In a market where people pay cash at the door, this screen is
   where trust is either built or lost, and I think it is the weakest thing we
   have.
4. One idea I have not thought of. Ground it in the workshop — the bench, the
   machines, the way a maker marks and numbers things — not in generic
   e-commerce.

RULES YOU MUST NOT BREAK
- Never a stock photo, never a supplier image, never an AI-generated photo of a
  product. If you need an image, use an obvious grey placeholder. A photograph
  on this site is a promise that the object in it is the object being sold.
- Never a countdown timer, never invented urgency, never "selling fast". Our
  scarcity is real — "three left" means we made three — and faking it would
  destroy the only thing we have that competitors cannot copy.
- Never the words "premium", "luxury" or "high quality". Show it instead.
- No French anywhere. English and Arabic only.
- Do not introduce a second accent colour or a gradient. One accent, used
  sparingly, is the whole discipline of the palette.
- Do not use Inter or a system font stack.

VOICE
Soft, warm, certain. Short sentences, plain words. We are quietly confident
because we made the thing. "We made this one in October", not "PREMIUM
QUALITY". "Ready in six days", not "fast shipping". "Three left — we made
three", not "ONLY 3 LEFT!". Concede what is true: custom work is slower,
because it is being made.

Design for the phone first. Show me the phone width before anything else.
```

---

## When it comes back

Three questions, in this order:

1. **Does it fight the photograph?** The photo is the entire argument for
   buying anything here. Anything that pulls the eye off it loses, however
   good it looks on its own.
2. **Would it still work with one product?** We will launch with a handful of
   pieces, not a hundred. Layouts that need a full grid to look right are
   layouts that will look broken on day one.
3. **Does it say something a reseller could not say?** If a competitor could
   copy the screen in an afternoon, it is decoration. If it depends on us
   having actually made the thing, it is a moat.
