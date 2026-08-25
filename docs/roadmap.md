# Roadmap

What is worth building next, and why. Ordered by when it makes sense to do
it rather than by size.

## Editing what you have already drawn

A drawing is currently write-once. You can erase it and start again, but you
cannot adjust it — except for an arrow's curve, which grew a handle when
curved passes landed. That leaves the board inconsistent: a curve can be
reshaped indefinitely, while the two points it runs between are fixed the
moment you release the pointer.

This bites on every drill. A pass is drawn to where a player was standing
before you nudged them, and the only remedy is to erase the arrow and draw
it again.

Endpoint handles have since landed, and so has a selection model. Under
**Move**, pressing a drawing picks it up: it gets a halo, its handles appear,
and dragging its body slides the whole thing. `Delete` removes it. Nothing
else on the board shows a handle, so a busy drill stays readable.

Because `bend` and `bendAlong` are held relative to the chord, a curve keeps
its shape while its ends move or the whole arrow slides — that fell out of the
model rather than needing code.

Multi-select has since landed too. Dragging from bare grass under **Move**
draws a box, and everything inside — players, cones, labels and drawings —
joins a group that slides and deletes as one. Both questions this section
used to pose are answered: a box rather than shift-clicking, because there is
no shift key on a tablet; and counters do join, because sliding a shape is
mostly about players, which is what multi-select was wanted for. Pressing a
single player still drags that player alone.

Duplication has landed with it: **Copy** and **Delete** buttons beside Undo,
plus `Cmd/Ctrl+D`. The buttons are not conveniences — a tablet has no Cmd key
and no Delete key, so on the device this board is mostly used on they are the
only way in. Anything reachable only by keyboard is, in practice, unreachable
here; worth remembering for whatever comes next.

Still to do:

- **Nudging with the arrow keys.** Once something is held, the keyboard is the
  obvious way to move it a metre rather than a handful.
- **Rotating or flipping a group.** Harder, and worth waiting to see whether
  anyone reaches for it.

### What selection settled

It replaced always-on handles, which had two problems worth recording. Every
arrow used to show three handles the whole time Move was active, so a board
with nine drawings carried twenty-seven of them — a lot of furniture over the
top of the thing the coach is trying to read.

It also forced a priority call. An arrow nearly always starts or ends *on* a
player — that is what a pass is — so both hit circles cover the same spot and
whichever is painted later takes the press. While handles were always on, the
player had to win. Now that a handle only exists for a drawing the coach
deliberately picked up, the handle wins instead, because at that moment it is
what they are reaching for. One press on bare grass gives the player back.

One deliberate oddity lives here too. Every other grab on this board commits
to the undo history on the press. A body drag waits for the first movement,
because choosing a drawing must cost nothing: pressing five arrows to look at
them would otherwise bury real work under five entries that changed nothing.

## Frames and playback

Landed. `Pattern.frames` finally holds more than one. A frame is the whole
board at a moment — players, cones, labels, the ball and the drawings — and the
board tweens between them.

Five decisions are worth keeping, because each closed off a plausible
alternative:

- **Drawings belong to a frame.** They moved off the pattern, so the arrow
  describing a pass is on screen while the pass happens rather than hanging
  over the whole drill. A new frame copies the one before it, so they carry
  over by default. The alternative — a frame span on each drawing — was more
  precise and needed its own UI.
- **The cast is drill-wide.** Only positions and drawings differ between
  frames. That is what makes tweening by id total rather than a special case,
  and it is why nobody appears halfway through a drill.
- **Frames sit behind a getter layer.** `state.counters` and the rest are
  accessors onto the current frame, which is why roughly three hundred existing
  references and the whole test suite survived the change untouched.
- **Bodies are eased and the ball is not.** A player accelerates away and
  settles; a struck ball does neither. The ball is also detached for the whole
  move, which is what makes a pass look like a ball travelling rather than one
  that sits on the passer's boot and teleports.
- **Editing is refused whenever the view is a blend**, not merely while
  playing, and releasing the scrub lands on the nearest frame. Otherwise the
  board can be left parked mid-move refusing every drag with nothing on screen
  saying why.

Two things the spec left implicit were decided along the way. Opening a saved
pattern always lands on frame one rather than wherever it was saved from,
because reopening halfway through an animation is not what anyone means by
opening a drill. And duplicating a player copies them onto every frame,
offset from wherever the original stands in that moment, so the copy repeats
the run rather than standing still through it.

Still to do:

- **Timing one movement against another.** A run that starts before the pass
  that finds it. Every object on a frame currently moves over the same
  duration, and staggering them needs its own model and its own UI.
- **Motion paths.** A player travels in a straight line between frames. A
  curved run is expressed by adding a frame at the turn, which is usually
  enough — worth revisiting only if it turns out not to be.

## Smaller things

- **A session plan.** Several drills in one exported document, rather than a
  PNG per pattern. Coaches plan a session, not a drill.
- **Pattern folders or tags.** The library is a flat list; a coach with fifty
  patterns wants "rondos" and "pressing" apart from each other.
- **Straight-line snapping for arrows.** Lines snap to the horizontal and
  vertical; arrows deliberately do not, because an arrow traces a movement.
  Worth revisiting if squaring off a run turns out to be something coaches
  actually want.
