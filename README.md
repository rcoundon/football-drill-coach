# Football Coach Tactics Board

A browser tactics board for describing soccer/football drills. Drop coloured counters on
a pitch, drag them into position, draw runs and passes, mark who has a ball, and save
the drill for a later session.

Everything runs in the browser. There is no server and no account, and drills are
stored in the browser's local storage.

## Running it

```bash
npm install
npm run dev
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Using it

Click a colour under **Players** to drop a counter, then drag it into position. Dropping
one switches you to **Move**, since positioning the new player is nearly always the next
thing you do.
Counters arrive unlabelled: most drills are explained by colour and position. If you want
numbers or initials, double-press a counter and type them — up to four characters. Clearing
the text takes the label away again.

| Tool | Key | What it does |
| --- | --- | --- |
| Move | `V` | Drag counters and balls, and bend arrows |
| Draw | `P` | Freehand pen |
| Run | `R` | Solid arrow |
| Pass | `S` | Dashed arrow |
| Line | `L` | Straight line for marking out zones, channels and thirds |
| Cone | `C` | Tap the pitch to drop a cone; drag one to move it |
| Text | `T` | Tap the pitch to drop a label; drag or double-press one to adjust it |
| Erase | `E` | Remove whatever you press |

Undo is `Ctrl+Z` (`Cmd+Z` on a Mac), redo is `Ctrl+Shift+Z`.

**Curved passes and runs.** Drag out a Run or a Pass and it keeps a small dot
at its midpoint. Drag that dot and the curve follows it: out from the line to
bow the arrow, and along the line to move where the bow peaks — an even arc for
a pass bent round a defender, a late one for a cross whipped in at the far
post, an early one for a run that curves away and then straightens. The
arrowhead swings round to the angle the curve arrives at. Press anywhere else
and you are drawing the next arrow, which takes the dot in turn. Drag a dot
back onto the straight line to make that arrow straight again.

The dot slides between a quarter and three-quarters of the way along. Further
than that the curve doubles back on itself before reaching the far end, which
reads as a kink rather than a curl.

A hollow ring sits at each end of the arrow or line you just drew, alongside
the bend dot. Drag a ring to move that end without leaving the tool — a curve
keeps its shape and its lean while its ends move, and a line still snaps back
onto the horizontal or vertical. Lines get rings too, though they have no bend
dot: a line marks out ground rather than describing a movement.

**Gathering a group.** Under **Move**, drag from bare grass to draw a box:
every player, cone, label and drawing inside joins the group and gets a
highlight. Drag any member and the whole shape slides together, formation
intact. A plain press on grass, `Escape`, or changing tool puts everything
down.

**Copy** duplicates whatever is held, dropping the copy a little down and to
the right and leaving you holding it, ready to drag into place — a mirrored
shape on the other flank in two gestures. **Delete** takes the lot off in one
go. Both sit beside Undo, and both are undoable.

On a keyboard, `Cmd+D` or `Ctrl+D` copies and `Delete` or `Backspace` removes.
The buttons are not just shortcuts for those: a tablet has neither key, so
they are the only way in on the device this board is mostly used on. `Cmd+D`
is left to the browser whenever nothing is held.

Pressing a single player still drags that player and nothing else, exactly as
it always has — the box is the only way into a group. A drawing joins the box
only if one of the points it is made of falls inside, so a long arrow clipping
the corner is left where it is.

A loose ball inside the box joins the group like anything else. A ball a
player is carrying does not: it goes where its carrier goes, so it comes along
only if they were in the box too. You cannot lasso a ball out of someone's
feet.

**Going back to a drawing.** Under **Move**, press any drawing to pick it up.
It gets a pale halo and its handles appear — nothing else on the board does,
so a busy drill stays readable. Handles are for one drawing at a time: a group
of five arrows has no single bend to offer, so it shows none. Drag its body to slide the whole thing without
changing its shape, drag a ring to move one end, drag the dot to bend it.
`Delete` or `Backspace` rubs it out. Press bare grass, press `Escape`, or
change tool to put it down again. Everything is undoable.

Handles sit above the players, so where one lands on a player the handle wins
the press. That only happens for a drawing you deliberately picked up, and one
press on grass gives the player back.

The halo, dots and rings are an editing aid only: they never appear in an
exported image.

**Building a drill.** A drill is a sequence, not a picture, so you build it up
in phases. A phase is the board at one point in the drill: where everyone
stands, and what is drawn over them. **+ Add a phase** adds one, copied from
the phase you are on, so the next starts as the same players a few yards from
where they were. Move them, move the ball, draw on it — the phase you came
from is untouched.

Once there are two, the strip opens: numbered chips for each moment, ◀ and ▶
to move the one you are on earlier or later, **Delete phase** to remove it, a
field for how long the move into it takes — hidden on the first frame, since
nothing moves into the start of a drill — and play, rewind and a scrub slider.

`Space` plays and pauses, except when a button, link or select has focus,
since those already act on Space themselves. A coach who has just tapped a
chip and then presses Space gets that chip pressed again, not playback —
worth knowing if the shortcut ever seems to do nothing.

Players ease away and settle. A struck ball travels in a straight line and
leaves the passer's boot as it goes, so a pass looks like a pass — while a
ball someone is running with stays on their boot, moving exactly as they do. A drawing belongs to
the moment it describes, so the arrow showing a pass is on screen while the
pass happens and gone once you rub it out on the next frame.

Your squad is the same in every moment. Adding, removing or renaming a
player, cone or label reaches every frame; only positions and drawings differ
between them. Nobody appears halfway through a drill. **Copy** reaches every
frame too: duplicating a player copies their run rather than just where they
stand right now, so the copy repeats the same movement, offset, through the
whole drill.

**GIF** saves the whole thing as an animation that loops — it plays inline in a
message or a document, which is where a session plan goes. It appears once
there is more than one frame; a single moment is what **PNG** is for.

While a drill is playing, or while you are dragging the scrub slider, the board
is showing a blend of two moments rather than a moment, so it will not take an
edit. Let go of the slider and it lands on the nearest frame.

**Drill notes** sit beside the board on a wide screen and beneath it on a
narrow one: setup, coaching points, progressions. They are saved with the
drill and come out in the PNG export in a band under the pitch, so a
session plan pasted into a document carries its instructions with it —
never printed over the pitch itself. **Notes** hides the panel, and hiding
it keeps the notes out of the export too.

**Labels** hides the on-pitch text without deleting it.

**Balls.** A drill can have up to eight: one per rondo grid, per queue, per
lane. **+ Ball** puts another out, and **Erase** takes one off the way it takes
off a cone. A drill with none at all is fine — a shape or pressing session has
no ball in it.

A player holds one ball at a time, so a ball dropped on someone who already
has one stays free where you dropped it rather than taking theirs. Balls look
alike, because footballs do: in a rondo it does not matter which is which.

**Ball** (`B`) hides every ball at once, and the possession rings with them,
since nobody can be in possession of a ball that is not there. It is not the
same as removing them: the board remembers where each was and who had it, and
hands them all back when you show them again. The setting is saved with the
drill, and it applies to the whole drill rather than to one phase.

Cones are equipment rather than players: they carry no number, and a ball
never belongs to one, so a cone beside a player can't steal possession. Drag
them with **Move** and remove them with **Erase**.

**Clear players** takes everyone off and leaves your drawings and cones. **Clear drawings**
does the reverse. **Reset** starts a fresh board for the next drill: it clears players,
cones and drawings, drops back to a single phase, and leaves one ball out the way a fresh
board has one. It keeps the pitch and orientation you are on, since that is almost always
the pitch you want next. All three are undoable.

Drop a ball on a player to give them possession — the player gets a white ring and the
ball travels with them. Drag it onto empty grass to release it.

## On a phone or tablet

Below 768px the toolbar keeps the controls you touch constantly — colours,
tools, undo — and moves the rest behind a **☰ More** button: pitch type,
the toggles, clearing, and everything to do with saving. On a touch screen
every control grows to a 44px target, which is the smallest that is
reliably hittable with a finger.

Between 769px and 1280px — tablet territory — the tools and player colours
move to a rail down the left edge, where the thumb of the hand holding the
device already is, and the notes go under the board rather than beside it.
Measured on a 1194px tablet: side by side, the rail and a notes column left
the pitch 663x430; stacked, it gets 936x606.

A fresh board on a portrait screen starts rotated, so the pitch fills the
width instead of sitting in a thin band. A saved drill is never
overridden — rotation belongs to the drill, so a drill saved landscape
comes back landscape whatever you open it on.

## Where drills live

Saved drills are in this browser's local storage under `fct.patterns.v1`, and the board
you are working on autosaves to `fct.draft.v1` so a refresh does not lose it. The keys
still say "patterns" because renaming one would orphan every drill anyone has saved;
only what you read on screen changed.

Local storage is per-browser and per-device. Use **Export** to write a JSON file for
backup or to move drills to another machine, and **Import** to read one back. Importing
never overwrites: a drill whose id already exists arrives under a new id with
`(imported)` appended to its name.

Older drills still open. One saved before phases existed comes back as a single phase
with its drawings carried onto it; one saved when a drill could only have a single ball
comes back with that ball as the first of its list, keeping where it was and who had it.
Either way it looks as it did when you saved it, so nothing in your library needs
redoing.

Drills are written in the current format the next time you save them, and a drill saved
now will not open in an older build of the board.

## Coordinate system

Positions are stored in pitch units — x from 0 to 100, y from 0 to 64.76 — which is a
105×68 pitch at uniform scale. Nothing is stored in pixels, so resizing the window,
rotating the board, and switching between pitch types never move a counter.

## Not built yet

Timing one movement against another — a run that starts before the pass that
finds it. Every object on a frame currently moves over the same duration.

See [docs/roadmap.md](docs/roadmap.md) for that and the rest of what is worth
building next.
