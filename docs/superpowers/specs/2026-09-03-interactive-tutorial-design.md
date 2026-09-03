# Interactive tutorial

## The problem

A coach opening this app for the first time sees an empty pitch, a rail of
eight icons, and a timeline with one phase in it. Nothing on screen says
that a drill is built by moving players between phases, which is the one
idea the whole app rests on. The Help panel explains it, but Help is a wall
of text a coach opens after they are already stuck, and it teaches by
description rather than by doing.

The tutorial teaches the spine of the app — place, phase, move, play — by
having the coach actually do it on the real board, and then hands them off
to Help for everything else.

## Shape

A guided tour that watches the board rather than driving it. Each step
spotlights one control, says one thing, and completes only when the coach
performs the action for real. The overlay never takes the pointer: the coach
presses the actual rail, drags the actual player. Nothing is simulated.

Rejected: a passive click-through carousel of coach-marks. It costs the same
overlay work and teaches nothing — a coach who reads nine cards has read nine
cards. Also rejected: a scripted demo that animates the board for them, which
is a video with extra steps.

## Scope

Eight steps: an opening card, six things to do — place players, label one,
add a phase, move into it, draw a pass, watch it back — and a signpost.
Watching it back comes last of the six deliberately: a playback taken before
the pass is drawn is a playback of a drill the coach has not finished. The
signpost names what the tour did not cover — curved runs, groups, saving
and sharing, presentation mode — and offers a button that closes the tour and
opens Help.

Not taught by the tour: cones, text labels, ball possession, sessions, export,
undo. All are in Help, and the tour's job is the spine, not the whole surface.

## Data

Steps are data, not components. One array, one file.

```ts
export type TutorialStep = {
  /** Stable across reorders; the persisted progress records it. */
  id: string
  title: string
  /** One or two sentences. Plain text, no markup. */
  body: string
  /**
   * CSS selector for the element to spotlight. Absent means a card centred
   * on the screen with nothing cut out, which is what the opening and
   * closing steps want.
   */
  anchor?: string
  /**
   * What the coach has to do. Absent means the step advances on a Next
   * press, which is the right control for a step that only says something.
   */
  goal?: (board: Board) => boolean
}
```

`Board` is the object `useBoard()` returns. A goal is a pure predicate over
it, so every goal is testable headlessly against a real board with no DOM.

### The steps

| id | Anchor | Completes when |
| --- | --- | --- |
| `welcome` | — | Next |
| `place` | `[data-add-counter="red"]` | Three or more players are on the board |
| `label` | `[data-counter]` | Any player has a non-empty label |
| `phase` | `[data-add-frame]` | The drill has two or more phases |
| `move` | `[data-counter]` | A player stands somewhere other than where they stood on the previous phase |
| `pass` | `[data-tool="arrow-pass"]` | A drawing with `kind: 'arrow'` and `style: 'pass'` exists |
| `play` | `[data-play]` | The drill is playing, or the playhead has left zero |
| `more` | `[data-help]` | Next, or the Open Help button |

Every anchor already exists in the markup. `data-add-counter`,
`data-add-frame`, `data-play`, `data-tool`, `data-counter` and `data-help`
are attributes those components carry today for their own reasons. No
component gains an attribute for the tutorial's sake, and no component
imports it.

The two steps about a player point at one rather than at a control, and
`[data-counter]` resolves to the first player on the pitch. They have to
point at something: pressing a colour drops players at the middle of the
pitch, which is exactly where a card with no anchor sits, so an anchor-less
`label` step covered the very players it asked the coach to press. Only the
opening card has nothing to point at.

Three players rather than two on `place`: two is a pass, three is a drill,
and the extra press costs nothing while making the pitch look like something
worth playing back.

The `move` goal is deliberately "anyone moved", not "the player you were
told to move". A coach who drags a different player has understood the
lesson.

The `pass` goal reads the drawing as it is being drawn, so a stroke too short
to survive `finishDrawing` still completes the step. That is the right way
round: the coach chose the tool and drew on the pitch, which is the lesson.

## Persistence

One key beside the existing ones, `fct.tutorial.v1`, holding
`{ seen: boolean }`. Written when the tour is finished or skipped; read once
at startup. It is a flag, not a resume point — a coach who skipped at step 3
and comes back wants to start at the beginning, not at step 3.

