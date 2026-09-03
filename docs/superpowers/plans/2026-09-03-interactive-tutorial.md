# Interactive Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An eight-step guided tour that teaches the spine of the app — place, label, phase, move, play, pass — by watching the coach do it on the real board, then signposts Help.

**Architecture:** Steps are data with pure predicates over `useBoard`. A module-level composable holds the machine and parks the coach's drill in the existing draft while the tour runs. One overlay component draws a spotlight round an anchor that already exists in the markup and a card beside it. App wires the three together.

**Tech Stack:** Vue 3.5 `<script setup>`, TypeScript, Vitest 4, @vue/test-utils 2.

**Spec:** `docs/superpowers/specs/2026-09-03-interactive-tutorial-design.md`

## Global Constraints

- Every anchor already exists in the markup. No component gains an attribute
  for the tutorial's sake, and no component imports the tutorial except
  `App.vue` and `HelpPanel.vue` (which only emits).
- Parking and unparking must never leave an undo entry.
- Goals are pure predicates over the object `useBoard()` returns. No DOM, no
  side effects, no `await`.
- The overlay carries `data-transient` so `useExport` strips it.
- Comments explain why, not what, in the voice of the surrounding code.
- Run `npx vue-tsc --noEmit` and `npm test` before every commit. Both must be
  clean.
- Never use `^` or `~` in `package.json`. This feature adds no dependencies.

---

## File Structure

- `src/tutorial/steps.ts` (new) — the `TutorialStep` type, the `Board` alias,
  and the `STEPS` array with its goal predicates. No Vue, no DOM.
- `src/composables/useTutorial.ts` (new) — the machine and its two
  localStorage keys. Owns start, advance, back, end, and the park.
- `src/components/TutorialOverlay.vue` (new) — spotlight boxes and the card.
- `src/composables/useBoard.ts` (modify) — gains `clearHistory()`.
- `src/components/HelpPanel.vue` (modify) — a Take the tour button and a
  `startTour` emit.
- `src/App.vue` (modify) — mounts the overlay, starts and ends the tour, and
  keeps the draft and autosave out of its way.

---

### Task 1: `clearHistory` on the board

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `clearHistory(): void` on the object `useBoard()` returns.

- [ ] **Step 1: Write the failing tests**

Append to `tests/useBoard.spec.ts`. The file already imports `useBoard` and
`__resetBoardForTests` and has a `beforeEach` that resets the board.

```ts
/**
 * For state the coach did not put on the board. The tutorial parks their
 * drill and hands it back, and without this a coach could Ctrl+Z from their
 * restored drill into a half-finished tour board.
 */
describe('clearHistory', () => {
  it('leaves nothing to undo', () => {
    const board = useBoard()
    board.addCounter('red')
    expect(board.canUndo.value).toBe(true)
    board.clearHistory()
    expect(board.canUndo.value).toBe(false)
  })

  it('makes a following undo a no-op rather than a throw', () => {
    const board = useBoard()
    board.addCounter('red')
    board.clearHistory()
    board.undo()
    expect(board.state.counters).toHaveLength(1)
  })

  it('drops the redo stack too', () => {
    const board = useBoard()
    board.addCounter('red')
    board.undo()
    expect(board.canRedo.value).toBe(true)
    board.clearHistory()
    expect(board.canRedo.value).toBe(false)
  })

  it('leaves the board itself alone', () => {
    const board = useBoard()
    const counter = board.addCounter('blue')
    board.clearHistory()
    expect(board.counterById(counter.id)!.color).toBe('blue')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/useBoard.spec.ts -t clearHistory`
Expected: FAIL — `board.clearHistory is not a function`.

- [ ] **Step 3: Add the function**

In `src/composables/useBoard.ts`, put this immediately after `restoreSnapshot`:

```ts
/**
 * Empty the undo and redo stacks.
 *
 * For board state the coach did not put there. The tutorial parks their
 * drill, runs on an empty board and hands the drill back, and none of those
 * three are things a coach should be able to walk backwards into.
 *
 * The stroke entries go too: they are looked up by identity in the stacks
 * that are being emptied, so a stroke whose start survived this call would
 * find nothing to take back on release.
 */
function clearHistory(): void {
  undoStack.value = []
  redoStack.value = []
  strokeUndoEntries.clear()
}
```

`strokeUndoEntries` is declared further down the file, at module scope, so
the reference resolves regardless of where this function sits.

- [ ] **Step 4: Export it**

