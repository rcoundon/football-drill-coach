# Football Coach Tactics Board

A browser tactics board for describing soccer/football drills. Drop coloured counters on
a pitch, drag them into position, draw runs and passes, mark who has the ball, and save
the pattern for a later session.

Everything runs in the browser. There is no server and no account, and patterns are
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

Click a colour under **Players** to drop a counter, then drag it into position.
Double-click a counter to rename it — labels are capped at four characters. New counters
are numbered automatically from 1 within each colour, and deleting one frees its number
for reuse.

| Tool | Key | What it does |
| --- | --- | --- |
| Move | `V` | Drag counters and the ball |
| Draw | `P` | Freehand pen |
| Run | `R` | Solid arrow |
| Pass | `S` | Dashed arrow |
| Line | `L` | Straight line for marking out zones, channels and thirds |
| Cone | `C` | Tap the pitch to drop a cone; tap again for the next one |
| Text | `T` | Tap the pitch to drop a label; drag or double-press one to adjust it |
| Erase | `E` | Remove whatever you press |

Undo is `Ctrl+Z` (`Cmd+Z` on a Mac), redo is `Ctrl+Shift+Z`.

**Drill notes** sit beside the board on a wide screen and beneath it on a
narrow one: setup, coaching points, progressions. They are saved with the
pattern and come out in the PNG export in a band under the pitch, so a
session plan pasted into a document carries its instructions with it —
never printed over the pitch itself. **Notes** hides the panel, and hiding
it keeps the notes out of the export too.

**Labels** hides the on-pitch text without deleting it.

**Ball** (`B`) takes the ball off the pitch and puts it back — a shape or
pressing drill often has no ball in it. Hiding it also hides the possession
ring, since nobody can be in possession of a ball that is not there, but the
board remembers who was carrying it and returns it to them when you show it
again. The setting is saved with the pattern.

Cones are equipment rather than players: they carry no number, and the ball
never belongs to one, so a cone beside a player can't steal possession. Drag
them with **Move** and remove them with **Erase**.

**Clear players** takes everyone off and leaves your drawings and cones. **Clear drawings**
does the reverse. **Reset** starts a fresh board for the next drill — it clears
players, cones, ball and drawings, but keeps the pitch and orientation you are on, since
that is almost always the pitch you want next. All three are undoable.

Drop the ball on a player to give them possession — the player gets a white ring and the
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
width instead of sitting in a thin band. A saved pattern is never
overridden — rotation belongs to the drill, so a pattern saved landscape
comes back landscape whatever you open it on.

## Where patterns live

Saved patterns are in this browser's local storage under `fct.patterns.v1`, and the board
you are working on autosaves to `fct.draft.v1` so a refresh does not lose it.

Local storage is per-browser and per-device. Use **Export** to write a JSON file for
backup or to move patterns to another machine, and **Import** to read one back. Importing
never overwrites: a pattern whose id already exists arrives under a new id with
`(imported)` appended to its name.

## Coordinate system

Positions are stored in pitch units — x from 0 to 100, y from 0 to 64.76 — which is a
105×68 pitch at uniform scale. Nothing is stored in pixels, so resizing the window,
rotating the board, and switching between pitch types never move a counter.

## Not built yet

Recording and playing back movement. The saved format already stores a `frames` array
with one frame per pattern, so recording can append frames without changing the schema
or invalidating anything already saved.