A second key, `fct.tutorial-park.v1`, holds `{ patternId, name }` — which
saved drill the board was showing when the tour started. It exists only
between the start of a tour and its end. The board itself is not parked
here; the draft already does that (see below).

Both are read through the same guarded shape the existing storage uses: a
malformed or unreadable value is treated as absent rather than thrown.

## Starting

The tour starts by itself once, on a first visit: no `fct.tutorial.v1` and no
saved draft. It never starts on a coach who has work in progress, because a
first visit does not have any, and a first visit has no dialog open either.

Afterwards it starts only from a "Take the tour" button at the top of the
Help panel, beside the Close button. A coach who skipped it, or who wants it
again, opens Help and presses that.

The tour refuses to start while presenting, and while the drill is playing or
being scrubbed — the same `presenting` and `isDerived` conditions the rest of
the app already reasons about, checked in App and again in the tour's own
`start`, which reports whether it actually began.

There is deliberately no `isDialogOpen` check. Only two things start a tour,
and neither can run with a dialog in the way: the first-visit autostart fires
before anything is open, and the Help button closes Help on its way through.
A guard here would be a condition with no reachable case, and `isDialogOpen`
is wanted for the opposite purpose — see the note on shortcuts below.

## The parked drill

The tour needs an empty board. The coach may not have one.

The board is parked in the draft, which is where the working board already
lives. On start the tour writes the current board to the draft immediately —
synchronously, rather than waiting on the 400ms debounce — parks the pattern
id and name under `fct.tutorial-park.v1`, clears both, and empties the board.
On finish or skip it reads the draft back onto the board, restores the id and
name, and deletes the park key.

Reusing the draft rather than inventing a second snapshot store means the
tour needs no snapshot validator of its own, and it makes an interrupted tour
correct for free: while the tour runs the draft is not written, so it still
holds the coach's drill, and a refresh restores it through the startup path
that already exists. All the startup needs to add is the park key — present
means restore the id and name and delete it, without starting a tour.

Emptying is `resetBoard` followed by `clearHistory`; restoring is
`restoreSnapshot` followed by `clearHistory`. Neither may leave an undo
entry: the tour is not something the coach did, and a coach must not be able
to Ctrl+Z from their restored drill back into a half-finished tour board.
`resetBoard` deliberately keeps the pitch type and rotation, so a tour taken
on a portrait phone runs on the pitch the coach was already looking at.

`clearHistory` is new — a small addition to `useBoard` that empties the undo
and redo stacks. Nothing else in the app has needed it, because nothing else
puts state on the board that the coach did not put there.

Clearing the pattern id and name is what stops the autosave writing the
tour's board over the coach's saved drill: `scheduleAutosave` already returns
early when there is neither, so parking makes the existing guard do the work.
The draft watcher is suspended outright while the tour is active, for the
reason above.

## The overlay

`TutorialOverlay.vue` renders when the tour is active. Two parts.

**The spotlight.** Four fixed-position dimmed rectangles surrounding the
anchor's bounding box, leaving a hole over it. Four boxes rather than an SVG
mask or a giant `box-shadow`: it is the one approach where the hole genuinely
has nothing over it, so the coach's press reaches the control underneath with
no `pointer-events` juggling. With no anchor, one dimmed rectangle over
everything.

The anchor rect is read with `getBoundingClientRect` and refreshed on window
resize, on scroll, and by a `ResizeObserver` on the anchor. An anchor that
does not resolve — a control not on screen at this width — degrades to the
no-anchor case: the card still shows, centred, and the step still completes
when the coach does the thing.

**The card.** Step title, body, a step counter, Skip, Back, and either Next
or a line saying what to do. Skip reads Finish on the last card: the button
does the same thing throughout, but a coach who has reached the end has
finished the tour rather than walked out of it. It is the only part of the overlay that takes
the pointer.

The card is placed on whichever side has room, measured against the viewport,
falling back to centred. Two things shape that search.

It clears the anchor's group rather than the anchor. A control that hugs an
edge nearly always sits in a block of its neighbours — the rail's colours are
a grid two columns wide — and a card that steps past the red swatch alone
still covers the blue one beside it. The anchor's parent element is that
block, which costs no per-step knowledge and no new markup. A group too big
to step around, the whole pitch behind a player, leaves the anchor itself.

And the axis is chosen from which edge that box is nearest, because
neighbours run along the edge their block hugs: the card steps sideways off
the rail rather than down it. An anchor out in the middle of the pitch has no
such run, and below reads better than beside.

