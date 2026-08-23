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

Endpoint handles have since landed: every arrow and line offers a handle on
each end under **Move**. Because `bend` and `bendAlong` are held relative to
the chord, a curve keeps its shape while its ends move — that fell out of the
model rather than needing code.

Still to do:

- **Moving a whole drawing.** Dragging the body of an arrow, line or pen
  stroke to reposition it without changing its shape.
- **Multi-select.** Shifting a group of counters and drawings together, so a
  shape can be slid ten metres up the pitch in one gesture.

### A selection model, probably

Endpoint handles exposed something worth deciding before either of the above.
Every arrow shows three handles the whole time **Move** is active, so a board
with nine drawings carries twenty-seven of them. On a busy drill that is a lot
of furniture over the top of the thing the coach is trying to read. The
drawing tools escape this by showing handles only for the segment last drawn,
which is exactly the selection idea below, arrived at from the other end.

It also forced a priority call. An arrow nearly always starts or ends *on* a
player — that is what a pass is — so both hit circles cover the same spot and
whichever is painted later takes the press. Players win, because dragging one
is the commonest thing anyone does in Move mode; the endpoint handle is still
reachable anywhere the two do not overlap. That is the right trade, but it is
a trade.

Both problems have the same answer: press a drawing to select it, and show
handles only for the selection. Nothing is on screen until you ask for it, the
overlap stops mattering because a selected arrow's handles can safely sit on
top, and "moving a whole drawing" and "multi-select" both become natural
extensions rather than separate features.

Worth designing properly before more handles are added.

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
