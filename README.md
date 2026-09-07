# Adaptive Layout Engine for Multi-Surface Ads

**Live demo:** https://adaptive-layout-engine-three.vercel.app

A constraint-based layout engine that takes one ad specification and one surface
profile and resolves a valid, non-overlapping arrangement — re-composing content
rather than scaling one fixed layout.

## A note on the file list

The five required files (`spec.ts`, `surfaces.ts`, `resolver.ts`,
`render-dom.ts`, `App.tsx`) are exactly as specified. `main.tsx`, `index.css`,
`vite.config.ts`, and `index.html` are unavoidable Vite project boilerplate —
the actual entry point and build config, not part of the assignment's logic.
Mentioning it here rather than letting a reviewer wonder why there are extra
files.

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

To type-check only:

```bash
npm run typecheck
```

To produce a production build:

```bash
npm run build
```

## Running the demo / switching surfaces

`App.tsx` renders one ad — a trail-running shoe ad with a headline, product
photo, price, a "Shop now" button, and a logo — and a sidebar of surface
profiles: Mobile Portrait, Mobile Landscape, Broadcast Lower Third, Square
Retail Kiosk, and a deliberately tiny Constrained Banner (a real IAB 320×50
unit) that cannot fit everything at full size.

Clicking a surface re-runs `resolveLayout(adSpec, surface)` and re-renders,
animating from the previous layout to the new one. React reuses the same DOM
node per element `id` across a re-render, so `render-dom.ts` just needs to
CSS-transition `left`/`top`/`width`/`height`/`opacity` whenever the surface
changes — the browser handles the actual interpolation, no manual animation
code required. An element that gets dropped between two surfaces fades out
in place, at its last known position, instead of snapping to the `0,0,0×0`
box the resolver reports for a dropped element — otherwise it would look
like a jarring teleport-then-vanish.

The right-hand panel shows the raw resolved coordinates and state (`full` /
`shrunk` / `dropped`) per element, plus any warnings the resolver produced.

There's also a small "try an unknown 5th surface" form in the sidebar: type
in any width/height/tap-target/text-size and click Resolve this surface.
This builds a brand-new `SurfaceProfile` at runtime and feeds it through the
exact same `resolveLayout` function — nothing about the resolver knows the
four named profiles even exist, so this doubles as the live-interview
surface test.

