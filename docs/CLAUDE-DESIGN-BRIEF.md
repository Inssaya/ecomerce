# Briefs for Claude Design

Two of them, and the difference matters.

**Brief A — inside the system.** Keeps the palette, the type and the tokens we
already have, and redesigns everything else. Output is close to shippable.

**Brief B — from zero.** Keeps only the constraints that are actually true, and
throws away every aesthetic decision I made. Output is not shippable, and that
is the point: it shows what we would have if we had not already decided.

Run **both**. A is what we build next week. B is the one that tells us whether
we settled too early — and if any of it is better, the tokens are one file and
I can change them in an hour.

## Which constraints are real

A design tool cannot tell the difference between a fact and a habit unless you
say so. Both briefs below make it explicit.

| Real — never break | Mine — break freely |
|---|---|
| Phone first. 99% of buyers, on mobile data. | The cream/clay palette |
| English and Arabic, both authored, Arabic RTL | IBM Plex, and mono numerals |
| Cash on delivery, paid at the door | 20–24px radii, diffuse shadows |
| Real photographs only — never stock, never generated | 280ms ease-out motion |
| Real scarcity only — never a countdown | Bottom navigation bar |
| No French, anywhere | Every layout on the site |
| 44px tap targets, 16px inputs | The stamped-number signature |
| Works under prefers-reduced-motion | |

Everything either brief produces is a **proposal**. It is reviewed against
`BRAND.md` before anything ships.

Ask for far more than will be used. Generating options is cheap; never seeing
the one that would have been right is the expensive outcome.

---

## Brief A — inside the system

Link this repository first if it offers to. It reads the React components and
will pull the real tokens instead of inventing new ones.

```
You are designing for MoStyle, a one-person workshop in Morocco. Read the
codebase: the tokens, the fonts and the components exist and I want you working
inside them.

WHO WE ARE
A workshop, not a shop. We own the machines and make our pieces one at a time —
3D printed, machined, finished by hand. "Made, not resold" / "نصنع، لا نعيد
البيع". Almost everything sold online in Morocco arrived in a shipping
container and was photographed by someone who never touched it. Our photo is
the actual object you will receive, because there is one of it and we made it.

Two offers, genuinely different things:
- The Shelf — already made. Finite: we made four, there are four.
- The Workshop — you describe it, we make it. No stock, but a real date.

WHO IS LOOKING
99% on a phone, in Morocco, on mobile data. They pay cash at the door — nothing
before. So the design has one job beyond looking good: stop anyone being
surprised by the box. 15–30% of cash-on-delivery packages here are refused at
the door, always for that reason, and each one pays shipping twice and earns
nothing.

KEEP THESE — they are the system
- Palette: cream #FAF6F0 page, #FFFDF9 surfaces, sand #E8DFD4 lines, clay
  #B4785A as the single accent, ink #2E2A26 text, #7A7069 secondary.
- Type: IBM Plex Sans Arabic throughout, both scripts, one family. IBM Plex
  Mono for every number.
- Numbers are the signature: piece labels, order references, prices, counts —
  mono, tabular, always Latin numerals so a reference survives being read aloud
  and dialled. The one loud thing; everything else stays quiet.
- Large radii, diffuse warm shadows, no hard borders.
- Motion slow: 280ms ease-out. Nothing snaps.

CHANGE ANYTHING ELSE
Layout, hierarchy, composition, density, where things sit, what comes first,
what gets cut. The system is the palette and the type. It is not the
arrangement, and I am not attached to any screen on this site.

DO ALL OF IT — do not ration yourself, and do not give me one option where you
could give me three.

IDENTITY
1. A wordmark for "MoStyle" — currently just text in the body font. It should
   feel made rather than branded: closer to something stamped into a finished
   piece than to a startup logo. Works at 20px in a header, on a box sticker,
   embossed on a card. Four directions, then push the strongest furthest.
2. It applied: header, shipping sticker, the handwritten card in every box,
   a WhatsApp picture, a favicon.

EVERY SCREEN, PHONE WIDTH
3. Landing. Currently opens on the position and a real count of what we have
   made. Two other ways to open, still grounded in a workshop.
4. The store feed — a grid that reshapes per visitor. Show it with 4 pieces and
   with 40. We launch with a handful and it must not look broken.
5. The product page, with a real photograph in the frame. I have only seen it
   against grey squares. Both kinds: a shelf piece with its batch of numbers,
   and a made-to-order piece with its lead time.
6. Cart and checkout. Five fields, cash on delivery, no account.
7. The moment after someone orders. Currently a reference and a list of steps.
   Where people pay cash at their own door this screen builds or loses trust,
   and I think it is the weakest thing we have.
8. The custom-request flow: asking, receiving a price, agreeing to it.
9. Empty, error and offline states. Where a shop feels cheap, and nobody ever
   designs them.
10. The owner's panel on a phone. One person, checking between other jobs.

WHAT CARRIES THE BRAND
11. The piece number. We draw a batch as marks — solid for what is still here,
    struck through for what has gone. Five other ways to draw it.
12. The transactional emails, both languages, RTL for Arabic.
13. Instagram and WhatsApp posts: a new batch, and "we made three, one is left".

THEN GO FURTHER
14. Three ideas I have not asked for. Ground them in the workshop — the bench,
    the machines, how a maker marks and numbers things — not in generic
    e-commerce.
15. One version that takes a real risk inside these tokens. Something I might
    reject. Show me the edge so I know where it is.

NEVER
- A stock photo, a supplier image, or a generated photo of a product. Use an
  obvious grey placeholder. A photograph here is a promise that the object in
  it is the object being sold.
- A countdown, invented urgency, "selling fast". Our scarcity is real — three
  left means we made three — and faking it destroys the only thing competitors
  cannot copy.
- The words "premium", "luxury", "high quality". Show it instead.
- French. English and Arabic only.
- Inter, or a system font stack.

VOICE
Soft, warm, certain. Short sentences, plain words. Quietly confident because we
made the thing. "We made this one in October", not "PREMIUM QUALITY". "Ready in
six days", not "fast shipping". "Three left — we made three", not "ONLY 3
LEFT!". Concede what is true: custom work is slower, because it is being made.

Phone width first, before anything else.
```

