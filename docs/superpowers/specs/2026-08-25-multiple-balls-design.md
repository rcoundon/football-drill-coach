# More Than One Ball — Design

**Date:** 2026-08-25
**Status:** Approved

## Purpose

A drill often has more than one ball in it. A rondo has one per grid, a
finishing drill has one per queue, a passing pattern has one per lane. The
board has always had exactly one, so any drill that needs two has to be
explained rather than shown.

## Decisions

Settled with the owner before any code:

- **Up to eight.** Enough for any drill anyone has described; few enough that
  the pitch stays readable and the cap can be a plain number rather than a
  policy.
- **One ball per player.** A player carries at most one. Each ball is
  independently carried or free.
- **The Ball toggle hides all of them.** It is one setting, not one per ball.
- **A ball dropped on a player who already has one stays free** where it was
  dropped, rather than displacing theirs.
- **Balls join a box selection**, unlike today.
- **Older builds do not matter.** The format goes to version 3 with no
  backward path; nothing outside this repository has saved a drill.

### Why dropping does not swap

Because the two are the same picture. Balls are interchangeable and render
identically, so dropping ball B onto a player already carrying ball A gives
one ball attached and one ball free nearby either way. The only thing swapping
changes is which ball is which internally, which surfaces only in playback.
It buys nothing and costs a rule to explain.

### Why balls all look the same

A football looks like a football. A coach in a rondo does not care which ball
is which, and numbering them would be clutter in service of a distinction
nobody makes. If following one particular ball through a playback turns out to
be hard, that is the moment to reconsider.

## Data model

`Ball` gains an id and loses its visibility:

```ts
export type Ball = {
  id: string
  pos: Vec
  /** Counter id when a player has this ball, null when it is free on the grass. */
  attachedTo: string | null
}
```

The id is not decoration: playback matches a ball in one phase to the same
ball in the next, exactly as it does for players. Without it there is no way
to say which ball travelled where.

`Frame.ball` becomes `Frame.balls: Ball[]`, and `visible` moves out to a
drill-wide `ballsVisible`, beside `labelsVisible` and `notesVisible`.

**That move fixes a bug.** `toggleBallVisible` writes through the frame
accessor, so ball visibility is per-phase today: hide the ball on phase two
and it is still there on phase one. Nobody noticed because it predates frames
and there was only ever one ball. Visibility is a drill-wide setting and now
lives with the other two.

## Rules

Balls follow the cast rule the board already has:

| Operation | Applies to |
| --- | --- |
| Add or remove a ball | every phase |
| Move a ball, give or take possession | current phase only |
| Show or hide the balls | drill-wide |

That is not only consistency. It is what makes matching by id total across a
tween, the same argument that put players under the rule.

**Possession.** `dropBall` finds the nearest player as it does now, but skips
anyone already carrying a ball, so a ball dropped on an occupied player stays
free where it landed. Zero balls is legitimate — a shape drill has none — so
the count runs 0 to 8.

The visibility toggle survives being able to remove balls, because it is
non-destructive: hiding keeps every ball's position and carrier, and showing
hands them all back.

**Playback** generalises with no new ideas. Match balls by id, then apply the
existing rule per ball: the same carrier at both ends of a move means the ball
rides with them, eased; anything else is in flight, linear and let go of.

**Selection.** Only *free* balls join a box. A carried ball is not a group
member in its own right — it follows its carrier, automatically, because it is
drawn relative to them. This sidesteps deciding what possession means during a
group move, and it matches the pitch: you cannot lasso a ball out of someone's
feet. Copy respects the cap of eight; Delete removes balls like anything else.

## Interface

A `+ Ball` chip beside the existing `Ball` toggle, disabled at eight. `Erase`
removes a ball you press, the way it already removes a cone.

## Migration

Version 3. A v2 frame's `ball` becomes `balls: [ball]` with an id minted for
it, and `ballsVisible` is taken from the first phase's ball. A v1 drill still
opens, going through the v2 path first as it does now.

No backward path: a v3 drill will not open on an older build. The owner has
confirmed nothing outside this repository has saved one.

## Risks

**The migration is the only part that can lose work**, so it gets the same
treatment the last one did: both shapes traced by hand, and an independent
review weighted at that code.

**Sixty-seven references to `state.ball` and twenty-seven to `ballPosition`.**
Most are in tests and become `balls[0]`. Unlike the frames change there is no
accessor trick available, because the whole point is that there are several —
so these are real edits, and the compiler finds them.

## What this leaves for later

Telling one ball from another during playback, if it turns out to matter. A
ball joining a group while carried, if the possession question ever gets an
answer worth having.
