# Session Plans and Tags — Design

**Date:** 2026-08-26
**Status:** Approved

## Purpose

Coaches plan a session, not a drill. The app exports one PNG or one GIF per
pattern, so a Tuesday evening built from six drills leaves the coach holding
six files and no document. A session plan is the missing thing above the
pattern: a named, ordered, timed list of drills that exports as one PDF a
coach can print and carry.

Tags land at the same time because they serve the same moment. Choosing the
six drills out of fifty is the hard part of building a session, and the
library is a flat list.

## Decisions

Settled with the owner before any code:

- **A real PDF file**, not a printable page and not a tall PNG. It costs a
  dependency; it buys page breaks, selectable text and a document a coach can
  send to an assistant.
- **A session is a saved entity**, stored beside patterns, reopened and
  edited next week. Not a one-off tick-and-export.
- **A session entry holds minutes and nothing else descriptive.** Notes stay
  on the drill, where they already live, so no fact has two owners.
- **Deleting a drill warns when sessions use it**, rather than cascading
  silently or refusing.
- **Four frames per drill in the PDF** — the first, the last, and two evenly
  spaced between them.
- **Tags filter both the library and the drill picker.** The picker is where
  a fifty-drill library actually hurts.
- **No backward compatibility.** The app is still in development and no saved
  data outside this repository matters, as when the ball became a list.
- **The `BoardView` extraction lands first**, on its own, before anything is
  built on it.

### Why the warning is not the whole answer

A warning is bypassable by design — the coach may well mean it. An id can
also be orphaned with no delete involved: a cleared library, an import onto a
second device, a browser wiped. So a session entry whose pattern is missing
still has to render as something, and it renders as a missing row the coach
can remove. The warning prevents the common accident; the missing row handles
every other route to the same state.

### Why sessions reference patterns rather than containing them

A drill fixed after a session was built should be fixed in that session too.
Copying the pattern into the session would freeze it, and a coach who edits a
rondo would have no way to know which of their sessions still hold last
month's version. The cost is dangling references, which is a bounded problem
with the two answers above. The benefit is that there is one copy of every
drill.

## Data model

### Tags on the pattern

```ts
tags?: string[]
```

Optional because most drills have none, not for compatibility: absent reads
as empty. **No schema version bump.** The two bumps this format has had —
drawings moving onto frames in v2, one ball becoming a list in v3 — both
moved data that already existed and so needed a migration on the way in.
Tags need no migration, so a bump would record a change that changes nothing
about how a pattern is read.

`parsePattern` gains a check that a present `tags` is an array of strings and
rejects anything else, to the same standard every other field is held to.

Tags are normalised on write: trimmed, lowercased, deduplicated, empties
dropped. A tag is a label rather than free text, and `Rondo` and `rondo `
sitting in the filter row as two separate chips is a bug whose cause is
invisible to the person looking at it.

### The session

```ts
export type SessionEntry = {
  /** This entry's own identity, distinct from the drill it points at. */
  id: string
  patternId: string
  /** How long this drill runs, in minutes. */
  minutes: number
}

export type Session = {
  id: string
  name: string
  version: 1
  entries: SessionEntry[]
  createdAt: string
  updatedAt: string
}
```

`SessionEntry.id` exists because a drill can appear twice in one session —
the warm-up rondo run again at the end is an ordinary session, not an edge
case. Keying a list render or a reorder on `patternId` breaks the moment it
happens.

`Session.version` is a separate line from `Pattern.version`, starting at 1.
Sessions reference patterns rather than containing them, so a change to the
pattern format never changes the session format, and tying the two numbers
together would force a rewrite of every session to record a change that did
not affect them.

`minutes` is validated exactly as `frame.duration` already is: a finite
number greater than zero. It is the same kind of value with the same failure
if it is not.

## Storage

Sessions live under `fct.sessions.v1`, with the disciplines the library
already has. An unreadable top-level value is never written over. Rows that
fail to parse are carried through every write untouched rather than dropped,
because a session the code failed to understand is still the coach's work.

That logic — the read that separates unreadable from damaged, the write that
puts damaged rows back, the recording of whether a write landed — is what
sessions need verbatim. It is lifted out of `useStorage.ts` into a generic
collection helper parameterised by a storage key and a parse function, and
both patterns and sessions sit on it. Copying it instead is how two copies
drift and only one of them gets the next fix. The pattern-specific
validators, and the pattern API itself, do not move.

`sessionsUsing(patternId): Session[]` backs the delete warning. It reads one
key at the moment a coach has already paused over a confirmation, so its cost
does not matter.

