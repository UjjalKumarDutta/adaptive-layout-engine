# Architecture

```
        spec.ts                       surfaces.ts
   "what's in the ad"            "what screen, what rules"
           │                              │
           └──────────────┬───────────────┘
                          ▼
                     resolver.ts
              "where does everything go"
                          | 
                          ▼
                    ResolvedLayout
        (plain data: left/top/width/height per id)
                          │
                          ▼
                    render-dom.ts
              "turn those numbers into pixels"
                          │
                          ▼
                       App.tsx
                  "the demo, the picker"

```

## Why these are separate files, not just separate functions

Each layer only knows about the layer directly below it, and only through a
plain data shape — not shared mutable state, not one giant object everyone
reaches into.

`spec.ts` knows nothing about pixels. An `AdSpec` has no `x`, `y`, `width`,
or `height` anywhere — it answers "what exists and how important is it,"
never "where does it go." That's what lets the exact same spec object get
reused across five completely different surfaces without being edited.

`surfaces.ts` is the mirror image: it knows nothing about the ad. A
`SurfaceProfile` doesn't reference element ids or roles, it only describes
the screen — its size and its physical or legal constraints (safe area,
tap target, text size floor, touch-only, viewing distance).

The interesting part is `resolver.ts`, which is the only file allowed to
compute a position. It imports the *types* from `spec.ts` and `surfaces.ts`
but never mutates either input; `resolveLayout(spec, surface)` is a pure
function that returns a brand-new `ResolvedLayout` object, and nothing else
in the codebase computes a left/top/width/height value.

On the other side of that boundary, `render-dom.ts` is the only file
allowed to touch the DOM or React tree. It receives a `ResolvedLayout` it
didn't create and turns it into `React.createElement` calls — it never asks
"is this a kiosk," it just reads `left`/`top`/`width`/`height`/`visible` off
each resolved element.

`App.tsx` wires the other four together for the demo. It owns UI state
(which surface is selected, the custom-surface form) and calls
`resolveLayout` then `AdCanvas` — no layout logic of its own.

## Could a new surface be added without touching the resolver?

Yes, and this is enforced by construction rather than by convention:
`resolveLayout` takes a `SurfaceProfile` value, and there's no `switch` or
`if` on `surface.id` or `surface.name` anywhere in the file. Adding a sixth
named profile is exactly what the "unknown 5th surface" form in the demo
already does at runtime — build a `SurfaceProfile` object and call the same
function. No code path in `resolver.ts` exists for just one of the five
current profiles.

## Could a new renderer (e.g. Canvas) be added without touching the resolver?

Yes — `ResolvedLayout` is the entire contract. A Canvas renderer would be a
new file, say `render-canvas.ts`, that takes the exact same `ResolvedLayout`
and `AdSpec` that `render-dom.ts` takes, and instead of
`React.createElement`, calls `ctx.fillRect(el.left, el.top, el.width, el.height)`
per element and `ctx.fillText(...)` for text roles. `resolver.ts` wouldn't
change by a single line, because it's never imported React, the DOM, or
anything rendering-related in the first place — its only imports are types
from `spec.ts` and `surfaces.ts`.

This was actually prototyped during development, and it worked as a proof
of concept, but it surfaced a browser-specific text-rendering discrepancy
under certain conditions that couldn't be fully root-caused with confidence
in the time available, so it got left out of the final submission rather
than shipped as code that couldn't be completely explained. The separation
above is what made it possible to build in the first place without
touching `resolver.ts`, and it's also what makes it a well-scoped,
self-contained follow-up rather than something that would need
restructuring the engine.

## Data flow for a single resolve

1. `App.tsx` holds the one `AdSpec`, defined once at module scope, and the
   currently-selected `SurfaceProfile`.
2. `useMemo(() => resolveLayout(spec, surface), [surface])` only re-runs
   when the surface changes — the spec is a stable reference, so switching
   surfaces is the only thing that triggers recomputation.
3. `resolveLayout` is also memoized internally, keyed on a stable string
   built from the spec's and the surface's actual field values rather than
   object identity, so resolving a previously-seen spec/surface pair again
   — including flipping back to a surface visited earlier in the session —
   is an O(1) map lookup instead of rerunning the algorithm.
4. The returned `ResolvedLayout` is hand-off data. `AdCanvas` reads it via
   `render-dom.ts`'s `useAnimatedRenderableElements` hook, which zips it
   back up with the original `AdSpec` to know what content — a text string,
   an image alt — belongs in each box, remembers each element's last known
   position so a dropped element can fade out in place instead of jumping
   to `0,0,0×0`, and then produces the React elements.

## Extending toward broadcast-safe-area / print-bleed

Both are already representable without new algorithm code. Broadcast safe
area — title-safe and action-safe zones — is exactly what
`SurfaceProfile.safeArea` already models: a broadcast profile would just set
larger insets, something like 10% of each dimension, which is the common
title-safe convention, and the resolver already treats that as "usable
space" the same way it handles safe-area insets on every existing profile.

Print bleed is the same idea from the opposite direction. Instead of
shrinking the usable area inward, a print profile would add a small
negative margin so content is allowed to extend past the nominal edge. That
would need one new optional field on `SurfaceProfile` (something like
`bleed`) and one line in the resolver's inner-rectangle calculation —
`innerWidth = width - safeArea.left - safeArea.right + bleed * 2` — not a
new resolution strategy.

## Accessibility as a constraint (bonus direction)

`minTapTarget` already behaves as a first-class hard constraint today —
it's converted into `min.minWidth`/`min.minHeight` for any `action` element
before any sizing math happens, exactly alongside `minTextSize`. Extending
that to contrast-aware branding placement would follow the same pattern: it
would become another field surfaces can declare, something like
`minContrastZone`, converted into a constraint at the same point in the
pipeline where tap targets and text floors are converted today.