In the object literal that `useBoard`'s module returns (the long list that
begins `endExport, canRedo, snapshot, ...`), add `clearHistory,` directly
after `restoreSnapshot,`.

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run tests/useBoard.spec.ts && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useBoard.ts tests/useBoard.spec.ts
git commit -m "feat: let the board forget its history"
```

---

### Task 2: The steps

**Files:**
- Create: `src/tutorial/steps.ts`
- Test: `tests/tutorialSteps.spec.ts`

**Interfaces:**
- Consumes: `useBoard` from `src/composables/useBoard.ts`, for its return type.
- Produces:
  - `type Board = ReturnType<typeof useBoard>`
  - `type TutorialStep = { id: string; title: string; body: string; anchor?: string; goal?: (board: Board) => boolean }`
  - `const STEPS: TutorialStep[]` — eight steps, ids in order: `welcome`,
    `place`, `label`, `phase`, `move`, `play`, `pass`, `more`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tutorialSteps.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { STEPS, type TutorialStep } from '../src/tutorial/steps'

beforeEach(() => __resetBoardForTests())

const board = useBoard()

function step(id: string): TutorialStep {
  const found = STEPS.find((s) => s.id === id)
  if (!found) throw new Error(`no step ${id}`)
  return found
}

/** Three players and a second phase: the shape the later goals need. */
function twoPhaseDrill(): string {
  board.addCounter('red')
  board.addCounter('red')
  board.addCounter('blue')
  const id = board.state.counters[0].id
  board.addFrame()
  return id
}

describe('the step list', () => {
  it('runs in the order the tour teaches', () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      'welcome', 'place', 'label', 'phase', 'move', 'play', 'pass', 'more',
    ])
  })

  it('gives every step words to say', () => {
    for (const s of STEPS) {
      expect(s.title.length, s.id).toBeGreaterThan(0)
      expect(s.body.length, s.id).toBeGreaterThan(0)
    }
  })

  /*
   * The opening card and the closing signpost are the only steps a coach
   * advances by pressing Next. Every other step is something they do.
   */
  it('asks for an action everywhere but the ends', () => {
    expect(step('welcome').goal).toBeUndefined()
    expect(step('more').goal).toBeUndefined()
    for (const s of STEPS.slice(1, -1)) expect(s.goal, s.id).toBeTypeOf('function')
  })
})

describe('the place goal', () => {
  it('is false on an empty board', () => {
    expect(step('place').goal!(board)).toBe(false)
  })

  it('is false with two players out', () => {
    board.addCounter('red')
    board.addCounter('red')
    expect(step('place').goal!(board)).toBe(false)
  })

  it('is true with three', () => {
    board.addCounter('red')
    board.addCounter('red')
    board.addCounter('blue')
    expect(step('place').goal!(board)).toBe(true)
  })
})

describe('the label goal', () => {
  it('is false while everyone is unlabelled', () => {
    board.addCounter('red')
    expect(step('label').goal!(board)).toBe(false)
  })

  it('is true once anyone has a label', () => {
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, '9')
    expect(step('label').goal!(board)).toBe(true)
  })
})

describe('the phase goal', () => {
  it('is false on a one-phase drill', () => {
    expect(step('phase').goal!(board)).toBe(false)
  })

  it('is true once there is a second phase', () => {
    board.addFrame()
    expect(step('phase').goal!(board)).toBe(true)
  })
})

describe('the move goal', () => {
  it('is false on a single phase, where nobody can have moved', () => {
    board.addCounter('red')
    expect(step('move').goal!(board)).toBe(false)
  })

  it('is false on a fresh second phase, which is a copy of the first', () => {
    twoPhaseDrill()
    expect(step('move').goal!(board)).toBe(false)
  })

  it('is true once somebody stands somewhere new', () => {
    const id = twoPhaseDrill()
    board.moveCounter(id, { x: 60, y: 20 })
    expect(step('move').goal!(board)).toBe(true)
  })

  /*
   * A coach who steps back to look at the first phase has not undone the run
   * they just drew, so the step must not un-complete under them.
   */
  it('stays true after stepping back to the first phase', () => {
    const id = twoPhaseDrill()
    board.moveCounter(id, { x: 60, y: 20 })
    board.goToFrame(0)
    expect(step('move').goal!(board)).toBe(true)
  })
})

describe('the play goal', () => {
  it('is false on a board that has never been played', () => {
    expect(step('play').goal!(board)).toBe(false)
  })

  it('is true while the drill is playing', () => {
    twoPhaseDrill()
    board.play()
    expect(step('play').goal!(board)).toBe(true)
    board.pause()
  })

  it('stays true once the playhead has left the start', () => {
    twoPhaseDrill()
    board.scrubTo(200)
    expect(step('play').goal!(board)).toBe(true)
  })
})

describe('the pass goal', () => {
  it('is false with nothing drawn', () => {
    expect(step('pass').goal!(board)).toBe(false)
  })

  it('is false for a run arrow, which is the other tool', () => {
    board.startArrow({ x: 10, y: 10 }, '#ffffff', 'run')
    expect(step('pass').goal!(board)).toBe(false)
  })

  it('is true for a pass arrow', () => {
    board.startArrow({ x: 10, y: 10 }, '#ffffff', 'pass')
    expect(step('pass').goal!(board)).toBe(true)
  })

  /*
   * Drawn on the phase the coach was on, which need not be the one they are
   * looking at by the time the watcher runs.
   */
  it('finds a pass drawn on another phase', () => {
    board.startArrow({ x: 10, y: 10 }, '#ffffff', 'pass')
    board.addFrame()
    board.goToFrame(1)
    expect(step('pass').goal!(board)).toBe(true)
  })
})

describe('anchors', () => {
  it('name controls, and only the steps that point at one have them', () => {
    expect(step('welcome').anchor).toBeUndefined()
    expect(step('place').anchor).toBe('[data-add-counter="red"]')
    expect(step('phase').anchor).toBe('[data-add-frame]')
    expect(step('play').anchor).toBe('[data-play]')
    expect(step('pass').anchor).toBe('[data-tool="arrow-pass"]')
    expect(step('more').anchor).toBe('[data-help]')
  })
})
```

Before writing the implementation, confirm `startArrow`'s real signature by
reading `src/composables/useBoard.ts` — if it differs from
`startArrow(from, color, style)`, adjust the three calls above to match it
rather than changing the goal.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/tutorialSteps.spec.ts`
Expected: FAIL — cannot resolve `../src/tutorial/steps`.

- [ ] **Step 3: Write the steps**

Create `src/tutorial/steps.ts`:

```ts
import type { useBoard } from '../composables/useBoard'

/** The board, as every goal sees it. */
export type Board = ReturnType<typeof useBoard>

export type TutorialStep = {
  /** Stable across reorders. */
  id: string
  title: string
  /** One or two sentences. Plain text, no markup. */
  body: string
  /**
   * CSS selector for the control to spotlight. Absent means a card centred
   * on the screen with nothing cut out, which is what the opening and
   * closing steps want.
   */
  anchor?: string
  /**
   * What the coach has to do. Absent means the step advances on a press,
   * which is the right control for a step that only says something.
   */
  goal?: (board: Board) => boolean
}

/**
 * The tour, in order.
 *
 * Every anchor is an attribute the app already carries for its own reasons,
 * so no component knows the tour exists. Goals are deliberately loose: they
 * ask whether the coach has done the KIND of thing the step teaches, not
 * whether they did it to the letter. Someone who drags a different player
 * has understood the lesson.
 */
