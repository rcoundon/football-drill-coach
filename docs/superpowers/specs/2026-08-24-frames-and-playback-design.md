# Frames and Playback — Design

**Date:** 2026-08-24
**Status:** Approved

## Purpose

A drill is a sequence, not a picture. Today the board depicts one moment and the coach
explains the rest by talking over three arrows. Frames and playback close that gap: the
coach lays out a handful of moments, and the board animates between them.

This is the last headline gap in the original design, which shipped `Pattern.frames` as
an array holding exactly one frame precisely so this could be added without invalidating
anything already saved.

## Success criteria

A coach can, without instruction:

1. Add a frame, which arrives as a copy of the one they are on.
2. Move players, the ball, cones and labels on that frame, and draw on it, without
   disturbing any other frame.
3. Reorder frames, delete one, and set how long the move into each takes.
4. Play the drill back, pause it, and scrub through it.
5. Export the whole thing as an animated GIF that plays in a chat message or a document.
6. Undo any of it.

Everything works with a mouse and with a finger on a tablet.

A pattern saved before this change opens as a one-frame drill, unchanged.

## Non-goals

- Looping playback inside the app. The exported GIF loops; the board stops on the last
  frame, because a drill being demonstrated wants to end somewhere.
- Per-object timing. Every object on a frame moves over the same duration. Staggering a
  run against a pass is a real thing coaches want, but it needs its own model and its
  own UI, and it is not worth guessing at before anyone has played a drill back.
- Video export. GIF was chosen deliberately; see "Export".
- Motion paths. A player travels in a straight line between frames. A curved run is
  expressed by adding a frame at the turn.

## Decisions

Five questions were settled before any code, and each shapes the rest.

**Drawings belong to a frame, not to the pattern.** They move into `Frame`, so a frame is
the whole board at one moment — one uniform concept rather than two overlapping ones. A
new frame is a copy of the one before it, so drawings carry over by default and the coach
rubs out the arrow once the pass it describes has happened. The alternative — a
`fromFrame`/`toFrame` span on each drawing — is more precise and needs its own UI to set
the span, and every drawing edit would then have to reason about ranges.

**The cast is drill-wide.** Adding, removing, recolouring or renumbering a player applies
to every frame; only positions differ between frames. Cones and labels behave the same
way. A drill has a fixed squad — players waiting their turn are still players on the
pitch — and this stops anyone popping into existence mid-animation. It also means every
id present in one frame is present in the next, which is what makes tweening by id
total rather than a special case.

**Each frame carries its own duration.** A drill is rarely uniform: a quick one-two, then
a long overlapping run, then a pause on the moment worth coaching. One global speed makes
a five-yard pass take as long as a forty-yard switch.

**Export is an animated GIF.** It plays inline in a WhatsApp group, a Slack message and a
Word session plan, with no player and no codec question — the same places the PNG export
already goes. A pitch is flat colour, so GIF's 256-colour palette costs nothing here.
`MediaRecorder` would have been dependency-free, but it yields WebM in Chrome and MP4 in
Safari, and neither embeds in a document; the coach mostly gets a file that needs opening.

**Frames sit under the existing state behind a getter layer.** There are roughly 300
references to `state.counters`, `state.ball` and `state.drawings` across `src` and
`tests`. Rewriting them all is a large diff whose risk is entirely mechanical and
invisible — a missed rename still type-checks, because both sides are `Counter[]`.
Instead the flat fields become getters and setters onto the current frame, and every
existing reference and every existing test keeps working. The 623 tests passing unchanged
is the check that the layer holds.

## Data model

`Frame` gains what a moment owns:

```ts
export type Frame = {
  counters: Counter[]
  markers: Marker[]
  labels: Label[]
  ball: Ball
  drawings: Drawing[]   // moved off Pattern
  duration?: number     // ms for the move INTO this frame
}
```

`duration` is optional so a pattern saved before this change needs no rewrite; absent
means `DEFAULT_FRAME_MS` (1000). The first frame's duration is ignored — nothing moves
into the start of a drill.

`Pattern` keeps its shape apart from the schema version and one legacy field:

```ts
export type Pattern = {
  version: 2
  drawings?: Drawing[]   // v1 only; read into frames[0], never written
  frames: Frame[]
  // pitch, notes, labelsVisible, notesVisible, createdAt, updatedAt unchanged
}
```

Notes stay at the pattern level. They describe the drill, not a moment in it.

`BoardState` becomes:

```ts
type BoardState = {
  frames: Frame[]        // never empty
  currentFrame: number
  labelsVisible: boolean
  notes: string
  notesVisible: boolean
  pitch: { type: PitchType; rotated: boolean }
}
```

