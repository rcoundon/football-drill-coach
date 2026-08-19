# Football Coach Tactics Board — Design

**Date:** 2026-08-18
**Status:** Approved

## Purpose

A browser app for describing soccer/football tactics and drills visually. A coach drops
coloured counters on a pitch, drags them into position, draws runs and passes over the
top, marks who has the ball, and saves the resulting pattern for reuse in a later
session.

The app is client-only. There is no server, no account, and no network dependency —
everything lives in the browser.

## Success criteria

A coach can, without instruction:

1. Choose a pitch (blank, full, or half) in portrait or landscape.
2. Drop counters in up to five colours and drag them anywhere on the pitch.
3. Draw freehand shapes and run/pass arrows to mark zones, channels, and movement.
4. Place the ball and attach it to a player to show possession.
5. Save the pattern under a name, reload it later, and export it as a PNG or a JSON file.
6. Undo any mistake.

All of the above works with a mouse on a desktop and with a finger on a tablet.

## Non-goals for this version

- Recording and playing back movement over time. The data model is shaped to accept it
  later (see "Replay readiness"), but no record UI ships in v1.
- Multi-user collaboration, sharing links, or any server component.
- Formation templates, player databases, or session-plan documents.

## Approach

Vue 3 with Vite and TypeScript. The board renders as SVG. Application state lives in a
single composable singleton rather than a state library.

Two alternatives were considered and rejected:

- **Pinia.** It would add devtools time-travel and a conventional store shape, but it
  does not make undo any easier — snapshot undo works identically with or without it —
  and it is a dependency the app does not otherwise need.
- **Nuxt.** Rejected as overkill: the app has no server rendering, no routing, and no
  backend.

SVG was chosen over canvas because every object on the board is a first-class DOM
element. That gives Vue-native components per counter, free hit-testing, crisp rendering
at any zoom, and trivial serialisation to JSON. Canvas would be faster with thousands of
objects; a tactics board has tens.

## Coordinate system

All positions are stored in **pitch units: 0–100 in x, 0–64.76 in y**, never in pixels.
The board is an SVG with `viewBox="0 0 100 64.76"`.

(Amended during implementation. The original square view box was wrong: a 105m x 68m
pitch drawn into a square box either stretches the geometry, turning the centre circle
into an ellipse, or needs non-uniform scaling. Normalising the long side to 100 at a
uniform `100 / 105` scale gives a height of `68 x (100 / 105) = 64.76`.)

This has three consequences worth stating explicitly:

- Resizing the window, switching between pitch types, and rotating the board never move
  a counter.
- Saved patterns are resolution-independent and load correctly on any screen.
- PNG export is a straight rescale of the same geometry.

Portrait and landscape are a single `rotated` boolean, applied as an SVG transform on the
pitch group, with an inverse transform on counter labels so numbers stay upright. Stored
positions are unaffected by rotation.

Converting a pointer event to pitch units reproduces `preserveAspectRatio` arithmetically
against the bounding rectangle, rather than using the SVG's screen coordinate transform
matrix as originally specified.

(Amended during implementation. The matrix approach is more robust in principle — it stays
correct under arbitrary CSS transforms — but `getScreenCTM` and `DOMPoint` are unimplemented
in jsdom, which would have left the single most drag-critical function in the app untestable.
The arithmetic version is pure and exhaustively tested in both rotations. It assumes the
board carries no CSS transform and keeps the default `preserveAspectRatio`; both hold today,
and changing either means revisiting this function.)

## Data model

```ts
type PitchType = 'blank' | 'full' | 'half'
type CounterColor = 'red' | 'blue' | 'yellow' | 'green' | 'black'

type Vec = { x: number; y: number }   // pitch units: x 0..100, y 0..64.76

type Counter = {
  id: string
  color: CounterColor
  label: string        // auto-assigned "1".."n" within its colour, editable
  pos: Vec
}

type Drawing =
  | { id: string; kind: 'pen';   color: string; points: Vec[] }
  | { id: string; kind: 'arrow'; color: string; style: 'run' | 'pass'; from: Vec; to: Vec }

type Ball = {
  pos: Vec
  attachedTo: string | null   // Counter id, or null when free on the grass
}

type Frame = {
  counters: Counter[]
  ball: Ball
}

type Pattern = {
  id: string
  name: string
  version: 1
  pitch: { type: PitchType; rotated: boolean }
  drawings: Drawing[]
  frames: Frame[]      // always length 1 in v1
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
}
```

### Replay readiness

`frames` is an array, not a single object, specifically so that record and playback can
be added without a schema change. Version 1 reads and writes `frames[0]` exclusively.
A future version appends frames as the coach records movement and adds a scrubber to step
through them. Existing saved patterns remain valid — a one-frame pattern is a still
image.

`version: 1` exists so a future loader can detect and migrate older saves.

### Why drawings sit outside frames

Zones and arrows describe the drill, not a moment within it. A channel marked on the
pitch is true for the whole drill; a player's position is not. Keeping drawings at the
pattern level means replay animates only what actually moves.

If a later version needs drawings that appear and disappear during playback, they move
into `Frame` under a version bump and a migration that copies the pattern-level drawings
into every frame.

### Counter labels

Counters arrive unlabelled. A coach who wants numbers or initials double-presses a
counter and types them, capped at four characters; clearing the text removes the label.