The spotlight still cuts its hole over the anchor alone. The group is about
what the card must not cover, not about what the coach is being shown.

That measurement is also what makes one step work in both of the rail's
layouts — down the edge on a desktop, along the bottom on a portrait phone —
rather than a per-step opinion about direction.

The whole overlay carries `data-transient`, so an export taken mid-tour is
clean, matching how the bend handles and endpoint rings are already treated.

## Behaviour during a step

The board is fully live. Every tool works, undo works, the coach can wander.
A step completes the moment its goal reads true and not before; a coach who
does the next step's action early completes that step early too, because each
step's goal is checked on entry as well as on change.

Advancing is a watcher over `board.state` — the same deep watch the autosave
already uses — and over `board.playback`, which is a separate reactive object
and the only thing the `play` goal reads. Plus a check when the step becomes
current. Goals are cheap predicates over data that is already reactive, so
there is nothing to throttle.

Back re-enters an earlier step without undoing anything. The board keeps
whatever the coach built; the card just says the earlier thing again. Undoing
their work to move a card backwards would be a surprise, and the goals are
satisfied-or-not rather than a sequence.

Skip ends the tour from any step, restores the parked drill, and records
`seen`. Escape does the same, handled through `closeTopmostDialog` so that
the tour sits in the app's one existing precedence order rather than
competing with it. It sits above every panel: a tour is the outermost thing
on screen while it runs.

## Accessibility

The card is `role="dialog"` with an accessible name from its title, and the
step counter is announced. The body text and the completion state live in an
`aria-live="polite"` region, so a step completing is spoken rather than only
seen.

Focus is not trapped, deliberately: the coach has to reach the real controls,
and a trap would put the tour's own card between them and the board. Tab
order is the page's, with the card last.

The dimming is decoration. Every step's instruction is in the card's text, so
a coach who cannot see the spotlight can still follow the words.

## Files

- `src/tutorial/steps.ts` — the step array and the `TutorialStep` type.
- `src/composables/useTutorial.ts` — the machine: `active`, `stepIndex`,
  `step`, `start`, `next`, `back`, `skip`, `finish`, and the park/unpark
  pair. A module-level singleton, like `useBoard`.
- `src/components/TutorialOverlay.vue` — spotlight and card.
- `src/components/HelpPanel.vue` — a Take the tour button in the header, and
  an emitted event for it.
- `src/composables/useBoard.ts` — a `clearHistory()` export.
- `src/App.vue` — mounts the overlay, wires the Help button, adds the tour to
  `closeTopmostDialog`, suspends the draft watcher while the tour is active,
  and restores an interrupted park on startup. Not `isDialogOpen`: that
  computed's one consumer is the keyboard-shortcut gate, and folding the
  tour into it there would contradict "Every tool works" above by disabling
  every shortcut, tool letters included, for the length of the tour.

The storage helpers for both keys live in `useTutorial.ts` rather than
`useStorage.ts`. `useStorage` is about drills; the tour's two keys are about
the app's own state, and putting them there would be the only reason that
file knew the tutorial existed.

## Testing

- Goals: each predicate against a real `useBoard`, false before the action
  and true after. The `move` goal specifically returns false on the first
  phase, where there is no previous frame to have moved from.
- The machine: start writes the board to the draft, empties the board and
  parks the pattern id and name; finish and skip both put the board, id and
  name back; neither leaves an undo entry; both record `seen` and delete the
  park key.
- `clearHistory` leaves `canUndo` false and a following `undo` a no-op.
- Startup: a park key present restores the pattern id and name and clears the
  key without starting a tour. A first visit with no draft and no `seen`
  starts one. A visit with `seen` does not. A visit with a draft does not.
- Advancing: a step with a goal advances when the board changes to satisfy
  it, and a step whose goal is already true on entry advances immediately.
- The overlay: renders the card for the current step; resolves an anchor to
  a spotlight; falls back to centred when the anchor is missing from the DOM;
  carries `data-transient`.
- Escape ends the tour, and does so before it reaches any other dialog.

## Deliberately not built

Resuming a tour part-way through. Branching or optional steps. A tour that
covers every tool. A second tour for advanced features — the signpost step
sends people to Help, which is where that material already lives and where it
can be kept up to date in one place.

Driving the board on the coach's behalf, in any step. If a step cannot be
expressed as "here is the control, do the thing", it does not belong in the
tour.