with `counters`, `markers`, `labels`, `ball` and `drawings` defined as getters and setters
onto `frames[currentFrame]`. Vue's `reactive` runs a getter with the proxy as its
receiver, so reading `state.counters` tracks `state.frames` and `state.currentFrame`, and
a component re-renders when the coach switches frame without anything extra.

`BoardSnapshot` gains `frames` and `currentFrame` and loses the flat fields, since they
are derived. Undo therefore snapshots every frame. A ten-frame drill with twenty-two
players is a few kilobytes, so the fifty-entry limit is unaffected.

## Migration

Three inputs can arrive in the old shape, and all three go through the same wrapping step:

- A saved pattern with `version: 1`. Its pattern-level `drawings` become
  `frames[0].drawings`. It is written back as `version: 2` the next time it is saved.
- An imported JSON file, which is the same path.
- The autosaved draft, which is a flat `BoardSnapshot`. If `frames` is absent and
  `counters` is present, the flat fields are wrapped into a single frame.

`isValidSnapshot` accepts both shapes and applies the same per-frame checks to each; a
draft that fails validation is discarded exactly as it is today. The reasoning behind
validating the draft as strictly as the library still holds and gets stricter here: a
draft is reloaded on every start, so a bad one that renders as an exception bricks the
app with no way back from inside it.

Nothing writes `version: 1` after this change, and nothing writes pattern-level
`drawings`.

## Authoring rules

What is drill-wide and what belongs to one frame:

| Operation | Applies to |
| --- | --- |
| Add or remove a player, cone or label | every frame |
| Change a player's colour or number, or a label's text | every frame |
| Move anything, move the ball, give or take possession | current frame only |
| Add, edit or erase a drawing | current frame only |
| `clearCounters`, `clearDrawings`, `resetBoard` | every frame |
| Notes, pitch type, rotation, the Labels and Ball toggles | drill-wide, as now |

A new player is added at the same position in every frame, so they stand still until the
coach moves them somewhere.

Frame operations, each one commit to the undo history:

- `addFrame()` — duplicates the current frame and selects the copy
- `deleteFrame(index)` — refused when one frame is left
- `moveFrame(from, to)`
- `setFrameDuration(index, ms)`
- `goToFrame(index)` — **not** a commit

Selecting a frame changes nothing about the drill, so it costs nothing in undo history —
the same reasoning that already defers a body drag's commit to its first movement.

## Tweening

A new pure module, `src/animation.ts`, sits beside `geometry.ts`. No Vue, no DOM, and
therefore testable directly:

```ts
lerp(a, b, t)
easeInOut(t)                    // t * t * (3 - 2 * t)
timelineOf(frames)              // { total, at(ms) -> { index, t } }
interpolateFrames(a, b, t)      // -> FrameView
```

What moves, and how:

| | |
| --- | --- |
| Players, cones, labels | position lerped with ease-in-out, matched by id |
| Ball | linear, between resolved drawn positions; `attachedTo` forced null mid-flight, taking the target's value at `t = 1` |
| Drawings | the source frame's, swapping to the target's at `t = 1` |
| Colour, number, label text | not interpolated — drill-wide, so identical either side |

The two easing curves are deliberate. A body accelerates away and decelerates into
position; a struck ball does neither. Forcing `attachedTo` to null for the duration of the
tween is what makes a pass render as a ball travelling from one player to another, rather
than sitting on the passer's boot and teleporting on arrival.

Matching by id is total because the cast is drill-wide. An id nevertheless missing from
one side holds its known position rather than throwing — cheap insurance against a
hand-edited JSON file.

`BALL_OFFSET` moves from `useBoard` to `geometry.ts`, so `animation.ts` can resolve where
an attached ball is drawn without importing `useBoard` and creating a cycle. It is
re-exported from `useBoard`, so no caller changes.

## Playback

State lives in `useBoard` beside the board it drives:

```ts
playback = { playing: boolean, at: number }   // `at` is ms from the start of the drill
```

and rendering reads a new computed:

```ts
board.view    // t === 0:  frames[currentFrame], the same arrays, by identity
              // else:     interpolateFrames(frames[i], frames[i + 1], t)
```

where `{ index: i, t } = timelineOf(frames).at(playback.at)`. The identity case is what
keeps editing unchanged: a board that has not been played, or is parked on a frame, hands
`PitchBoard` exactly the arrays it renders today. `goToFrame` sets `at` to that frame's
start, so selecting a frame always lands on `t === 0`.

`PitchBoard` renders `board.view` and hit-tests `board.state`. Parked on a frame the two
are the same arrays, so nothing about editing changes; mid-tween the view is derived and
the state is untouched.

The clock is `requestAnimationFrame`, delta-timed rather than frame-counted, so a slow
tablet plays the drill at the right speed rather than in slow motion.

