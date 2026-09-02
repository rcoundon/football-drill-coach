# Curved runs

## The problem

A player travels in a straight line between phases. A run that bends —
round the back of a defender, arcing into space — can only be expressed by
adding a phase at the turn. That costs a phase the drill does not otherwise
need, and the corner reads as a hard angle rather than a curve.

Arrows already bend. `ArrowDrawing` carries `bend` and `bendAlong`, and
`geometry.ts` carries the maths: `curveHandle`, `curveControlPoint`,
`bendFor`, a deadband and a clamp. Movement should bend the same way, using
the same encoding and the same gesture, so that a coach who has curved an
arrow already knows how to curve a run.

## Scope

Players curve. Cones and text labels do not — they do not run. A loose ball
in flight does not: a curled pass is worth having, but it is a separate code
path in the tween and a separate handle, and it is deferred rather than
dropped. A carried ball needs nothing, because it takes its position from
its carrier and so follows whatever path the carrier takes.

Two pieces are built generic rather than counter-shaped, so that adding bent
passes later is additive rather than a rewrite: the curve sampler, and the
trail-and-handle component.

## Data

`Counter` gains two optional fields:

```ts
export type Counter = {
  id: string
  color: CounterColor
  label: string
  pos: Vec
  bend?: number
  bendAlong?: number
}
```

They mean what they mean on an arrow. The chord runs from where this player
stood on the previous frame to `pos` on this one. `bend` is the signed
perpendicular offset at the peak of the bow, in pitch units. `bendAlong` is
where along the chord that peak sits, as a signed fraction of the chord's
length either side of its midpoint.

Because a `Counter` lives inside a `Frame`, the value belongs to one leg of
the movement: the value on frame 3 describes the trip from frame 2 into
frame 3. The value on the first frame is ignored, exactly as
`Frame.duration` is — nothing moves into the start of a drill.

Holding the curve as a chord-relative offset rather than as a control point
is what makes it survive the board being rotated, a group being translated,
and a selection being duplicated, with no handling of its own. It is also
why a pattern saved before curves existed loads as the straight one it was:
absent reads as zero.

`Pattern.version` stays at 3. Both fields are optional and absent is
meaningful, which is the same additive move `notes`, `tags` and
`ballsVisible` already made without a bump.

## Persistence

The counter validator in `useStorage.ts` gains
`isOptionalNumber(value.bend) && isOptionalNumber(value.bendAlong)`,
mirroring the check the arrow validator already performs on the same line. A
counter carrying a non-numeric `bend` fails validation like any other
malformed row, and is handled by the existing damaged-row machinery.

## Interpolation

`animation.ts` gains one exported function:

```ts
export function pointOnCurve(
  from: Vec,
  to: Vec,
  bend: number,
  bendAlong: number,
  t: number,
): Vec
```

It samples the quadratic Bézier whose control point is
`curveControlPoint(from, to, bend, bendAlong)`, and returns the plain lerp
when `bend` is zero — so a straight run costs nothing extra and cannot drift
through floating-point noise.

`tweenAll` is generic over `{ id, pos }` and shared by counters, cones and
labels. It is left alone. Counters get their own path in
`interpolateFrames`, reading `bend` and `bendAlong` off the **target**
counter — the frame being moved into — and sampling the curve at the eased
`e` that `tweenAll` would have used. A counter with no counterpart in the
target frame holds its position, the same insurance `tweenAll` gives.

A player who ends a phase where they began it has no chord and so no
direction to bow off. `pointOnCurve` returns that shared position for every
`t`, and a stored `bend` on such a counter is inert rather than an error —
the same treatment `bendFor` already gives a zero-length arrow.

A carried ball already takes its position from its already-eased carrier, so
it follows the curve with no change. A loose ball in flight keeps its
straight, un-eased lerp.

The GIF export samples `interpolateFrames`, so curves appear in exported
animations without any export change. The session PDF renders static frames
and is unaffected.

## On the pitch

The curve is a property of a transition, but the board shows one frame. So
the handle needs something to hang off, and that is a movement trail.

When exactly one player is held under the Move tool, on any frame after the
first, and that player exists on the previous frame and stands anywhere
other than where they stood on it, the board draws a faint dashed curve in the player's own colour from where
they stood to where they stand, with a bend handle at its peak. Dragging the
handle bows the trail, and so bends the run into this phase.

Only the held player gets a trail. An onion skin of the whole previous frame
would fill the pitch with grey duplicates for the sake of one editable
value.

The trail carries `data-transient`, so `useExport` strips it exactly as it
strips the bend dots and endpoint rings — an editing affordance, not part of
the drill.

`BendHandle.vue` is currently typed to an `ArrowDrawing`. It is widened to
take `from`, `to`, `bend`, `bendAlong` and `color` directly, which serves
both callers and is the widening a ball handle would need later anyway.

Dragging reuses `bendFor`, so the deadband that snaps a nearly-straight
arrow back to zero also straightens a run: drag the dot onto the chord and
release, and the run is straight again. That is the whole undo affordance
for a curve, and no button is needed on the pitch.

Nothing is added to the tool rail, and there is no mode and no modifier key.
Curving a run is an edit to an existing player on an existing phase, so it
lives on selection, exactly as the arrow bend does.

## The Inspector

When one player is held and a trail exists, the panel shows one row: the
curve in words — `Straight`, or `Bows left 4m` — and a Straighten button.

Left and right are read from the direction of travel, not from the coach's
view of the pitch, so the words hold when the board is rotated. The distance
is the magnitude of `bend`, rounded to the nearest metre.

A readout rather than a slider. The quantity has two axes, the drag on the
pitch is the real control, and the panel's job here is to say what the
current state is and to offer the one action that is awkward to perform by
hand on a small screen.

## Testing

- `pointOnCurve`: zero bend equals the plain lerp; `t` of 0 and 1 return the
  endpoints exactly; the sample at the peak sits where `curveHandle` says it
  does.
- Storage: a pattern round-trips with and without the fields; a pattern
  saved before this change loads with straight runs; a counter with a
  non-numeric `bend` is rejected.
- `interpolateFrames`: a counter with a bend leaves the straight line; a
  cone with a stray `bend` does not; a carried ball tracks its carrier
  around the curve.
- Trail visibility: absent on the first frame, absent when a group is held,
  absent when the player did not move between the two frames, absent under a
  drawing tool, present otherwise.
- The board action is undoable through the existing history.

## Deliberately not built

Trails for the outgoing leg — the run from this phase into the next. One
handle, one direction; to curve the next run, step to the next phase, which
is where its data lives.

Bent loose balls, curved cones, curved labels, waypoint paths of more than
one arc. An S-shaped run still takes an extra phase, which is what it takes
today.