export const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the board',
    body: 'Two minutes and you will have a drill that plays back. Anything you had on the pitch is parked safely and comes back when the tour ends.',
  },
  {
    id: 'place',
    title: 'Put some players out',
    body: 'Press a colour in the rail to drop a player in the middle, or drag one straight onto the spot you want. Put out three.',
    anchor: '[data-add-counter="red"]',
    goal: (board) => board.state.counters.length >= 3,
  },
  {
    id: 'label',
    title: 'Give one a number',
    body: 'Double-press a player and type up to four characters. Most drills read fine from colour alone, so this is for the player the session is about.',
    goal: (board) => board.state.counters.some((c) => c.label !== ''),
  },
  {
    id: 'phase',
    title: 'Add a phase',
    body: 'A drill is a handful of moments. Press Add phase — the new one starts as a copy of this one, so you move what is already there.',
    anchor: '[data-add-frame]',
    goal: (board) => board.state.frames.length >= 2,
  },
  {
    id: 'move',
    title: 'Move somebody',
    body: 'Drag a player somewhere new. The gap between where they stood on the last phase and where they stand on this one is their run.',
    goal: (board) =>
      board.state.frames.some((frame, index) => {
        if (index === 0) return false
        const before = board.state.frames[index - 1]
        return frame.counters.some((counter) => {
          const was = before.counters.find((c) => c.id === counter.id)
          return !!was && (was.pos.x !== counter.pos.x || was.pos.y !== counter.pos.y)
        })
      }),
  },
  {
    id: 'play',
    title: 'Play it back',
    body: 'Press Play. Everyone travels from where they were to where they are, over the time the phase is given.',
    anchor: '[data-play]',
    // `at` outlasts `playing`, so the step stays complete after playback ends.
    goal: (board) => board.playback.playing || board.playback.at > 0,
  },
  {
    id: 'pass',
    title: 'Draw a pass',
    body: 'Pick Pass in the rail and drag from one player to another. Run is the same gesture with a solid arrow.',
    anchor: '[data-tool="arrow-pass"]',
    /*
     * Read across every phase, not just the one on screen: a coach who drew
     * the pass and then stepped to the next phase has still drawn it. Read
     * while the stroke is live, too, so a stroke too short to survive
     * `finishDrawing` still completes the step — choosing the tool and
     * drawing on the pitch is the lesson.
     */
    goal: (board) =>
      board.state.frames.some((frame) =>
        frame.drawings.some((d) => d.kind === 'arrow' && d.style === 'pass'),
      ),
  },
  {
    id: 'more',
    title: 'That is the spine of it',
    body: 'Curved runs, moving players as a group, saving to your library and presenting full screen are all in Help, along with every keyboard shortcut.',
    anchor: '[data-help]',
  },
]
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/tutorialSteps.spec.ts && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/tutorial/steps.ts tests/tutorialSteps.spec.ts
git commit -m "feat: write the tutorial's steps and their goals"
```

---

### Task 3: The machine

**Files:**
- Create: `src/composables/useTutorial.ts`
- Test: `tests/useTutorial.spec.ts`

**Interfaces:**
- Consumes: `STEPS`, `TutorialStep` from `src/tutorial/steps.ts`;
  `useBoard`, `clearHistory` from `src/composables/useBoard.ts`;
  `useStorage` (`saveDraft`, `loadDraft`) from `src/composables/useStorage.ts`.
- Produces, from `useTutorial()`:
  - `active: Ref<boolean>`, `stepIndex: Ref<number>`,
    `step: ComputedRef<TutorialStep | null>`, `steps: TutorialStep[]`
  - `start(park: TutorialPark): void`
  - `end(): TutorialPark`
  - `next(): void`, `back(): void`
  - `hasSeen(): boolean`
  - `takePark(): TutorialPark | null`
  - `type TutorialPark = { patternId: string | null; name: string }`
  - `TUTORIAL_KEY`, `TUTORIAL_PARK_KEY` string constants
  - `__resetTutorialForTests(): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/useTutorial.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { useStorage, DRAFT_KEY } from '../src/composables/useStorage'
import {
  useTutorial,
  __resetTutorialForTests,
  TUTORIAL_KEY,
  TUTORIAL_PARK_KEY,
} from '../src/composables/useTutorial'

const board = useBoard()
const tutorial = useTutorial()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  __resetTutorialForTests()
})

/** A drill worth parking: two players and a name on the board. */
function aDrill(): void {
  board.addCounter('red')
  board.addCounter('blue')
}

describe('starting', () => {
  it('empties the board', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(board.state.counters).toHaveLength(0)
  })

  it('writes the drill to the draft, so nothing is lost', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(useStorage().loadDraft()!.frames[0].counters).toHaveLength(2)
  })

  it('parks which drill it was', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(JSON.parse(localStorage.getItem(TUTORIAL_PARK_KEY)!)).toEqual({
      patternId: 'p1',
      name: 'Rondo',
    })
  })

  it('opens on the first step', () => {
    tutorial.start({ patternId: null, name: '' })
    expect(tutorial.active.value).toBe(true)
    expect(tutorial.step.value!.id).toBe('welcome')
  })

  it('leaves nothing to undo, so the coach cannot walk into the parked board', () => {
    aDrill()
    tutorial.start({ patternId: null, name: '' })
    expect(board.canUndo.value).toBe(false)
  })

  it('keeps the pitch the coach was looking at', () => {
    board.setRotated(true)
    tutorial.start({ patternId: null, name: '' })
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('does nothing if a tour is already running', () => {
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    tutorial.next()
    tutorial.start({ patternId: 'p2', name: 'Other' })
    expect(tutorial.stepIndex.value).toBe(1)
  })
})

describe('ending', () => {
  it('puts the drill back', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    tutorial.end()
    expect(board.state.counters).toHaveLength(2)
  })

  it('hands back which drill it was', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(tutorial.end()).toEqual({ patternId: 'p1', name: 'Rondo' })
  })

  it('closes the tour', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.end()
    expect(tutorial.active.value).toBe(false)
    expect(tutorial.step.value).toBeNull()
  })

  it('records that the coach has seen it', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.end()
    expect(tutorial.hasSeen()).toBe(true)
  })

  it('clears the park, so the next startup does not think a tour was cut short', () => {
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    tutorial.end()
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })

  it('leaves nothing to undo from the restored drill', () => {
    aDrill()
    tutorial.start({ patternId: null, name: '' })
    board.addCounter('red')
    tutorial.end()
    expect(board.canUndo.value).toBe(false)
  })
})

describe('what the coach has seen', () => {
  it('is false on a first visit', () => {
    expect(tutorial.hasSeen()).toBe(false)
  })

  it('survives a malformed value rather than throwing', () => {
    localStorage.setItem(TUTORIAL_KEY, 'not json')
    expect(tutorial.hasSeen()).toBe(false)
  })
})