`currentFrame` follows the playhead: it is the index of the frame the playhead is moving
out of, so pausing anywhere leaves the coach editing the frame they paused within rather
than one they left several seconds ago. Play resumes from `at`, except at the very end,
where pressing play rewinds to zero first — the alternative is a button that appears to do
nothing. Reaching the end stops on the last frame, with `at` at the end of the drill and
`currentFrame` on the last index. Pausing keeps `at`. Scrubbing moves `at` with `playing`
false, and moves `currentFrame` with it. Releasing the scrub snaps `at` to the nearest
frame boundary, so the board is never left parked mid-tween.

Editing is blocked whenever the view is derived — while playing, and while a scrub is in
flight — not merely while playing. The selection is cleared when play starts.
`PitchBoard` ignores pointer input and the `useBoard` mutators refuse, so derived arrays
are unreachable from any edit path by construction rather than by care. Snapping the
scrub on release is the other half of that: without it the coach could be left looking at
a half-tweened board that refuses every drag, with nothing on screen saying why.

Autosave is suspended while playing. The draft watcher fires on every state change, and
without this a play-through would write a draft several times a second, any one of which
could be restored on the next start as a half-tweened board.

## Frame strip

`src/components/FrameStrip.vue`, between the board and the notes.

With one frame it shows a single `+ Frame` chip and nothing else, so a board that has
never used frames looks exactly as it does today. With two or more it opens into numbered
chips with the current one highlighted, add, delete and reorder controls, a duration field
on the current frame, and transport: play/pause, rewind, and a scrub slider spanning the
whole drill.

Every control grows to a 44px target under `pointer: coarse`, as the toolbar's do. Space
toggles play and pause when the coach is not typing. Consistent with what multi-select
settled: anything reachable only by keyboard is, in practice, unreachable on a tablet, so
the keyboard shortcut is an accelerator and the strip is the way in.

## Export

`useExport` gains `boardToGifBlob`. It drives `playback.at` to each sample, awaits
`nextTick`, and rasterises through the existing `exportableClone` → data URL → canvas
path. Two things fall out of reusing that path: the GIF is exactly what the coach just
watched, and the bend dots and endpoint rings are excluded by the same `data-transient`
rule that already keeps them out of the PNG.

- 12.5 frames per second — 80ms, and GIF's delay unit is 10ms
- 800px wide, against the PNG's 1600, because every sample pays for the width
- the notes band beneath the board, as in the PNG
- a 500ms hold on the last frame, so the loop does not snap
- loops forever
- encoder `modern-gif` 2.1.0, MIT, pinned exact

The playhead and `playing` are restored in a `finally`, so a failure halfway through
leaves the board where the coach left it. Progress is reported through the existing notice
line, and the button is disabled while it runs. On a single-frame pattern the button is
hidden: PNG already covers that case.

The sampling schedule is a pure function — `gifSchedule(frames, fps)` returning
`{ atMs, delayMs }[]` — so the part worth testing is testable, which matters because jsdom
has no canvas and the rasterising half cannot be tested there at all.

## Testing

Test-driven throughout, as the rest of the board was.

New:

- `tests/animation.spec.ts` — lerp and easing endpoints, matching by id, the ball going
  linear and detaching mid-flight, drawings holding to the source frame, and the timeline
  maths including a single frame and a zero-length drill
- `tests/useBoard.frames.spec.ts` — the getters read and write the current frame, cast
  operations reach every frame, moves reach only the current one, add/delete/reorder/
  duration behave, delete is refused at one frame, undo restores every frame
- `tests/FrameStrip.spec.ts` — one frame shows only `+ Frame`, transport emits, the
  duration field clamps

Extended:

- `tests/useStorage.spec.ts` — a v1 pattern and a flat draft both migrate, v2 round-trips,
  damaged frames are still rejected
- `tests/PitchBoard.spec.ts` — renders from `view`, ignores input while playing
- `tests/useExport.spec.ts` — the schedule follows the durations, the playhead is restored
  after a failure

The existing 623 tests are expected to pass unchanged. That is what the getter layer is
for, and it is the best evidence that it holds.

## Risks

**The getter layer is the whole bet.** If Vue's reactivity does not track through the
getters as expected, the fallback is the explicit rewrite, which is large but mechanical.
This is worth proving on the first commit rather than discovering late.

**GIF size.** A ten-second drill at 12.5fps and 800px is roughly 125 frames. Flat colour
compresses well, but the notes band and the width are the levers if real drills come out
too large to send.

**Rasterising through the live board is slow.** Each sample costs a serialise, an image
decode and a canvas draw. A long drill may take several seconds to export, which is why
progress is reported rather than assumed.

## What this leaves for later

Per-object timing, motion paths, and staggering one movement against another. All three
want to be shaped by watching real drills play back, not guessed at first.