### The import trap

`importPatterns` deliberately re-ids any incoming pattern whose id already
exists, so importing can never silently overwrite existing work. That means a
file carrying sessions alongside patterns would land with every `patternId`
in it pointing at an id that had just changed, and the coach would open a
session of entirely missing drills.

So the export file becomes an object holding both lists, and the import
threads its old-id to new-id remapping through the incoming sessions' entries
before writing them.

The bare array this file used to be is **not** read back. Nothing outside this
repository has an exported file, and carrying a second accepted shape through
the validator forever to rescue data that does not exist is a cost with no
payer. The remapping itself stays: it guards a collision between two live
libraries, which is a thing that will happen on the coach's second device
whatever the file format is.

## Rendering drills that are not open

`useBoard()` is a module-level singleton, and `PitchBoard` renders *the*
board rather than an arbitrary pattern. A session PDF needs images of four
frames each from several drills, none of which are open.

The presentational core of `PitchBoard` is extracted into `BoardView.vue`,
taking `frame`, `pitch`, `labelsVisible` and `ballsVisible` as props and
importing `useBoard` not at all. It draws the pitch, markings, drawings,
cones, players, labels and balls. It does not know what a selection is.

The seam already exists in the code: `PitchBoard` renders `view.*`, the
tweened view during playback, rather than `state.*`. So `BoardView` takes a
frame-shaped object, `PitchBoard` hands it the tweened view, and the exporter
hands it a stored frame. Playback needs no special case.

Selection rings paint underneath the tokens and handles paint over them, so
neither can sit outside `BoardView` without breaking that order. `BoardView`
gives them two named slots, `under-tokens` and `over-tokens`, and keeps the
z-order in the one file that draws it. `PitchBoard` fills both; the exporter
fills neither, so an exported board carries no furniture by construction
rather than by remembering to strip it.

Slots rather than a `haloes` prop because the furniture is markup, not data:
the rings, the bend and end handles and the marquee are four different shapes
with their own components, and a prop would mean `BoardView` importing all of
them to render things it has no business knowing about.

`BoardView` owns the `<svg>` element, exposing it for the exporter and for
`PitchBoard`, whose pointer handlers reach it through ordinary attribute
fallthrough onto that single root. Every handler, the drag state and the
selection model stay in `PitchBoard`.

`renderFrameToDataUrl(pattern, frameIndex)` mounts `BoardView` into a detached
element with `createApp`, passes its SVG to the existing `svgToPngBlob`, and
unmounts. A detached node rasterises identically to a live one because
`boardDataUrl` serialises a clone and reads the `viewBox` attribute — there
is no `getBBox` call, no computed style, and no dependence on layout.

Two deliberate differences from the PNG export:

- **Notes are passed as an empty string.** `svgToPngBlob` bakes notes into
  pixels beneath the board because a still image has nowhere else to put
  them. A PDF does, and text drawn by the PDF stays selectable, searchable
  and sharp at print resolution.
- **A smaller pixel width**, around 800 rather than 1600. Each board occupies
  roughly a quarter page, and four frames across several drills is a great
  deal of canvas work to do at twice the necessary resolution.

## The PDF

Built with `jspdf`, pinned to 4.2.1. A4 portrait, millimetres, `output('blob')`
into the existing `downloadBlob`, named from `slugify(session.name)`.

### Which frames

Up to four per drill, always including the first and the last:

- four frames or fewer: every frame
- more: the frames at `round(i × (n − 1) / 3)` for `i` of 0 through 3

A seven-frame drill gives frames 1, 3, 5 and 7. Captions read "Phase 3 of 7"
rather than "Phase 3", so a page whose sampler skipped frames says so instead
of implying the drill has four.

### Layout

A cover page carries the session name, the date, the drill count, the total
minutes and the running order. Then one drill per page: a heading of position,
name and minutes; the tags in small type beneath it; the board grid; the
drill's notes.

The grid follows the number of frames sampled. Four fill a two-by-two; three
take the same grid with a gap; two sit side by side; one spans the full width.
A single-frame drill is the ordinary case for a shape or a set piece and
deserves the large picture rather than a quarter page beside three holes.

Boards are 100 by 64.76 pitch units, so a two-by-two cell on a 210mm page is
roughly 85mm by 55mm, which is legible on paper. A rotated board is given the
same box and letterboxed inside it, so a session mixing orientations still
prints on a straight grid.