describe('taking the park', () => {
  it('returns nothing when no tour was interrupted', () => {
    expect(tutorial.takePark()).toBeNull()
  })

  it('returns the parked drill and clears it', () => {
    localStorage.setItem(TUTORIAL_PARK_KEY, JSON.stringify({ patternId: 'p1', name: 'Rondo' }))
    expect(tutorial.takePark()).toEqual({ patternId: 'p1', name: 'Rondo' })
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })

  it('treats a malformed park as absent, and clears it', () => {
    localStorage.setItem(TUTORIAL_PARK_KEY, '{{')
    expect(tutorial.takePark()).toBeNull()
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })
})

describe('moving through the steps', () => {
  it('advances when the coach does the thing', async () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.next() // onto `place`
    board.addCounter('red')
    board.addCounter('red')
    board.addCounter('blue')
    await nextTick()
    expect(tutorial.step.value!.id).toBe('label')
  })

  it('advances straight past a step that is already satisfied', async () => {
    board.addCounter('red')
    tutorial.start({ patternId: null, name: '' })
    // The tour emptied the board, so put three back and step onto `place`.
    board.addCounter('red')
    board.addCounter('red')
    board.addCounter('blue')
    await nextTick()
    tutorial.next()
    await nextTick()
    expect(tutorial.step.value!.id).toBe('label')
  })

  it('goes back without touching the board', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.next()
    board.addCounter('red')
    tutorial.back()
    expect(tutorial.step.value!.id).toBe('welcome')
    expect(board.state.counters).toHaveLength(1)
  })

  it('does not go back past the first step', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.back()
    expect(tutorial.stepIndex.value).toBe(0)
  })

  it('does not run off the end', () => {
    tutorial.start({ patternId: null, name: '' })
    for (let i = 0; i < 20; i++) tutorial.next()
    expect(tutorial.step.value!.id).toBe('more')
  })

  it('ignores next and back while no tour is running', () => {
    tutorial.next()
    expect(tutorial.active.value).toBe(false)
    expect(tutorial.stepIndex.value).toBe(0)
  })
})

describe('the draft the tour writes', () => {
  it('is the coach's board, not the empty one the tour runs on', () => {
    aDrill()
    tutorial.start({ patternId: null, name: '' })
    board.addCounter('red')
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).frames[0].counters).toHaveLength(2)
  })
})
```

The `'is the coach's board'` title contains an apostrophe inside a
single-quoted string. Write that one title with double quotes.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/useTutorial.spec.ts`
Expected: FAIL — cannot resolve `../src/composables/useTutorial`.

- [ ] **Step 3: Write the composable**

Create `src/composables/useTutorial.ts`:

```ts
import { computed, ref, watch } from 'vue'
import { useBoard } from './useBoard'
import { useStorage } from './useStorage'
import { STEPS, type TutorialStep } from '../tutorial/steps'

/** Whether the coach has been through the tour. A flag, not a resume point. */
export const TUTORIAL_KEY = 'fct.tutorial.v1'
/** Which saved drill the board was showing when the tour started. */
export const TUTORIAL_PARK_KEY = 'fct.tutorial-park.v1'

export type TutorialPark = { patternId: string | null; name: string }

const board = useBoard()
const storage = useStorage()

const active = ref(false)
const stepIndex = ref(0)
const step = computed<TutorialStep | null>(() =>
  active.value ? (STEPS[stepIndex.value] ?? null) : null,
)

/*
 * Every read is guarded and every write is swallowed. A coach in a private
 * window, or with a full store, gets a tour that works and forgets it
 * afterwards — which is a great deal better than an app that will not open.
 */
function hasSeen(): boolean {
  try {
    const text = localStorage.getItem(TUTORIAL_KEY)
    if (text === null) return false
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && (value as { seen?: unknown }).seen === true
  } catch {
    return false
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
  } catch {
    // Nothing to do about it, and nothing worth stopping the tour for.
  }
}

function clearPark(): void {
  try {
    localStorage.removeItem(TUTORIAL_PARK_KEY)
  } catch {
    // As above.
  }
}

function readPark(): TutorialPark | null {
  try {
    const text = localStorage.getItem(TUTORIAL_PARK_KEY)
    if (text === null) return null
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return null
    const park = value as { patternId?: unknown; name?: unknown }
    const patternId = typeof park.patternId === 'string' ? park.patternId : null
    const name = typeof park.name === 'string' ? park.name : ''
    return { patternId, name }
  } catch {
    return null
  }
}

/**
 * Read the park left behind by an interrupted tour, and clear it.
 *
 * A refresh mid-tour restores the coach's drill through the draft, which is
 * the ordinary startup path; this is only how the drill's identity gets back
 * to the header. A park that will not parse is still cleared, or it would
 * be read and rejected on every startup from now on.
 */
function takePark(): TutorialPark | null {
  const park = readPark()
  clearPark()
  return park
}

function writePark(park: TutorialPark): void {
  try {
    localStorage.setItem(TUTORIAL_PARK_KEY, JSON.stringify(park))
  } catch {
    // The tour still runs; the drill's name just will not survive a refresh.
  }
}

/**
 * Park the coach's drill and open the tour on an empty board.
 *
 * The board is parked in the draft, which is where the working board already
 * lives — so this needs no snapshot store of its own, and a refresh mid-tour
 * restores the drill through the startup path that exists. The draft write
 * is direct rather than through App's debounce, because the board is about
 * to be emptied and there is no second chance.
 *
 * `resetBoard` keeps the pitch type and rotation, so a tour taken on a phone
 * runs on the pitch the coach was already looking at.
 */
function start(park: TutorialPark): void {
  if (active.value) return
  storage.saveDraft(board.snapshot())
  writePark(park)
  board.resetBoard()
  board.clearHistory()
  stepIndex.value = 0
  active.value = true
}

/**
 * Close the tour and hand back the drill it parked.
 *
 * Restoring is `restoreSnapshot`, not `loadSnapshot`: putting the drill back
 * is not something the coach did, so it must not be undoable — and the
 * history goes with it, or Ctrl+Z would walk from the restored drill into a
 * half-finished tour board.
 */