---

## Brief B — from zero

Do **not** link the repository for this one. It would anchor to what exists,
which is the opposite of the point.

```
Design a storefront for MoStyle from nothing. Ignore any existing design — I
want to know what you would do if I had not already decided.

WHO WE ARE
A one-person workshop in Morocco. We own the machines and make our pieces one
at a time — 3D printed, machined, finished by hand. Every other shop online
here is arbitrage: someone bought a container of generic goods, photographed
the factory sample, and resold it. Nobody in that chain has touched the thing
they sell. We are the origin of the object, not a step in its distribution.
"Made, not resold" / "نصنع، لا نعيد البيع".

Two offers: The Shelf (already made, finite — we made four, there are four) and
The Workshop (you describe it, we make it).

THE CONSTRAINTS THAT ARE REAL — these are facts, not preferences
- Phone first. 99% of buyers, in Morocco, on mobile data.
- English and Arabic. Both authored, never machine-translated. Arabic runs RTL
  and needs more leading and lighter headings than Latin, because its letters
  connect.
- Cash on delivery. They pay at the door or refuse the box. 15–30% of packages
  in this market are refused, always because the box surprised someone.
- Photographs are of the actual object being sold. Never stock, never
  generated. Use obvious grey placeholders in your work.
- Scarcity is real or it is absent. Never a countdown.
- No French, anywhere.
- 44px tap targets, 16px inputs, and it must work for someone who has asked
  their phone to reduce motion.

EVERYTHING ELSE IS YOURS
Palette, typography, layout, structure, navigation, motion, the signature
element, the whole feel. Pick a direction and commit to it. A dominant colour
and a sharp accent beat a timid even spread. Choose typefaces deliberately for
each role rather than reaching for what everything else uses — and not Inter.

Take one real aesthetic risk and spend your boldness there, keeping everything
around it disciplined. Draw the risk from the subject: a workshop, a bench, the
machines, the way a maker marks and numbers what they make. Not from
e-commerce.

GIVE ME
- A token system: 4–6 named colours, 2+ typefaces with their roles, and the one
  signature element the whole thing hangs on.
- Landing, store, product page, checkout, and the screen after someone orders.
  Phone width.
- The same product page in Arabic, RTL, so I can see the idea survive the
  mirror.
- Three directions, not one. Make them genuinely different from each other —
  if two could be the same shop with a different hue, you have given me one.

I am not going to ship this as-is and you should not design it as though I
will. I want to find out whether the quiet, warm, cream-and-clay thing I built
is right, or just the first thing I thought of.
```

---

## When it comes back

Three questions, in this order:

1. **Does it fight the photograph?** The photo is the entire argument for
   buying anything here. Anything that pulls the eye off it loses, however good
   it looks alone.
2. **Would it still work with one product?** We launch with a handful, not a
   hundred. A layout that needs a full grid to look right will look broken on
   day one.
3. **Could a reseller copy it in an afternoon?** If yes it is decoration. If it
   depends on us having actually made the thing, it is a moat.

For Brief B only, a fourth: **is any of it better?** If it is, the tokens live
in one CSS file and one layout file. Changing the palette and the type across
the entire site is an hour of work, not a rewrite. Do not let the fact that
something is already built decide this.