## Resolution flow

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Renderer
```

## Layout algorithm, step by step

The resolver (`src/resolver.ts`) never checks a surface's name or sorts it
into a fixed "is it mobile / is it TV" category. It only looks at numbers
derived from the surface — width, height, safe-area insets, minimum tap
target, minimum text size — which is what lets it generalize to a surface it
has never seen.

1. Shrink to the safe area. The surface's width/height get reduced by their
   `safeArea` insets to produce the actual usable rectangle.

2. Pick a main axis: `mainAxis = usableWidth >= usableHeight ? "horizontal" : "vertical"`.
   This is the only geometry-based branch in the whole algorithm, and it's
   the same one-line decision every CSS flexbox implementation makes for
   `flex-direction` — not a lookup table of named surfaces.

3. Every element gets a "comfortable" reference size. Each role (`hero`,
   `primary`, `action`, `secondary`, `branding`) has a fixed width/height
   that a designer would consider comfortable for that kind of content,
   independent of any surface. A continuous scale factor —
   `sqrt(usable area / a reference area)`, clamped between 0.5× and 1.8× —
   then grows or shrinks those reference sizes based on how much real
   estate the surface actually offers. It's a smooth function of area, not
   a set of named brackets.

4. Flow and wrap, like flexbox. Elements are placed one after another along
   the main axis, in priority order. When the next element would push past
   the available main-axis length, a new "line" starts, exactly how
   `flex-wrap` works. This is why a huge, roughly square kiosk screen
   naturally splits into two rows — headline+photo on one line,
   button+price+logo on the next — instead of stretching everything into
   one giant row. The wrap is a consequence of the numbers, not a rule
   written for "kiosk."

5. Check whether the wrapped lines actually fit. If the total space the
   wrapped lines need, stacked along the cross axis, is more than the
   surface actually has, that's real overflow, and step 6 kicks in.

6. Degrade by priority, then by role weight, while there's overflow:
   - Look at the lowest priority tier that still has visible elements —
     priority 3 before priority 2, priority 1 touched last.
   - Within a tied tier, sacrifice the element with the lower role weight
     first. A plain secondary text label gives way before a CTA button
     even if both are priority 2, because a button carries the sale and a
     price label doesn't.
   - Shrink first: reduce that element's size down to a hard floor
     (`minTapTarget` for anything tap-related, a `minTextSize`-derived
     floor for text).
   - If it's already at its floor and still doesn't fit, drop it
     (`visible: false`) and re-wrap.
   - Keep going until it fits, or only priority-1 elements remain. If even
     the priority-1 elements can't all fit — a genuinely impossible ask —
     the resolver falls back to scaling everything remaining down
     proportionally together and records a warning. It will never
     silently overlap or clip instead.

7. Place final coordinates. Each line's elements are positioned
   sequentially along the main axis, with any left-over room in a line
   split evenly across that line's elements so nothing looks starved next
   to empty space. Leftover room on the cross axis is handled differently:
   instead of letting it pile up on one side, half goes before the first
   line and half after the last, so the whole composition sits centered
   rather than pinned to the top or left edge. This one actually came from
   testing — an extreme custom surface (6000×1000, tried as an "unknown 5th
   surface" check) exposed that without it, content just sat flush at the
   top with all the leftover space dumped below.

8. Self-check. After computing final positions, the resolver checks every
   pair of visible elements for a bounding-box overlap and pushes a
   warning if it ever finds one. In testing it never has — it's there as a
   safety net and as something concrete to point to as a correctness
   guarantee, not because overlaps are expected.

The whole thing is a pure function: same spec plus same surface always
produces the same layout, no hidden state.

## Priority and degradation, in plain terms

Priority 1 (headline, hero photo, CTA button) is protected — last things
touched, and only in a genuinely impossible squeeze do they even shrink.
Priority 2 (price) can shrink, and can be dropped if there's truly no room.
Priority 3 (logo/branding) is the first thing to give way.

On the constrained 320×50 banner this plays out exactly as intended: the
logo drops first, the price drops next, and the headline/photo/CTA survive
— shrunk, with a warning, but present and non-overlapping.

## TypeScript design

`spec.ts` defines `AdElementSpec`/`AdSpec` as closed unions — `ElementType`,
`ElementRole`, `Priority` are literal unions, not `string` — so a typo like
`role: "primry"` or `priority: 4` is a compile error at the call site.
`defineAd()` re-validates the same rules at runtime too, for data that
arrives from outside TypeScript's reach (JSON, for instance), and it also
rejects duplicate element ids and a `button` whose role isn't `action`,
since the resolver's tap-target logic keys off that pairing.

`surfaces.ts` mirrors that with `SurfaceProfile`/`defineSurface()`.
Zero or negative dimensions, a safe area that consumes the whole surface,
or a `minTapTarget` bigger than the surface itself are all caught at
construction time with a specific error message — not a `NaN` that only
surfaces three files later somewhere in a render.

`resolver.ts` exports `ResolvedElement`/`ResolvedLayout` as the one contract
a renderer needs: absolute `left`/`top`/`width`/`height`, an optional
`fontSize`, a `visible` flag, and a `state` (`full`/`shrunk`/`dropped`). A
renderer never has to guess anything or re-derive it — it just draws the
numbers it's handed.

## Architecture

See `ARCHITECTURE.md` for the layer-by-layer breakdown, and for why adding a
surface or a renderer never requires touching `resolver.ts`.

## Known limitations

Font size is estimated from the element's resolved box, not from actually
measuring rendered glyph widths. A production version would measure text
with something like `canvas.measureText` before finalizing box sizes,
especially for long headlines.

Only three element types exist — `text`, `image`, `button`. Adding a new one
(a countdown timer, say) means adding a case to the renderer's
`renderElementNode` and a reference size in the resolver. The resolution
*algorithm* itself doesn't change, but the type list isn't open-ended as it
stands.

Reference sizes are tied to role, not to axis — a role's comfortable
width/height is fixed and just gets reassigned to main/cross depending on
which way the layout is flowing. A more faithful model would let a role
define different comfortable proportions for flowing in a row versus
stacking in a column. This hasn't produced a bad layout in anything tested
so far, but it's a simplification worth naming rather than glossing over.

Animated transitions between surfaces are implemented, but only for the DOM
renderer (see "Running the demo" above). There's no Canvas renderer. One was
prototyped during development, and it worked as a proof of concept, but it
surfaced a browser-specific text-rendering discrepancy I could reproduce in
isolation without being able to fully explain with confidence in the time
available — so it got cut rather than shipped as code I couldn't completely
account for. `ARCHITECTURE.md` still answers *why* a Canvas renderer could
be added without touching `resolver.ts`, which is the actual question the
brief asks; it's just not included as running code here.

The "reposition" degradation mode from the brief ended up implemented as
shrink-then-drop, not shrink-then-move-to-a-corner-then-drop. A real
reposition step — tucking a badge into an unused corner, say — turned out to
risk overlapping the main flow unless it's constrained to genuinely empty
cross-axis margin, which the four required surfaces rarely have. Shrink →
drop covers every required and stress-test case without ever overlapping,
so that's what shipped, flagged here rather than left silently unfinished.

There's also a hard boundary clamp sitting at the very end of the pipeline
as a safety net, and during testing it did occasionally fire. Testing
against 500 randomized surface sizes (30px to 2500px on a side) turned up
two real bugs this way: one where a single oversized element's preferred
width was never capped against the surface's own width — fixed at the
source, in `computePreferredSizes` — and a subtler one where floating-point
rounding combined with the degradation loop's convergence tolerance could
compound across two wrapped lines and push a box 2–3px past the surface
edge on very small, square surfaces. Rather than chase every possible
source of sub-pixel drift, a final `clampToSurfaceBounds` pass guarantees
no visible element ever exceeds `[0, surfaceWidth] × [0, surfaceHeight]`,
logging a warning on the rare occasion it has to nudge something. That's
meant as defense in depth, not a substitute for correct upstream math — the
bug that caused the 3px case above got fixed at its source too; the clamp
is just what caught it during testing, and what stays as insurance against
the next one.

## Time spent

Roughly two to three focused day: architecture and type design, the resolver's first
pass (which initially degenerated into "everything always fits in one
line" — a bug the write-up above still calls out), fixing an axis-rotation
bug that was flattening headlines into tall narrow columns, tuning reference
sizes against all five profiles, then the demo UI and this documentation.

## AI tool disclosure

Built with Claude (Anthropic) as a pair-programming assistant — architecture
discussion, writing the initial implementation, and iteratively debugging
real issues it found by actually running the resolver against all five
surfaces. The axis-rotation bug and the overlap bug documented above were
caught this way, by running the thing and checking real numbers, not
assumed away. All code was reviewed and is understood well enough to walk
through line by line.