function end(): TutorialPark {
  const park = readPark() ?? { patternId: null, name: '' }
  const draft = storage.loadDraft()
  if (draft) board.restoreSnapshot(draft)
  board.clearHistory()
  clearPark()
  markSeen()
  active.value = false
  stepIndex.value = 0
  return park
}

function next(): void {
  if (!active.value) return
  if (stepIndex.value >= STEPS.length - 1) return
  stepIndex.value += 1
}

function back(): void {
  if (!active.value) return
  stepIndex.value = Math.max(0, stepIndex.value - 1)
}

/*
 * A step completes when its goal reads true, whether the coach reached it by
 * doing the thing now or had already done it before arriving. `playback` is
 * watched beside `state` because it is a separate reactive object, and the
 * one thing the play goal reads.
 */
watch(
  [() => board.state, () => board.playback, step],
  () => {
    const current = step.value
    if (!current?.goal) return
    if (current.goal(board)) next()
  },
  { deep: true },
)

export function useTutorial() {
  return {
    active,
    stepIndex,
    step,
    steps: STEPS,
    start,
    end,
    next,
    back,
    hasSeen,
    takePark,
  }
}

/** Test-only: put the singleton back to its just-loaded condition. */
export function __resetTutorialForTests(): void {
  active.value = false
  stepIndex.value = 0
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/useTutorial.spec.ts && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useTutorial.ts tests/useTutorial.spec.ts
git commit -m "feat: add the tutorial machine and its parked drill"
```

---

### Task 4: The overlay

**Files:**
- Create: `src/components/TutorialOverlay.vue`
- Test: `tests/TutorialOverlay.spec.ts`

**Interfaces:**
- Consumes: `useTutorial()` — `active`, `stepIndex`, `step`, `steps`, `next`,
  `back`.
- Produces: a component with no props and two emits, `end: []` and
  `openHelp: []`. App owns termination, so the overlay asks rather than does.
- Markup contract the tests and App rely on: root `.tour[data-transient]`,
  card `[data-tour-card]`, buttons `[data-tour-skip]`, `[data-tour-back]`,
  `[data-tour-next]`, `[data-tour-help]`, spotlight boxes `[data-tour-dim]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/TutorialOverlay.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TutorialOverlay from '../src/components/TutorialOverlay.vue'
import { __resetBoardForTests } from '../src/composables/useBoard'
import { useTutorial, __resetTutorialForTests } from '../src/composables/useTutorial'

const tutorial = useTutorial()
let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  __resetTutorialForTests()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

const RECT = {
  left: 100, top: 200, width: 40, height: 40,
  right: 140, bottom: 240, x: 100, y: 200, toJSON: () => ({}),
} as DOMRect

/**
 * Put the red swatch on the page, which is what the `place` step anchors to.
 * jsdom gives every element a zero rect, and a zero rect is how the overlay
 * recognises an anchor that is not really on screen — so it is stubbed.
 */
function redSwatch(): void {
  const el = document.createElement('button')
  el.setAttribute('data-add-counter', 'red')
  el.getBoundingClientRect = () => RECT
  document.body.appendChild(el)
}

function mountOverlay() {
  wrapper = mount(TutorialOverlay, { attachTo: document.body })
  return wrapper
}

describe('when no tour is running', () => {
  it('renders nothing', () => {
    const overlay = mountOverlay()
    expect(overlay.find('.tour').exists()).toBe(false)
  })
})

describe('while the tour runs', () => {
  beforeEach(() => tutorial.start({ patternId: null, name: '' }))

  it('renders the card for the current step', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-card]').text()).toContain(tutorial.steps[0].title)
  })

  /* An export taken mid-tour must not have the tour in it. */
  it('marks itself transient so exports strip it', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('.tour').attributes('data-transient')).toBeDefined()
  })

  it('says which step this is', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-card]').text()).toContain(`1 of ${tutorial.steps.length}`)
  })

  it('offers Next on a step that only says something', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-next]').exists()).toBe(true)
  })

  it('moves on when Next is pressed', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-next]').trigger('click')
    expect(tutorial.stepIndex.value).toBe(1)
  })

  it('offers no Next on a step the coach has to act on', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-next]').trigger('click')
    await nextTick()
    expect(overlay.find('[data-tour-next]').exists()).toBe(false)
  })

  it('cannot go back from the first step', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-back]').attributes('disabled')).toBeDefined()
  })

  it('goes back when Back is pressed', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-next]').trigger('click')
    await overlay.find('[data-tour-back]').trigger('click')
    expect(tutorial.stepIndex.value).toBe(0)
  })

  /* App owns ending, so that the drill and its name come back together. */
  it('asks App to end the tour when Skip is pressed', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-skip]').trigger('click')
    expect(overlay.emitted('end')).toBeTruthy()
  })
})

describe('the last step', () => {
  beforeEach(() => {
    tutorial.start({ patternId: null, name: '' })
    for (let i = 0; i < tutorial.steps.length; i++) tutorial.next()
  })

  it('offers Help instead of Next', async () => {
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.find('[data-tour-next]').exists()).toBe(false)
    expect(overlay.find('[data-tour-help]').exists()).toBe(true)
  })

  it('asks App to open Help', async () => {
    const overlay = mountOverlay()
    await overlay.find('[data-tour-help]').trigger('click')
    expect(overlay.emitted('openHelp')).toBeTruthy()
  })
})