A drill whose `notesVisible` is off prints no notes, and its board grid
takes the freed height. The PNG export already holds that rule — notes the
coach has turned off are off everywhere — and a session that reinstated them
would be exporting something they had explicitly hidden.

Notes are wrapped with jsPDF's `splitTextToSize` rather than the existing
`wrapNotes`, which measures through a canvas 2D context that knows nothing of
the font metrics the PDF will use. Each layout engine wraps its own text, or
the line breaks land somewhere other than where they were measured.

Notes longer than their page get what fits plus a line saying the notes
continue in the app. This is a bounded page count chosen over an
unpredictable one; a drill whose notes need two pages is rarer than a coach
wanting to know how long the document will be.

## Interface

Every control is a button. Anything reachable only from a keyboard is, on the
tablet this board mostly runs on, not reachable at all.

**The saved-drills panel** gains a Tags button on each row, opening an inline
comma-separated field shaped like the rename affordance beside it, and a row
of tag chips above the list built from every tag in use. Chips are
multi-select and combine with AND: "rondo" and "U12" together is the question
a coach with fifty drills is asking. Its delete confirmation gains a line
naming how many sessions use the drill.

`TagFilter.vue` is extracted rather than written twice, because the drill
picker needs the same row.

**`SessionLibrary.vue`** lists sessions with New, Open, Rename and Delete,
close enough in shape to the saved-drills panel to read as its sibling.

**`SessionPlan.vue`** holds one session: its entries in order, each with the
drill's name, a minutes field, Up and Down, and Remove; a running total in
the header; an Add drill button opening the picker, which is the saved-drills
list under the same tag filter; and Export PDF.

Up and Down rather than drag-to-reorder, because a drag inside a scrolling
panel on a touchscreen fights the scroll, and the list is short.

A Sessions button in the toolbar, beside the existing library button, is the
way in.

The export reuses the existing `exporting` guard and the `notice` progress
callback, so the coach reads "Building the session… 3 of 8" exactly as the
GIF export already reports. It does not use `board.beginExport()`: the GIF
export locks the board because it drives the live playhead, and the session
export never touches the live board at all. The coach can keep working while
a session renders, and a failure halfway through cannot strand their board.

## Sequencing

This is two pieces of work, and they land in order.

**First, the `BoardView` extraction on its own.** It changes no behaviour, so
its proof is that `PitchBoard`'s existing tests pass untouched, along with
the drawing, selection and playback suites around it. Landing it alone means
that if a board stops rendering correctly, there is exactly one commit it can
have come from — rather than a diff that also carries a new dependency, a new
storage key and two new panels.

It is also the piece most likely to surface something unforeseen: it is the
largest component in the app and the only part of this work that edits code
already carrying the coach's daily use.

**Then sessions and tags**, which is everything else here. It depends on the
extraction only through `renderFrameToDataUrl`.

## Errors

- **A missing drill** in a session renders as a removable missing row, and is
  skipped by the PDF.
- **An unreadable sessions key** blocks writes and says so, exactly as the
  library does, rather than overwriting what it could not read.
- **A damaged session row** is carried through every write and reported by
  count.
- **A failed rasterise** aborts the export with the reason in the notice. The
  live board is untouched, so there is nothing to restore.
- **Quota exhaustion** on a session write reports through the existing
  `lastError` path.

## Testing

Unit tests, matching the existing per-area split:

- **Sessions storage** — round trip; damaged rows preserved across writes; an
  unreadable key refusing to be overwritten; `sessionsUsing` finding a drill
  used twice in one session and across two.
- **Tags** — normalisation of case, whitespace and duplicates; a present but
  malformed `tags` rejected; a pattern without tags reading as empty.
- **Import and export** — a bundle round trip; a colliding pattern id
  re-mapped through its sessions' entries; a bare-array file still read as
  patterns.
- **Frame sampling** — one, two, three, four and seven frames; the first and
  last always present; captions naming the true total.
- **`BoardView`** — renders the pieces of a frame handed to it directly, with
  no board state involved; `labelsVisible` and `ballsVisible` respected.
- **Session PDF** — the jsPDF calls are asserted through a stub, as the GIF
  export's encoder already is: page count, cover totals, and a missing drill
  skipped.

`PitchBoard`'s existing tests are the check that the extraction preserved
behaviour, and they should pass untouched.

## Out of scope

- Reordering a session by dragging.
- Session-specific notes on an entry.
- Printing every frame of a drill.
- Tag rename or delete as a library-wide operation; a tag exists as long as a
  drill uses it.