(Amended after use. The original design auto-numbered counters from 1 within each colour
and went to some trouble over what happened to those numbers on delete. In practice most
drills are explained by colour and position, and an automatic number is one the coach has
to clear before writing the one they actually wanted. Removing it also removed the whole
question of renumbering, and the numbering helper with it.)

## Components

Presentation is split from state. Only `useBoard` mutates state; components emit intent
and never reach into the state object. This keeps undo correct by construction, because
nothing can change state without passing through the single commit chokepoint.

| Component | Responsibility |
| --- | --- |
| `App.vue` | Layout and global keyboard shortcuts |
| `Toolbar.vue` | Tool mode, colour palette, pitch selector, rotate, undo/redo, export |
| `PitchBoard.vue` | The root `<svg>`; owns pointer events, converts screen coordinates to pitch units, dispatches to the active tool |
| `PitchMarkings.vue` | Renders markings from `pitchType`; pure, holds no state |
| `PlayerCounter.vue` | One counter: circle, label, possession ring |
| `BallToken.vue` | The ball |
| `DrawingLayer.vue` | Renders pen paths and arrows |
| `PatternLibrary.vue` | Saved patterns: load, rename, delete, import, export |

| Composable | Responsibility |
| --- | --- |
| `useBoard.ts` | Singleton state and every mutation; owns `commit()` and the undo/redo stacks |
| `useStorage.ts` | localStorage reads and writes, serialisation, import merging |
| `useExport.ts` | SVG to PNG, and JSON file download and upload |

## Interaction

### Tool modes

Exactly one tool is active at a time: `select`, `pen`, `arrow-run`, `arrow-pass`, or
`erase`. `select` drags counters and the ball. `erase` removes whatever is clicked.

### Pointer input

All input uses pointer events, giving one code path for mouse, touch, and stylus. The
SVG sets `touch-action: none` so dragging the board does not scroll the page. Counters
have a hit radius larger than their drawn radius so they can be grabbed with a fingertip.

### Ball and possession

There is one ball. On drop, the app finds the nearest counter within a snap radius: if
the ball lands inside that radius it attaches to the counter, otherwise it sits free on
the grass.

An attached ball renders at a fixed offset from its counter and moves with it, and the
counter draws a possession ring. Dragging the ball away detaches it. Deleting a counter
that holds the ball leaves the ball free at that counter's last position.

Possession is therefore a single fact — where the ball is — rather than two independent
pieces of state that can contradict each other.

### Arrows

Run arrows draw solid, pass arrows draw dashed, following standard coaching notation.
Both are drawn by pressing at the origin and releasing at the destination.

### Undo and redo

`commit()` pushes a structured clone of `{ counters, ball, drawings, pitch }` onto the
undo stack and clears the redo stack. The stack is capped at 50 entries.

Drags commit once on pointer-up rather than on each pointer-move, otherwise a single
drag would push hundreds of entries and make undo useless.

Bound to Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.

## Storage

All saved patterns live in one localStorage key, `fct.patterns.v1`, as a JSON array.

The working board autosaves to a separate key, `fct.draft.v1`, debounced, so a refresh or
an accidental tab close does not lose work in progress. This draft is distinct from the
library: "Save" and "Save as…" write to the library explicitly.

Import reads a JSON file and merges by id. A pattern whose id already exists is imported
under a new id with its name suffixed, so an import can never silently overwrite existing
work.

Because localStorage is per-browser and per-device, JSON export is the supported route
for backup and for moving patterns between machines.

## Error handling

- **Corrupt or unparseable localStorage.** Caught at read time. The app starts with an
  empty library and surfaces a non-blocking message; it does not clear the bad data, so
  it remains recoverable by hand.
- **Unrecognised pattern version on load.** Rejected with a message naming the version,
  rather than loaded partially.
- **Quota exceeded on save.** Reported directly with a suggestion to export and delete
  old patterns. The in-memory board is left untouched so nothing is lost.
- **Malformed import file.** Validated against the schema before merging. A file that
  fails validation is rejected whole; a partial import is never performed.

## Testing

Vitest with `@vue/test-utils` and jsdom, written test-first.

Unit tests cover the places where bugs actually hide:

- Coordinate conversion between screen pixels and pitch units, in both rotations.
- Ball snapping, attaching, detaching, and the counter-deletion case.
- Undo and redo across every action type, including that a drag produces exactly one
  undo entry.
- Storage round-trips, version rejection, import collision handling, and corrupt-data
  recovery.

Component tests cover counter dragging and arrow drawing through simulated pointer
events.

Pitch marking geometry *is* unit tested, contrary to this section's original position.
The distinction that changed the decision: a test restating circle radii would indeed be
worthless, but a test asserting *invariants* is not. The suite checks that every marking
falls inside the coordinate space and that each arc's endpoints genuinely lie on the
circle its own radius and centre claim. The second of those caught a real defect — the
penalty arc's endpoints had been derived from the wrong quantity, so the rendered "D" was
not centred on the penalty spot.

What remains untested is whether the pitch *looks* right, which was verified by hand in a
browser instead.

## Dependencies

Pinned to exact versions, no range prefixes.

| Package | Version |
| --- | --- |
| vue | 3.5.41 |
| vite | 8.2.1 |
| @vitejs/plugin-vue | 6.0.8 |
| typescript | 6.0.3 |
| vue-tsc | 3.3.10 |
| vitest | 4.1.11 |
| @vue/test-utils | 2.4.11 |
| jsdom | 30.0.1 |