describe('the spotlight', () => {
  it('cuts four boxes round an anchor that is on screen', async () => {
    redSwatch()
    tutorial.start({ patternId: null, name: '' })
    tutorial.next() // `place`, which anchors to the red swatch
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.findAll('[data-tour-dim]')).toHaveLength(4)
  })

  it('covers the screen with one box when the step has no anchor', async () => {
    tutorial.start({ patternId: null, name: '' })
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.findAll('[data-tour-dim]')).toHaveLength(1)
  })

  /*
   * A control that is not on screen at this width — the rail lies down on a
   * phone and not every anchor survives — must not take the step away. The
   * card still shows and the goal still completes.
   */
  it('falls back to the plain card when the anchor is missing', async () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.next()
    const overlay = mountOverlay()
    await nextTick()
    expect(overlay.findAll('[data-tour-dim]')).toHaveLength(1)
    expect(overlay.find('[data-tour-card]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/TutorialOverlay.spec.ts`
Expected: FAIL — cannot resolve `../src/components/TutorialOverlay.vue`.

- [ ] **Step 3: Write the component**

Create `src/components/TutorialOverlay.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useTutorial } from '../composables/useTutorial'

const emit = defineEmits<{ end: []; openHelp: [] }>()

const tutorial = useTutorial()

/** Roughly what the card needs. Used only to choose a side, never to size it. */
const CARD_W = 320
const CARD_H = 190
const GAP = 12

const rect = ref<DOMRect | null>(null)

const isLast = computed(() => tutorial.stepIndex.value === tutorial.steps.length - 1)

/**
 * Measure the current step's anchor.
 *
 * A step with no anchor, and a step whose anchor is not on screen at this
 * width, both land on `null` — the card still shows, centred, and the goal
 * still completes. The tour never depends on a control being visible.
 */
function measure(): void {
  const selector = tutorial.step.value?.anchor
  if (!selector) {
    rect.value = null
    return
  }
  const el = document.querySelector(selector)
  rect.value = el ? el.getBoundingClientRect() : null
}

let observer: ResizeObserver | null = null

function observeAnchor(): void {
  observer?.disconnect()
  observer = null
  const selector = tutorial.step.value?.anchor
  if (!selector || typeof ResizeObserver === 'undefined') return
  const el = document.querySelector(selector)
  if (!el) return
  observer = new ResizeObserver(measure)
  observer.observe(el)
}

async function remeasure(): Promise<void> {
  await nextTick()
  measure()
  observeAnchor()
}

watch(() => tutorial.step.value?.id, remeasure, { immediate: true })

onMounted(() => {
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  void remeasure()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  observer?.disconnect()
})

type Box = { top: string; left: string; width: string; height: string }

function px(n: number): string {
  return `${Math.max(0, Math.round(n))}px`
}

/*
 * Four dimmed rectangles round the anchor rather than an SVG mask or a huge
 * box-shadow. It is the one approach where the hole genuinely has nothing
 * over it, so the coach's press reaches the real control underneath with no
 * pointer-events juggling — and pressing the real control is the whole point.
 */
const dims = computed<Box[]>(() => {
  const r = rect.value
  const w = window.innerWidth
  const h = window.innerHeight
  if (!r || r.width === 0 || r.height === 0) {
    return [{ top: '0px', left: '0px', width: px(w), height: px(h) }]
  }
  return [
    { top: '0px', left: '0px', width: px(w), height: px(r.top) },
    { top: px(r.bottom), left: '0px', width: px(w), height: px(h - r.bottom) },
    { top: px(r.top), left: '0px', width: px(r.left), height: px(r.height) },
    { top: px(r.top), left: px(r.right), width: px(w - r.right), height: px(r.height) },
  ]
})

/**
 * Put the card wherever there is room, measured against the viewport.
 *
 * Below, then above, then to one side, then centred. Chosen by measurement
 * rather than by a per-step opinion about direction, because the rail runs
 * down the edge on a desktop and along the bottom on a portrait phone, and
 * the same step has to work in both.
 */
const cardStyle = computed(() => {
  const r = rect.value
  const w = window.innerWidth
  const h = window.innerHeight
  if (!r || r.width === 0 || r.height === 0) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const clampLeft = (left: number) => px(Math.min(Math.max(GAP, left), Math.max(GAP, w - CARD_W - GAP)))
  const clampTop = (top: number) => px(Math.min(Math.max(GAP, top), Math.max(GAP, h - CARD_H - GAP)))

  if (h - r.bottom >= CARD_H + GAP) {
    return { top: px(r.bottom + GAP), left: clampLeft(r.left) }
  }
  if (r.top >= CARD_H + GAP) {
    return { top: px(r.top - CARD_H - GAP), left: clampLeft(r.left) }
  }
  if (w - r.right >= CARD_W + GAP) {
    return { top: clampTop(r.top), left: px(r.right + GAP) }
  }
  if (r.left >= CARD_W + GAP) {
    return { top: clampTop(r.top), left: px(r.left - CARD_W - GAP) }
  }
  return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
})
</script>

<template>
  <!--
    `data-transient` so an export taken mid-tour is clean, the same way the
    bend handles and endpoint rings are already treated.
  -->
  <div v-if="tutorial.active.value && tutorial.step.value" class="tour" data-transient>
    <div v-for="(box, i) in dims" :key="i" data-tour-dim class="dim" :style="box"></div>

    <section
      data-tour-card
      class="card"
      role="dialog"
      :aria-label="tutorial.step.value.title"
      :style="cardStyle"
    >
      <p class="count">Step {{ tutorial.stepIndex.value + 1 }} of {{ tutorial.steps.length }}</p>
      <h2>{{ tutorial.step.value.title }}</h2>
      <!--
        Live, so a step completing is spoken rather than only seen. The
        instruction is in the words, so a coach who cannot see the spotlight
        can still follow the tour.
      -->
      <p class="body" aria-live="polite">{{ tutorial.step.value.body }}</p>
      <div class="actions">
        <button data-tour-skip class="chip" @click="emit('end')">Skip</button>
        <button
          data-tour-back
          class="chip"
          :disabled="tutorial.stepIndex.value === 0"
          @click="tutorial.back()"
        >
          Back
        </button>
        <button v-if="isLast" data-tour-help class="chip chip--go" @click="emit('openHelp')">
          Open Help
        </button>
        <button
          v-else-if="!tutorial.step.value.goal"
          data-tour-next
          class="chip chip--go"
          @click="tutorial.next()"
        >
          Next
        </button>
        <span v-else class="waiting">Your turn</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*
 * Above every panel: the tour is the outermost thing on screen while it
 * runs. Only the card takes the pointer — the dimmed boxes are decoration
 * and the hole between them is the real control.
 */
.tour {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

.dim {
  position: fixed;
  background: rgb(0 0 0 / 0.55);
}

.card {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 24px);
  pointer-events: auto;
  padding: 0.9rem 1rem 0.8rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--ink-1);
  box-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
}

.count {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.card h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.body {
  margin: 0 0 0.8rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--ink-2);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.actions .chip:last-child {
  margin-left: auto;
}

.chip--go {
  background: var(--brand);
  border-color: var(--brand);
  color: #10231a;
}

.waiting {
  margin-left: auto;
  font-size: 0.78rem;
  color: var(--ink-3);
}
</style>
```

The `.chip` class comes from the app's global stylesheet, the same way
HelpPanel's Close button uses it. Confirm the token names
(`--border`, `--surface-2`, `--ink-1/2/3`, `--brand`) against the `:root`
block in `src/App.vue` and use whatever is actually defined there.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/TutorialOverlay.spec.ts && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/TutorialOverlay.vue tests/TutorialOverlay.spec.ts
git commit -m "feat: draw the tutorial's spotlight and card"
```

---

### Task 5: Take the tour, from Help

**Files:**
- Modify: `src/components/HelpPanel.vue`
- Test: `tests/HelpPanel.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: HelpPanel emits `startTour: []` alongside its existing `close: []`.
  The button carries `data-start-tour`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/HelpPanel.spec.ts`:

```ts
/*
 * The one way back to the tour once it has been taken or skipped. It sits in
 * the header beside Close, because a coach looking for "show me again" opens
 * Help and looks at the top.
 */
describe('taking the tour', () => {
  it('offers it in the header', () => {
    const wrapper = mountHelp(true)
    expect(wrapper.find('[data-start-tour]').exists()).toBe(true)
  })

  it('asks App to start it', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('[data-start-tour]').trigger('click')
    expect(wrapper.emitted('startTour')).toBeTruthy()
  })

  /* App closes the panel itself, so the panel must not also ask for it. */
  it('does not ask to be closed as well', async () => {
    const wrapper = mountHelp(true)
    await wrapper.find('[data-start-tour]').trigger('click')
    expect(wrapper.emitted('close')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/HelpPanel.spec.ts -t "taking the tour"`
Expected: FAIL — no element matches `[data-start-tour]`.

- [ ] **Step 3: Add the emit and the button**

In `src/components/HelpPanel.vue`, widen the emits declaration:

```ts
const emit = defineEmits<{ close: []; startTour: [] }>()
```

and put the button in the header, before Close:

```html
      <header class="head">
        <h2>Help</h2>
        <button data-start-tour class="chip" @click="emit('startTour')">Take the tour</button>
        <button data-close class="chip" @click="emit('close')">Close</button>
      </header>
```

If the existing `.head` rule pushes Close to the right with `margin-left:
auto` on the button, move that rule onto the new first button so the pair
sit together at the right-hand end. Read the scoped `.head` styles and make
the two buttons sit side by side; do not restyle anything else in the panel.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/HelpPanel.spec.ts && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/HelpPanel.vue tests/HelpPanel.spec.ts
git commit -m "feat: offer the tour from the help panel"
```

---

### Task 6: Wire it into the app

**Files:**
- Modify: `src/App.vue`
- Test: `tests/App.spec.ts`

**Interfaces:**
- Consumes: `useTutorial` (`active`, `start`, `end`, `hasSeen`, `takePark`),
  `TutorialOverlay` (`@end`, `@openHelp`), HelpPanel's `@startTour`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Keep the existing App tests out of the tour's way**

Every existing App test mounts an app that has never seen the tour, and
would now get one. In `tests/App.spec.ts`, add these imports:

```ts
import {
  useTutorial,
  __resetTutorialForTests,
  TUTORIAL_KEY,
  TUTORIAL_PARK_KEY,
} from '../src/composables/useTutorial'
```

and extend the existing `beforeEach` (which currently clears localStorage and
resets the board):

```ts
beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  __resetTutorialForTests()
  // Every test below is about something other than the tour, and a first
  // visit now opens one. The tour's own tests clear this again.
  localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
  useStorage().lastError.value = null
  useSessions().lastError.value = null
})
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/App.spec.ts`:

```ts
/*
 * The tour runs on the real board, so the coach's drill is parked in the
 * draft and handed back at the end — name, library id and all. These tests
 * are the ones that clear the seen flag the beforeEach sets.
 */
describe('the tutorial', () => {
  beforeEach(() => localStorage.removeItem(TUTORIAL_KEY))

  it('opens by itself on a first visit', async () => {
    wrapper = mountApp()
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(true)
  })

  it('does not open again once it has been seen', async () => {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
    wrapper = mountApp()
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(false)
  })

  /* A coach with work in progress is not on a first visit. */
  it('does not open on a board restored from a draft', async () => {
    const board = useBoard()
    board.addCounter('red')
    useStorage().saveDraft(board.snapshot())
    __resetBoardForTests()
    wrapper = mountApp()
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(false)
  })

  it('starts from the help panel', async () => {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
    wrapper = mountApp()
    await wrapper.find('[data-help]').trigger('click')
    await wrapper.find('[data-start-tour]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(true)
  })

  it('closes help on the way into the tour', async () => {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
    wrapper = mountApp()
    await wrapper.find('[data-help]').trigger('click')
    await wrapper.find('[data-start-tour]').trigger('click')
    await nextTick()
    expect(wrapper.find('[aria-label="Help"][role="dialog"]').exists()).toBe(false)
  })

  it('parks the drill and hands it back on Skip', async () => {
    const board = useBoard()
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
    wrapper = mountApp()
    board.addCounter('red')
    board.addCounter('blue')
    await nextTick()

    await wrapper.find('[data-help]').trigger('click')
    await wrapper.find('[data-start-tour]').trigger('click')
    await nextTick()
    expect(board.state.counters).toHaveLength(0)

    await wrapper.find('[data-tour-skip]').trigger('click')
    await nextTick()
    expect(board.state.counters).toHaveLength(2)
  })

  it('hands the drill's name back with it', async () => {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
    wrapper = mountApp()
    const field = wrapper.find('[data-current-pattern]')
    await field.setValue('Rondo')
    await field.trigger('change')
    await wrapper.find('[data-help]').trigger('click')
    await wrapper.find('[data-start-tour]').trigger('click')
    await nextTick()
    expect(drillName(wrapper)).toBe('')

    await wrapper.find('[data-tour-skip]').trigger('click')
    await nextTick()
    expect(drillName(wrapper)).toBe('Rondo')
  })

  it('closes on Escape, drill and all', async () => {
    const board = useBoard()
    wrapper = mountApp()
    await nextTick()
    board.addCounter('red')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(false)
  })

  it('opens help from the last step', async () => {
    wrapper = mountApp()
    await nextTick()
    const tutorial = useTutorial()
    for (let i = 0; i < tutorial.steps.length; i++) tutorial.next()
    await nextTick()
    await wrapper.find('[data-tour-help]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Help"][role="dialog"]').exists()).toBe(true)
  })

  /*
   * The draft is what a refresh restores. Writing the tour's board over it
   * would lose the coach's drill for the sake of an empty pitch.
   */
  it('leaves the draft holding the coach's drill while it runs', async () => {
    const board = useBoard()
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
    wrapper = mountApp()
    board.addCounter('red')
    board.addCounter('blue')
    await nextTick()
    await wrapper.find('[data-help]').trigger('click')
    await wrapper.find('[data-start-tour]').trigger('click')
    await nextTick()

    board.addCounter('red')
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(useStorage().loadDraft()!.frames[0].counters).toHaveLength(2)
  })

  /* A refresh mid-tour: the drill comes back through the draft, its name
   * through the park, and no tour reopens. */
  it('recovers an interrupted tour on the next startup', async () => {
    const board = useBoard()
    board.addCounter('red')
    useStorage().saveDraft(board.snapshot())
    localStorage.setItem(TUTORIAL_PARK_KEY, JSON.stringify({ patternId: null, name: 'Rondo' }))
    __resetBoardForTests()

    wrapper = mountApp()
    await nextTick()
    expect(wrapper.find('[data-tour-card]').exists()).toBe(false)
    expect(drillName(wrapper)).toBe('Rondo')
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })
})
```

Two of these titles contain an apostrophe inside a single-quoted string —
write those titles with double quotes. `drillName` is a helper the file
already has; the rename above is the same `setValue` then `change` on
`[data-current-pattern]` that the library tests already use.

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/App.spec.ts -t tutorial`
Expected: FAIL — no element matches `[data-tour-card]`.

- [ ] **Step 4: Wire the app**

In `src/App.vue`:

Add the imports beside the others:

```ts
import TutorialOverlay from './components/TutorialOverlay.vue'
import { useTutorial } from './composables/useTutorial'
```

and beside `const storage = useStorage()`:

```ts
const tutorial = useTutorial()
```

Add these two functions near the other dialog handlers:

```ts
/**
 * Park the open drill and hand the board to the tour.
 *
 * The pattern id and name are cleared here rather than inside the tour,
 * because they are App's to own — and clearing them is what stops the
 * autosave writing the tour's board over the coach's saved drill:
 * `scheduleAutosave` already returns early when there is neither.
 */
function startTour(): void {
  if (board.isDerived.value || presenting.value) return
  helpOpen.value = false
  tutorial.start({ patternId: currentPatternId.value, name: currentName.value })
  currentPatternId.value = null
  currentName.value = ''
  saveStatus.value = 'unsaved'
}

/** Close the tour and put the coach's drill, and its identity, back. */
function endTour(): void {
  const park = tutorial.end()
  currentPatternId.value = park.patternId
  currentName.value = park.name
  saveStatus.value = park.patternId ? 'saved' : 'unsaved'
}

/** The last step's way out: end the tour, then show them where the rest is. */
function onTourHelp(): void {
  endTour()
  helpOpen.value = true
}
```

Add the tour to `isDialogOpen`, as one more term in the `||` chain:

```ts
    tutorial.active.value ||
```

Put it at the TOP of `closeTopmostDialog`, before the save prompt — the tour
is the outermost thing on screen while it runs:

```ts
  if (tutorial.active.value) {
    endTour()
    return true
  }
```

Guard the draft watcher. It currently starts `if (board.isDerived.value)
return`; make that:

```ts
    // The draft is what a refresh restores, and while the tour runs it holds
    // the coach's parked drill. Writing the tour's empty board over it would
    // lose their work for the sake of an empty pitch.
    if (board.isDerived.value || tutorial.active.value) return
```

In `onMounted`, after the existing draft restore block, add:

```ts
  /*
   * A park left behind means a tour was cut short by a refresh. The board
   * itself came back through the draft above; this is only how the drill's
   * identity gets back to the header. No tour reopens — a coach who
   * refreshed may well have been trying to escape it.
   */
  const park = tutorial.takePark()
  if (park) {
    currentPatternId.value = park.patternId
    currentName.value = park.name
    saveStatus.value = park.patternId ? 'saved' : 'unsaved'
  } else if (!draft && !tutorial.hasSeen()) {
    startTour()
  }
```

`draft` is the local the existing block already assigns; if it is not in
scope at that point, hoist it rather than reading the draft a second time.

Finally, in the template, put the overlay immediately after `<HelpPanel>` and
give HelpPanel its new handler:

```html
    <HelpPanel :open="helpOpen" @close="helpOpen = false" @startTour="startTour" />

    <TutorialOverlay @end="endTour" @openHelp="onTourHelp" />
```

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npm test && npx vue-tsc --noEmit`
Expected: PASS, no type errors. If an existing App test now fails, it is
because the tour opened over it — check the `beforeEach` from Step 1 took
effect rather than weakening the new tests.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue tests/App.spec.ts
git commit -m "feat: run the tutorial from the app"
```

---

### Task 7: Say it in Help

**Files:**
- Modify: `src/components/HelpPanel.vue`
- Test: `tests/HelpPanel.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `tests/HelpPanel.spec.ts`:

```ts
it('tells a coach the tour exists, in the section about the board', () => {
  const wrapper = mountHelp(true)
  expect(wrapper.find('[data-help-section="board"]').text()).toContain('tour')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/HelpPanel.spec.ts -t "tells a coach the tour exists"`
Expected: FAIL — the section does not mention the tour.

- [ ] **Step 3: Add the line**

In `src/components/HelpPanel.vue`, add one point to the end of the `board`
section's `<ul class="points">`:

```html
          <li>
            New to this? <strong>Take the tour</strong> at the top of this panel walks you
            through a drill on the real board in a couple of minutes. Whatever is on the pitch
            is parked while it runs and comes straight back.
          </li>
```

- [ ] **Step 4: Run the whole suite and the type check**

Run: `npm test && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/HelpPanel.vue tests/HelpPanel.spec.ts
git commit -m "docs: point coaches at the tour"
```

`docs/roadmap.md` lists only what is left to build — anything that lands is
removed from it — and it carries no onboarding entry, so it needs no change.
