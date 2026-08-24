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

The headline gap, and the reason `Pattern.frames` is an array holding exactly
one frame today. This is the difference between depicting a moment and
explaining a drill: a coach shows a third-man run by playing it, not by
drawing three arrows and talking over them.

Scope is real:

- A frame strip: add, duplicate, delete, reorder.
- Tweening counter and ball positions between frames, with play, pause and
  scrub.
- Exporting an animation, not just a still.

**One question settles the design and should be answered before any code is
written: are drawings per-frame or per-pattern?** They are per-pattern today,
which is almost certainly wrong once movement is animated — the arrow
describing a pass should appear on the frame where the pass happens, not hang
over the whole drill. Changing it is a schema change, so it wants deciding
first rather than discovering halfway through.

This one deserves its own design session rather than a quick sketch.

## Smaller things

- **A session plan.** Several drills in one exported document, rather than a
  PNG per pattern. Coaches plan a session, not a drill.
- **Pattern folders or tags.** The library is a flat list; a coach with fifty
  patterns wants "rondos" and "pressing" apart from each other.
- **Straight-line snapping for arrows.** Lines snap to the horizontal and
  vertical; arrows deliberately do not, because an arrow traces a movement.
  Worth revisiting if squaring off a run turns out to be something coaches
  actually want.
