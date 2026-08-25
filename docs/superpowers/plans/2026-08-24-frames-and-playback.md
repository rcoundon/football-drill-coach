# Frames and Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach lay out several moments of a drill, play the movement between them, and export the result as an animated GIF.

**Architecture:** `Frame` grows to hold everything a moment owns, including drawings, and `BoardState` becomes a list of frames plus a current index. The five flat fields (`counters`, `markers`, `labels`, `ball`, `drawings`) survive as getters and setters onto the current frame, so all ~300 existing references and all 623 existing tests keep working. Rendering moves to a new `board.view` computed, which is the current frame's own arrays when parked on a frame and an interpolated blend when the playhead is between two. Tween maths lives in a new pure module beside `geometry.ts`.

**Tech Stack:** Vue 3.5.41 `<script setup>` SFCs, TypeScript 6.0.3, Vite 8.2.2, Vitest 4.1.11 with jsdom 30.0.1, `@vue/test-utils` 2.4.11. One new runtime dependency: `modern-gif` 2.1.0.

**Spec:** `docs/superpowers/specs/2026-08-24-frames-and-playback-design.md`

## Global Constraints

- Positions are in pitch units — x in `0..PITCH_W` (100), y in `0..PITCH_H` (64.76). Never pixels.
- `package.json` pins exact versions. Never `^` or `~`.
- Test-driven: write the failing test, run it and see it fail, write the minimal implementation, run it and see it pass, commit.
- Every board mutation goes through `commit()` first, except drag-time moves (`moveCounter`, `moveMarker`, `moveLabel`, `moveBall`, `updateSegment`, `extendPen`) which are called per pointer-move, and `goToFrame`, which changes nothing about the drill.
- Never store a Vue reactive proxy in state. `structuredClone` throws `DataCloneError` on one, and every snapshot depends on it. Use the existing `rawFilter` helper when filtering an array that lives in state.
- Anything reachable only by keyboard is, in practice, unreachable on a tablet. Every keyboard shortcut needs a button.
- Anything on screen that is an editing aid carries `data-transient`, so it is stripped from exports.
- Prose in commits, comments and docs is normal English. Explain why, not what.
- Run the whole suite (`npm test`) before each commit, not just the new file. The existing 623 tests passing unchanged is the main evidence the getter layer holds.
- `npm run build` (which runs `vue-tsc --noEmit`) must be clean before the final commit of each task.

---

### Task 1: Pure tween maths

**Files:**
- Create: `src/animation.ts`
- Modify: `src/geometry.ts` (add `BALL_OFFSET`), `src/composables/useBoard.ts` (import and re-export it instead of declaring it)
- Test: `tests/animation.spec.ts`

**Interfaces:**
- Consumes: `Frame`, `Counter`, `Marker`, `Label`, `Ball`, `Drawing`, `Vec` from `src/types.ts`; `BALL_OFFSET` from `src/geometry.ts`.
- Produces:
  ```ts
  export const DEFAULT_FRAME_MS = 1000
  export const MIN_FRAME_MS = 100
  export const MAX_FRAME_MS = 10_000
  export type FrameView = {
    counters: Counter[]; markers: Marker[]; labels: Label[]; ball: Ball; drawings: Drawing[]
  }
  export type Timeline = {
    total: number
    startOf(index: number): number
    at(ms: number): { index: number; t: number }
  }
  export function lerp(a: number, b: number, t: number): number
  export function easeInOut(t: number): number
  export function durationOf(frames: Frame[], index: number): number
  export function timelineOf(frames: Frame[]): Timeline
  export function ballPositionIn(frame: FrameView): Vec
  export function interpolateFrames(a: Frame, b: Frame, t: number): FrameView
  ```
  `Frame` gains `drawings: Drawing[]` and `duration?: number` in this task, because `animation.ts` cannot be typed without them.

- [ ] **Step 1: Add `drawings` and `duration` to `Frame`**

In `src/types.ts`, replace the `Frame` type:

```ts
/**
 * One moment of the drill: where everything stands, and what is drawn over
 * it. A frame is the whole board at an instant, which is why drawings live
 * here rather than on the pattern — the arrow describing a pass belongs to
 * the moment the pass happens, not to the whole drill.
 */
export type Frame = {
  counters: Counter[]
  markers: Marker[]
  labels: Label[]
  ball: Ball
  drawings: Drawing[]
  /**
   * How long the move INTO this frame takes, in milliseconds. Absent means
   * DEFAULT_FRAME_MS. The first frame's value is ignored: nothing moves into
   * the start of a drill.
   *
   * Optional so a pattern saved before playback existed needs no rewriting.
   */
  duration?: number
}
```

Leave `Pattern` alone for now — Task 4 deals with it. `src/composables/useStorage.ts` builds a `Frame` literal at `toPattern`; add `drawings: []` there so the file still type-checks, with a comment saying Task 4 replaces it. Nothing reads it yet.

- [ ] **Step 2: Move `BALL_OFFSET` into `geometry.ts`**

Cut the `BALL_OFFSET` declaration and its comment out of `src/composables/useBoard.ts` and paste it into `src/geometry.ts`, below `PITCH_H`:

```ts
/**
 * Where an attached ball sits relative to its holder, in pitch units.
 *
 * Far enough out that the ball's own hit circle clears the whole drawn
 * counter: the ball is painted after the counters, so any overlap steals the
 * press, and an overlap reaching the counter's centre means pressing the
 * middle of a player in possession grabs the ball instead of the player.
 * See BALL_HIT_RADIUS_ATTACHED in BallToken.vue for the other half.
 *
 * It lives here rather than in useBoard so animation.ts can resolve where an
 * attached ball is drawn without importing useBoard, which would import
 * animation.ts back.
 */
export const BALL_OFFSET: Vec = { x: 3.4, y: 3.4 }
```

In `useBoard.ts`, add `BALL_OFFSET` to the existing `import { ... } from '../geometry'` list and re-export it so every current importer is unaffected:

```ts
export { BALL_OFFSET } from '../geometry'
```

Run `npm test` — all 623 should still pass, including `tests/useBoard.ball.spec.ts` and `tests/BallToken.spec.ts`, which import `BALL_OFFSET` from `useBoard`.

- [ ] **Step 3: Write the failing tests**

Create `tests/animation.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Ball, Counter, Frame, Marker } from '../src/types'
import { BALL_OFFSET } from '../src/geometry'
import {
  DEFAULT_FRAME_MS,
  ballPositionIn,
  durationOf,
  easeInOut,
  interpolateFrames,
  lerp,
  timelineOf,
} from '../src/animation'

function counter(id: string, x: number, y: number): Counter {
  return { id, color: 'red', label: '', pos: { x, y } }
}

function marker(id: string, x: number, y: number): Marker {
  return { id, pos: { x, y } }
}

function ball(x: number, y: number, attachedTo: string | null = null): Ball {
  return { pos: { x, y }, attachedTo, visible: true }
}

function frame(partial: Partial<Frame> = {}): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    ball: ball(50, 30),
    drawings: [],
    ...partial,
  }
}

describe('lerp and easeInOut', () => {
  it('lerp hits both ends exactly', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('easeInOut is flat at both ends and even in the middle', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBe(0.5)
    // Slower than linear at the start, which is the whole point.
    expect(easeInOut(0.25)).toBeLessThan(0.25)
    expect(easeInOut(0.75)).toBeGreaterThan(0.75)
  })
})

describe('durationOf', () => {
  it('is zero for the first frame, because nothing moves into it', () => {
    expect(durationOf([frame(), frame()], 0)).toBe(0)
  })

  it('falls back to the default when a frame carries no duration', () => {
    expect(durationOf([frame(), frame()], 1)).toBe(DEFAULT_FRAME_MS)
  })

  it('uses the frame’s own duration when it has one', () => {
    expect(durationOf([frame(), frame({ duration: 400 })], 1)).toBe(400)
  })

  it('treats a non-positive duration as instant rather than dividing by it', () => {
    expect(durationOf([frame(), frame({ duration: 0 })], 1)).toBe(0)
    expect(durationOf([frame(), frame({ duration: -5 })], 1)).toBe(0)
  })
})

describe('timelineOf', () => {
  it('a single frame has no duration and always sits at its start', () => {
    const line = timelineOf([frame()])
    expect(line.total).toBe(0)
    expect(line.startOf(0)).toBe(0)
    expect(line.at(0)).toEqual({ index: 0, t: 0 })
    expect(line.at(5000)).toEqual({ index: 0, t: 0 })
  })

  it('totals the durations of every frame after the first', () => {
    const line = timelineOf([frame(), frame({ duration: 400 }), frame({ duration: 600 })])
    expect(line.total).toBe(1000)
    expect(line.startOf(0)).toBe(0)
    expect(line.startOf(1)).toBe(400)
    expect(line.startOf(2)).toBe(1000)
  })

  it('reports which segment a time falls in and how far through it is', () => {
    const line = timelineOf([frame(), frame({ duration: 400 }), frame({ duration: 600 })])
    expect(line.at(0)).toEqual({ index: 0, t: 0 })
    expect(line.at(200)).toEqual({ index: 0, t: 0.5 })
    expect(line.at(400)).toEqual({ index: 1, t: 0 })
    expect(line.at(700)).toEqual({ index: 1, t: 0.5 })
  })

  it('clamps outside the drill rather than running off either end', () => {
    const line = timelineOf([frame(), frame({ duration: 400 })])
    expect(line.at(-100)).toEqual({ index: 0, t: 0 })
    expect(line.at(9999)).toEqual({ index: 1, t: 0 })
  })

  it('steps straight over a zero-length segment', () => {
    const line = timelineOf([frame(), frame({ duration: 0 }), frame({ duration: 500 })])
    expect(line.startOf(1)).toBe(0)
    expect(line.at(0)).toEqual({ index: 1, t: 0 })
    expect(line.at(250)).toEqual({ index: 1, t: 0.5 })
  })

  it('survives an empty frame list rather than throwing', () => {
    const line = timelineOf([])
    expect(line.total).toBe(0)
    expect(line.at(100)).toEqual({ index: 0, t: 0 })
  })
})

describe('ballPositionIn', () => {
  it('is the ball’s own position when nobody is carrying it', () => {
    expect(ballPositionIn(frame({ ball: ball(20, 30) }))).toEqual({ x: 20, y: 30 })
  })

  it('is one offset from the holder when someone is', () => {
    const f = frame({ counters: [counter('c1', 40, 25)], ball: ball(0, 0, 'c1') })
    expect(ballPositionIn(f)).toEqual({ x: 40 + BALL_OFFSET.x, y: 25 + BALL_OFFSET.y })
  })

  it('falls back to its own position when the holder is gone', () => {
    expect(ballPositionIn(frame({ ball: ball(20, 30, 'missing') }))).toEqual({ x: 20, y: 30 })
  })
})

describe('interpolateFrames', () => {
  it('matches players by id and eases their positions', () => {
    const a = frame({ counters: [counter('c1', 0, 0), counter('c2', 100, 0)] })
    const b = frame({ counters: [counter('c2', 100, 40), counter('c1', 10, 0)] })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.counters.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(view.counters[0].pos).toEqual({ x: 5, y: 0 })
    expect(view.counters[1].pos).toEqual({ x: 100, y: 20 })
  })

  it('holds a player that is missing from the target rather than throwing', () => {
    const a = frame({ counters: [counter('c1', 12, 34)] })
    const view = interpolateFrames(a, frame(), 0.5)
    expect(view.counters[0].pos).toEqual({ x: 12, y: 34 })
  })

  it('eases cones and labels the same way', () => {
    const a = frame({ markers: [marker('m1', 0, 0)] })
    const b = frame({ markers: [marker('m1', 20, 0)] })
    expect(interpolateFrames(a, b, 0.5).markers[0].pos).toEqual({ x: 10, y: 0 })
  })

  it('leaves the source frames untouched', () => {
    const a = frame({ counters: [counter('c1', 0, 0)] })
    const b = frame({ counters: [counter('c1', 20, 0)] })
    interpolateFrames(a, b, 0.5)
    expect(a.counters[0].pos).toEqual({ x: 0, y: 0 })
    expect(b.counters[0].pos).toEqual({ x: 20, y: 0 })
  })

  it('flies the ball linearly and lets go of it on the way', () => {
    const a = frame({ counters: [counter('c1', 0, 0), counter('c2', 40, 0)], ball: ball(0, 0, 'c1') })
    const b = frame({ counters: [counter('c1', 0, 0), counter('c2', 40, 0)], ball: ball(0, 0, 'c2') })
    const view = interpolateFrames(a, b, 0.25)
    expect(view.ball.attachedTo).toBeNull()
    // Linear, not eased: a struck ball does not accelerate.
    expect(view.ball.pos.x).toBeCloseTo(BALL_OFFSET.x + 10, 10)
  })

  it('keeps the source frame’s drawings for the whole move', () => {
    const drawing = { id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } as const
    const a = frame({ drawings: [drawing] })
    expect(interpolateFrames(a, frame(), 0.9).drawings).toEqual([drawing])
  })
})
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `npx vitest run tests/animation.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/animation"`.

- [ ] **Step 5: Write `src/animation.ts`**

```ts
/**
 * Tween maths for playing a drill back.
 *
 * Pure, like geometry.ts, and for the same reason: it is the part worth
 * testing exhaustively, and nothing here should need a DOM or a component to
 * exercise it.
 */
import type { Ball, Counter, Drawing, Frame, Label, Marker, Vec } from './types'
import { BALL_OFFSET } from './geometry'

/** How long the move into a frame takes when the frame does not say. */
export const DEFAULT_FRAME_MS = 1000

/** Short enough to be a flick, long enough to be seen. */
export const MIN_FRAME_MS = 100

/** Longer than this is a pause, and a pause wants its own frame. */
export const MAX_FRAME_MS = 10_000

/** What the board renders: a frame, or a blend of two. */
export type FrameView = {
  counters: Counter[]
  markers: Marker[]
  labels: Label[]
  ball: Ball
  drawings: Drawing[]
}

export type Timeline = {
  /** Milliseconds from the start of the drill to the last frame. */
  total: number
  /** When a frame is reached, in milliseconds from the start. */
  startOf(index: number): number
  /** Which move a time falls in, and how far through it is. */
  at(ms: number): { index: number; t: number }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Smoothstep: flat at both ends, so a player accelerates away and settles. */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

/**
 * How long the move into `index` takes.
 *
 * Zero for the first frame, because nothing moves into the start of a drill,
 * and zero for a non-positive duration, so a hand-edited file cannot make the
 * timeline divide by it.
 */
export function durationOf(frames: Frame[], index: number): number {
  if (index <= 0) return 0
  const raw = frames[index]?.duration ?? DEFAULT_FRAME_MS
  return raw > 0 ? raw : 0
}

export function timelineOf(frames: Frame[]): Timeline {
  const starts: number[] = [0]
  for (let i = 1; i < frames.length; i++) starts.push(starts[i - 1] + durationOf(frames, i))

  const last = Math.max(0, frames.length - 1)
  const total = starts[last] ?? 0

  return {
    total,
    startOf(index) {
      return starts[Math.max(0, Math.min(index, last))] ?? 0
    },
    at(ms) {
      // Written as `!(ms > 0)` so NaN lands at the start rather than falling
      // through every comparison to the end.
      if (!(ms > 0)) return { index: 0, t: 0 }
      if (ms >= total) return { index: last, t: 0 }
      for (let i = 0; i < last; i++) {
        const span = starts[i + 1] - starts[i]
        if (span <= 0) continue
        if (ms < starts[i + 1]) return { index: i, t: (ms - starts[i]) / span }
      }
      return { index: last, t: 0 }
    },
  }
}

/** Where the ball is actually drawn in a frame, carried or not. */
export function ballPositionIn(frame: FrameView): Vec {
  if (frame.ball.attachedTo) {
    const holder = frame.counters.find((c) => c.id === frame.ball.attachedTo)
    if (holder) return { x: holder.pos.x + BALL_OFFSET.x, y: holder.pos.y + BALL_OFFSET.y }
  }
  return frame.ball.pos
}

/**
 * Match by id and move towards the target.
 *
 * The cast is drill-wide, so every id in `from` is in `to`. One that is not —
 * a hand-edited file — holds its position rather than throwing.
 */
function tweenAll<T extends { id: string; pos: Vec }>(from: T[], to: T[], e: number): T[] {
  return from.map((item) => {
    const target = to.find((other) => other.id === item.id)?.pos ?? item.pos
    return { ...item, pos: lerpVec(item.pos, target, e) }
  })
}

/**
 * Blend two frames.
 *
 * Bodies are eased and the ball is not: a player accelerates away and
 * decelerates into position, a struck ball does neither. The ball is also
 * detached for the whole move, which is what makes a pass render as a ball
 * travelling from one player to another rather than sitting on the passer's
 * boot and teleporting on arrival.
 *
 * Drawings are the source frame's throughout, so the arrow describing a pass
 * is on screen while the pass happens and gone once it has.
 */
export function interpolateFrames(a: Frame, b: Frame, t: number): FrameView {
  const e = easeInOut(t)
  return {
    counters: tweenAll(a.counters, b.counters, e),
    markers: tweenAll(a.markers, b.markers, e),
    labels: tweenAll(a.labels, b.labels, e),
    ball: {
      pos: lerpVec(ballPositionIn(a), ballPositionIn(b), t),
      attachedTo: null,
      visible: a.ball.visible,
    },
    drawings: a.drawings,
  }
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run tests/animation.spec.ts`
Expected: PASS.

Then `npm test` — the existing 623 must still pass — and `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add src/animation.ts src/geometry.ts src/types.ts src/composables/useBoard.ts src/composables/useStorage.ts tests/animation.spec.ts
git commit -m "feat: the maths for moving between two moments

A frame grows to hold its own drawings and how long the move into it
takes, and a new pure module blends two of them.

Bodies are eased and the ball is not, because a player accelerates away
and settles while a struck ball does neither. The ball is also detached
for the whole move, which is what makes a pass look like a ball
travelling rather than one that sits on the passer's boot and teleports
on arrival.

BALL_OFFSET moves to geometry so the new module can resolve a carried
ball's drawn position without importing useBoard, which would import it
straight back. useBoard re-exports it, so no caller changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Frames under the board state, behind a getter layer

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.frames.spec.ts` (create)

**Interfaces:**
- Consumes: `Frame` from `src/types.ts` (Task 1).
- Produces:
  ```ts
  export type BoardSnapshot = {
    frames: Frame[]
    currentFrame: number
    labelsVisible: boolean
    notes: string
    notesVisible: boolean
    pitch: { type: PitchType; rotated: boolean }
  }
  export type BoardState = BoardSnapshot & FrameView
  ```
  `board.state.counters`, `.markers`, `.labels`, `.ball` and `.drawings` keep their current meaning and types; they now read and write `state.frames[state.currentFrame]`.

This is the load-bearing bet of the whole plan, so it lands on its own with nothing else riding on it. The evidence it works is the 623 existing tests passing untouched.

- [ ] **Step 1: Write the failing tests**

Create `tests/useBoard.frames.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import type { BoardSnapshot } from '../src/composables/useBoard'
import type { Frame } from '../src/types'

const board = useBoard()

function frame(partial: Partial<Frame> = {}): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
    drawings: [],
    ...partial,
  }
}

function snapshotWith(frames: Frame[], currentFrame = 0): BoardSnapshot {
  return {
    frames,
    currentFrame,
    labelsVisible: true,
    notes: '',
    notesVisible: true,
    pitch: { type: 'blank', rotated: false },
  }
}

beforeEach(() => {
  __resetBoardForTests()
})

describe('the board starts as one frame', () => {
  it('has exactly one frame, and it is the current one', () => {
    expect(board.state.frames).toHaveLength(1)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('the flat fields read and write the current frame', () => {
  it('reads through to the current frame', () => {
    board.restoreSnapshot(
      snapshotWith([frame(), frame({ counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 9, y: 9 } }] })], 1),
    )
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].id).toBe('c1')
  })

  it('follows the current frame when it changes', () => {
    board.restoreSnapshot(
      snapshotWith([frame(), frame({ counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 9, y: 9 } }] })], 1),
    )
    board.state.currentFrame = 0
    expect(board.state.counters).toEqual([])
  })

  it('a push through the flat field lands in the current frame and nowhere else', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 1))
    board.state.counters.push({ id: 'c1', color: 'blue', label: '', pos: { x: 1, y: 2 } })
    expect(board.state.frames[1].counters).toHaveLength(1)
    expect(board.state.frames[0].counters).toHaveLength(0)
  })

  it('an assignment through the flat field lands in the current frame and nowhere else', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 1))
    board.state.drawings = [
      { id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
    ]
    expect(board.state.frames[1].drawings).toHaveLength(1)
    expect(board.state.frames[0].drawings).toHaveLength(0)
  })

  it('the ball belongs to the frame too', () => {
    board.restoreSnapshot(
      snapshotWith([frame(), frame({ ball: { pos: { x: 11, y: 12 }, attachedTo: null, visible: true } })], 1),
    )
    expect(board.state.ball.pos).toEqual({ x: 11, y: 12 })
  })
})

describe('undo carries every frame', () => {
  it('restores a frame the coach was not looking at', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 0))
    board.commit()
    board.state.frames[1].counters.push({ id: 'c1', color: 'red', label: '', pos: { x: 3, y: 4 } })
    expect(board.state.frames[1].counters).toHaveLength(1)
    board.undo()
    expect(board.state.frames[1].counters).toHaveLength(0)
  })

  it('restores which frame was current', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 1))
    board.commit()
    board.state.currentFrame = 0
    board.undo()
    expect(board.state.currentFrame).toBe(1)
  })
})

describe('a snapshot is plain data', () => {
  it('can be structured-cloned, which is what undo depends on', () => {
    board.addCounter('red')
    expect(() => structuredClone(board.snapshot())).not.toThrow()
  })

  it('does not carry the derived fields, which would be a second copy', () => {
    const snap = board.snapshot() as Record<string, unknown>
    expect(Object.keys(snap).sort()).toEqual(
      ['currentFrame', 'frames', 'labelsVisible', 'notes', 'notesVisible', 'pitch'].sort(),
    )
  })
})

describe('a snapshot with a bad current frame is brought back into range', () => {
  it('clamps an index past the end', () => {
    board.restoreSnapshot(snapshotWith([frame()], 7))
    expect(board.state.currentFrame).toBe(0)
  })

  it('replaces an empty frame list with one empty frame', () => {
    board.restoreSnapshot(snapshotWith([], 0))
    expect(board.state.frames).toHaveLength(1)
    expect(board.state.counters).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/useBoard.frames.spec.ts`
Expected: FAIL — `board.state.frames` is undefined.

- [ ] **Step 3: Restructure the state in `src/composables/useBoard.ts`**

Replace the `BoardState` / `BoardSnapshot` / `emptyState` block:

```ts
/**
 * The board as data: a list of moments, plus the settings that belong to the
 * drill rather than to any one of them.
 */
export type BoardSnapshot = {
  frames: Frame[]
  currentFrame: number
  labelsVisible: boolean
  notes: string
  notesVisible: boolean
  pitch: { type: PitchType; rotated: boolean }
}

/**
 * The board as everything else sees it: the data above, plus five accessors
 * onto whichever frame is current.
 *
 * The accessors are the reason roughly three hundred existing references to
 * `state.counters` and `state.ball` did not have to be rewritten when frames
 * arrived. Reading one through Vue's proxy tracks `frames` and
 * `currentFrame`, so switching frame re-renders without anything extra.
 */
export type BoardState = BoardSnapshot & FrameView

function emptyFrame(): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    // Not the pitch centre: that is where the first counter lands, and the
    // ball's hit circle would sit right on top of the counter's body, so the
    // coach's first drag would grab the ball instead of the player. Just
    // below the centre circle, which is clear of the centre on every pitch
    // type and well inside the half pitch's 25..75 band.
    ball: { pos: { x: PITCH_W / 2, y: PITCH_H / 2 + 10 }, attachedTo: null, visible: true },
    drawings: [],
  }
}

function emptySnapshot(): BoardSnapshot {
  return {
    frames: [emptyFrame()],
    currentFrame: 0,
    labelsVisible: true,
    notes: '',
    notesVisible: true,
    pitch: { type: 'blank', rotated: false },
  }
}

const FRAME_FIELDS = ['counters', 'markers', 'labels', 'ball', 'drawings'] as const

/**
 * Add the five accessors onto the current frame.
 *
 * Non-enumerable on purpose: a spread or a `structuredClone` of the state
 * must not materialise a second copy of the current frame's arrays alongside
 * the frame that owns them.
 */
function withFrameAccessors(base: BoardSnapshot): BoardState {
  const target = base as BoardState
  for (const field of FRAME_FIELDS) {
    Object.defineProperty(target, field, {
      enumerable: false,
      configurable: true,
      get(this: BoardState) {
        return this.frames[this.currentFrame][field]
      },
      set(this: BoardState, value: unknown) {
        ;(this.frames[this.currentFrame] as unknown as Record<string, unknown>)[field] = value
      },
    })
  }
  return target
}

const state = reactive<BoardState>(withFrameAccessors(emptySnapshot()))
```

Add `Frame` to the `import type { ... } from '../types'` list and `import type { FrameView } from '../animation'`.

- [ ] **Step 4: Rewrite `snapshot` and `apply`**

```ts
/** A plain copy of the current state, safe to keep. */
function snapshot(): BoardSnapshot {
  const raw = toRaw(state)
  return structuredClone({
    frames: raw.frames,
    currentFrame: raw.currentFrame,
    labelsVisible: raw.labelsVisible,
    notes: raw.notes,
    notesVisible: raw.notesVisible,
    pitch: raw.pitch,
  })
}

function apply(snap: BoardSnapshot): void {
  const copy = clone(snap)
  // A snapshot from a damaged draft, or a pattern whose frames were trimmed,
  // must not leave `currentFrame` pointing past the end: every accessor would
  // then read through `undefined` and the board would render as an exception
  // with no way back from inside the app.
  const frames = copy.frames?.length ? copy.frames : [emptyFrame()]
  state.frames = frames
  state.currentFrame = Math.max(0, Math.min(copy.currentFrame ?? 0, frames.length - 1))
  state.labelsVisible = copy.labelsVisible ?? true
  state.notes = copy.notes ?? ''
  state.notesVisible = copy.notesVisible ?? true
  state.pitch = copy.pitch
}
```

- [ ] **Step 5: Fix the three remaining references to the old shape**

`resetBoard`:
```ts
function resetBoard(): void {
  commit()
  apply({ ...emptySnapshot(), pitch: { ...toRaw(state).pitch } })
}
```

`__resetBoardForTests`: `apply(emptyState())` becomes `apply(emptySnapshot())`.

`forgetDrawingInHistory` reaches into snapshots, which now hold frames:
```ts
/** Erase every trace of a drawing from the undo and redo history. */
function forgetDrawingInHistory(id: string): void {
  for (const stack of [undoStack, redoStack]) {
    for (const entry of stack.value) {
      for (const frame of entry.frames) {
        frame.drawings = rawFilter(frame.drawings, (d) => d.id !== id)
      }
    }
  }
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run tests/useBoard.frames.spec.ts`
Expected: PASS.

Run: `npm test`
Expected: all 623 existing tests still pass. If they do not, the failure is the getter layer, not the tests — read the failure before touching a spec file.

- [ ] **Step 7: Bring `tests/useStorage.spec.ts` onto the new snapshot shape**

`tsconfig.json` includes `tests/**/*.ts`, so `npm run build` type-checks the specs. `tests/useStorage.spec.ts` builds `BoardSnapshot` values by hand with the flat fields and will not compile against the new shape.

This is mechanical: every literal snapshot in that file becomes

```ts
{
  frames: [{ counters: [...], markers: [...], labels: [...], ball: {...}, drawings: [...] }],
  currentFrame: 0,
  labelsVisible: true,
  notes: '',
  notesVisible: true,
  pitch: { type: 'blank', rotated: false },
}
```

with whatever values that particular test was using. Likewise every assertion reading `snap.counters` becomes `snap.frames[0].counters`. Work through the errors `npm run build` reports rather than guessing which literals need it. Change only the shape — no test's meaning changes here, and any that seems to want to is a signal you have the shape wrong.

Run `npm test` and `npm run build`. Both clean.

- [ ] **Step 8: Commit**

```bash
git add src/composables/useBoard.ts tests/useBoard.frames.spec.ts tests/useStorage.spec.ts
git commit -m "feat: the board becomes a list of moments

State holds frames and a current index. The five flat fields survive as
accessors onto whichever frame is current, so every existing reference to
state.counters or state.ball keeps working and reads the right moment.

That is the whole reason for the indirection. Roughly three hundred
references exist across src and tests; rewriting them would have been a
large diff whose risk was invisible to the type checker, because a missed
rename still compiles when both sides are Counter[]. The existing tests
passing unchanged is the evidence the layer holds.

Snapshots carry every frame, so undo restores a moment the coach was not
looking at, and a snapshot whose current index points past the end is
brought back into range rather than rendering as an exception.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Frame operations, and what is drill-wide

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.frames.spec.ts` (extend)

**Interfaces:**
- Consumes: `BoardState`, `commit`, `newId`, `rawFilter`, `clone`, `pointsOfRef` from Task 2.
- Produces, all added to the `board` object:
  ```ts
  function addFrame(): number                                    // returns the new index
  function deleteFrame(index: number): void                      // refused at one frame
  function moveFrame(from: number, to: number): void
  function setFrameDuration(index: number, ms: number): void     // clamped to MIN/MAX_FRAME_MS
  function goToFrame(index: number): void                        // not a commit
  function translatePoints(points: Vec[], delta: Vec): void      // extracted from translateGroup
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/useBoard.frames.spec.ts`:

```ts
describe('adding a frame', () => {
  it('copies the frame you are on and selects the copy', () => {
    board.addCounter('red')
    const before = board.state.counters[0].pos
    const index = board.addFrame()
    expect(index).toBe(1)
    expect(board.state.frames).toHaveLength(2)
    expect(board.state.currentFrame).toBe(1)
    expect(board.state.counters[0].pos).toEqual(before)
  })

  it('copies rather than shares, so moving on one frame leaves the other', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.moveCounter(id, { x: 20, y: 20 })
    expect(board.state.frames[0].counters[0].pos).not.toEqual({ x: 20, y: 20 })
    expect(board.state.frames[1].counters[0].pos).toEqual({ x: 20, y: 20 })
  })

  it('carries the drawings over, so the pass you drew is still there', () => {
    const id = board.startArrow({ x: 10, y: 10 }, '#fff', 'pass')
    board.updateSegment(id, { x: 30, y: 30 })
    board.addFrame()
    expect(board.state.drawings).toHaveLength(1)
    board.deleteDrawing(board.state.drawings[0].id)
    expect(board.state.drawings).toHaveLength(0)
    expect(board.state.frames[0].drawings).toHaveLength(1)
  })

  it('inserts after the current frame rather than at the end', () => {
    board.addFrame()
    board.goToFrame(0)
    board.addFrame()
    expect(board.state.frames).toHaveLength(3)
    expect(board.state.currentFrame).toBe(1)
  })

  it('is undoable', () => {
    board.addFrame()
    board.undo()
    expect(board.state.frames).toHaveLength(1)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('deleting a frame', () => {
  it('removes it and lands on a frame that still exists', () => {
    board.addFrame()
    board.addFrame()
    board.deleteFrame(2)
    expect(board.state.frames).toHaveLength(2)
    expect(board.state.currentFrame).toBe(1)
  })

  it('is refused when it is the only frame left', () => {
    board.deleteFrame(0)
    expect(board.state.frames).toHaveLength(1)
    expect(board.canUndo.value).toBe(false)
  })
})

describe('reordering frames', () => {
  it('moves a frame and keeps the same one selected', () => {
    board.addCounter('red')
    board.addFrame()
    board.moveCounter(board.state.counters[0].id, { x: 20, y: 20 })
    board.moveFrame(1, 0)
    expect(board.state.frames[0].counters[0].pos).toEqual({ x: 20, y: 20 })
    expect(board.state.currentFrame).toBe(0)
  })

  it('ignores an index that is not there', () => {
    board.addFrame()
    board.moveFrame(0, 9)
    expect(board.state.frames).toHaveLength(2)
    expect(board.canUndo.value).toBe(true) // only the addFrame
    board.undo()
    expect(board.canUndo.value).toBe(false)
  })
})

describe('frame duration', () => {
  it('is stored on the frame', () => {
    board.addFrame()
    board.setFrameDuration(1, 400)
    expect(board.state.frames[1].duration).toBe(400)
  })

  it('is clamped to something a coach can actually see', () => {
    board.addFrame()
    board.setFrameDuration(1, 5)
    expect(board.state.frames[1].duration).toBe(MIN_FRAME_MS)
    board.setFrameDuration(1, 999_999)
    expect(board.state.frames[1].duration).toBe(MAX_FRAME_MS)
  })
})

describe('going to a frame', () => {
  it('selects it', () => {
    board.addFrame()
    board.goToFrame(0)
    expect(board.state.currentFrame).toBe(0)
  })

  it('costs nothing in undo history, because it changed nothing about the drill', () => {
    board.addFrame()
    board.undo()
    board.goToFrame(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('ignores an index that is not there', () => {
    board.goToFrame(4)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('the cast is drill-wide', () => {
  it('a player added on one frame is on every frame', () => {
    board.addFrame()
    board.goToFrame(1)
    board.addCounter('blue')
    expect(board.state.frames[0].counters).toHaveLength(1)
    expect(board.state.frames[1].counters).toHaveLength(1)
    expect(board.state.frames[0].counters[0].id).toBe(board.state.frames[1].counters[0].id)
  })

  it('a player deleted on one frame is off every frame', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.deleteCounter(id)
    expect(board.state.frames[0].counters).toHaveLength(0)
    expect(board.state.frames[1].counters).toHaveLength(0)
  })

  it('renumbering a player renumbers them everywhere', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.setCounterLabel(id, '7')
    expect(board.state.frames[0].counters[0].label).toBe('7')
    expect(board.state.frames[1].counters[0].label).toBe('7')
  })

  it('cones and labels follow the same rule', () => {
    board.addFrame()
    board.addMarker({ x: 10, y: 10 })
    board.addLabel({ x: 20, y: 20 }, 'press')
    expect(board.state.frames[0].markers).toHaveLength(1)
    expect(board.state.frames[0].labels).toHaveLength(1)
    board.deleteMarker(board.state.markers[0].id)
    expect(board.state.frames[0].markers).toHaveLength(0)
  })

  it('a drawing does not — it belongs to the moment it describes', () => {
    board.addFrame()
    const id = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(id, { x: 25, y: 25 })
    expect(board.state.frames[1].drawings).toHaveLength(1)
    expect(board.state.frames[0].drawings).toHaveLength(0)
  })

  it('moving a player moves them on this frame only', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.moveCounter(id, { x: 30, y: 30 })
    expect(board.state.frames[0].counters[0].pos).not.toEqual({ x: 30, y: 30 })
  })

  it('clearing the players clears them from every frame', () => {
    board.addCounter('red')
    board.addFrame()
    board.clearCounters()
    expect(board.state.frames[0].counters).toHaveLength(0)
    expect(board.state.frames[1].counters).toHaveLength(0)
  })

  it('clearing the drawings clears them from every frame', () => {
    const id = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(id, { x: 25, y: 25 })
    board.addFrame()
    board.clearDrawings()
    expect(board.state.frames[0].drawings).toHaveLength(0)
    expect(board.state.frames[1].drawings).toHaveLength(0)
  })
})

describe('groups across frames', () => {
  it('deleting a group takes its players off every frame and its drawings off this one', () => {
    board.addCounter('red')
    const counterId = board.state.counters[0].id
    const drawingId = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(drawingId, { x: 25, y: 25 })
    board.addFrame()
    board.deleteGroup([
      { kind: 'counter', id: counterId },
      { kind: 'drawing', id: drawingId },
    ])
    expect(board.state.frames[0].counters).toHaveLength(0)
    expect(board.state.frames[1].counters).toHaveLength(0)
    expect(board.state.frames[1].drawings).toHaveLength(0)
    expect(board.state.frames[0].drawings).toHaveLength(1)
  })

  it('a copied player appears on every frame, offset from where the original stands there', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.moveCounter(id, { x: 60, y: 30 })
    const copies = board.duplicateGroup([{ kind: 'counter', id }], { x: 4, y: 4 })
    const copyId = copies[0].id
    const on0 = board.state.frames[0].counters.find((c) => c.id === copyId)!
    const on1 = board.state.frames[1].counters.find((c) => c.id === copyId)!
    expect(on1.pos).toEqual({ x: 64, y: 34 })
    // Frame 0 still has the original where it started, and the copy beside it
    // there too — so the copy repeats the original's run rather than standing
    // still through it.
    expect(on0.pos).not.toEqual(on1.pos)
  })
})
```

Add `MIN_FRAME_MS` and `MAX_FRAME_MS` to the imports at the top of the spec, from `../src/animation`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/useBoard.frames.spec.ts`
Expected: FAIL — `board.addFrame is not a function`.

- [ ] **Step 3: Add the frame operations**

In `src/composables/useBoard.ts`, import `MAX_FRAME_MS` and `MIN_FRAME_MS` from `'../animation'`, and add:

```ts
/**
 * Add a moment, as a copy of the one the coach is on.
 *
 * A copy rather than a blank board, because the next frame of a drill is
 * nearly always the same players a few yards further on. It also means the
 * cast stays in step without anything having to enforce it, and the drawings
 * carry over so the arrow describing a pass survives until the pass has
 * happened and the coach rubs it out.
 */
function addFrame(): number {
  commit()
  const index = state.currentFrame + 1
  state.frames.splice(index, 0, clone(toRaw(state).frames[state.currentFrame]))
  state.currentFrame = index
  return index
}

/** A drill has to be something. The last frame cannot be removed. */
function deleteFrame(index: number): void {
  if (state.frames.length <= 1) return
  if (index < 0 || index >= state.frames.length) return
  commit()
  state.frames.splice(index, 1)
  state.currentFrame = Math.min(state.currentFrame, state.frames.length - 1)
}

/** Reorder, keeping the coach on the frame they were looking at. */
function moveFrame(from: number, to: number): void {
  const last = state.frames.length - 1
  if (from < 0 || from > last || to < 0 || to > last || from === to) return
  commit()
  const moving = state.currentFrame === from
  const [frame] = state.frames.splice(from, 1)
  state.frames.splice(to, 0, frame)
  if (moving) state.currentFrame = to
  else state.currentFrame = Math.max(0, Math.min(state.currentFrame, state.frames.length - 1))
}

function setFrameDuration(index: number, ms: number): void {
  const frame = state.frames[index]
  if (!frame) return
  commit()
  frame.duration = Math.round(Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, ms)))
}

/**
 * Select a frame. Deliberately not a commit: looking at a moment changes
 * nothing about the drill, and stepping through five frames to read them
 * should not bury real work under five entries that changed nothing.
 */
function goToFrame(index: number): void {
  if (index < 0 || index >= state.frames.length) return
  state.currentFrame = index
}
```

Add all five to the `board` object.

- [ ] **Step 4: Make the cast operations reach every frame**

Add a helper next to `rawFilter`:

```ts
/**
 * Every frame, unproxied.
 *
 * The cast is drill-wide: adding, removing or renaming a player, cone or
 * label applies to the whole drill, because a squad does not change halfway
 * through a session and a player popping into existence mid-animation is
 * never what anyone meant. Only positions and drawings belong to one moment.
 */
function allFrames(): Frame[] {
  return state.frames
}
```

Then change each cast operation to loop. `addCounter`:

```ts
function addCounter(color: CounterColor): Counter {
  commit()
  const counter: Counter = {
    id: newId(),
    color,
    label: '',
    pos: nextCounterPosition(),
  }
  // Same id and same spot on every frame, so a new player stands still until
  // the coach moves them somewhere.
  for (const frame of allFrames()) frame.counters.push(clone(counter))
  return counter
}
```

`deleteCounter`:

```ts
function deleteCounter(id: string): void {
  const index = state.counters.findIndex((c) => c.id === id)
  if (index === -1) return
  commit()
  for (const frame of allFrames()) {
    const victim = frame.counters.find((c) => c.id === id)
    if (victim && frame.ball.attachedTo === id) {
      frame.ball.pos = { ...victim.pos }
      frame.ball.attachedTo = null
    }
    frame.counters = rawFilter(frame.counters, (c) => c.id !== id)
  }
}
```

`setCounterLabel`:

```ts
function setCounterLabel(id: string, label: string): void {
  const counter = counterById(id)
  if (!counter) return
  commit()
  const clean = label.trim().slice(0, 4)
  for (const frame of allFrames()) {
    const target = frame.counters.find((c) => c.id === id)
    if (target) target.label = clean
  }
}
```

`addMarker`:

```ts
function addMarker(at: Vec): Marker {
  commit()
  const marker: Marker = { id: newId(), pos: clampToPitch(at) }
  for (const frame of allFrames()) frame.markers.push(clone(marker))
  return marker
}
```

`deleteMarker`:

```ts
function deleteMarker(id: string): void {
  if (!markerById(id)) return
  commit()
  for (const frame of allFrames()) {
    frame.markers = rawFilter(frame.markers, (m) => m.id !== id)
  }
}
```

`addLabel`:

```ts
function addLabel(at: Vec, text: string): Label | null {
  const clean = cleanLabelText(text)
  if (clean === '') return null
  commit()
  const label: Label = { id: newId(), pos: clampToPitch(at), text: clean }
  for (const frame of allFrames()) frame.labels.push(clone(label))
  return label
}
```

`setLabelText`:

```ts
function setLabelText(id: string, text: string): void {
  const label = labelById(id)
  if (!label) return
  const clean = cleanLabelText(text)
  commit()
  for (const frame of allFrames()) {
    if (clean === '') {
      frame.labels = rawFilter(frame.labels, (l) => l.id !== id)
      continue
    }
    const target = frame.labels.find((l) => l.id === id)
    if (target) target.text = clean
  }
}
```

`deleteLabel`:

```ts
function deleteLabel(id: string): void {
  if (!labelById(id)) return
  commit()
  for (const frame of allFrames()) {
    frame.labels = rawFilter(frame.labels, (l) => l.id !== id)
  }
}
```

`clearCounters`:

```ts
function clearCounters(): void {
  if (state.counters.length === 0) return
  commit()
  for (const frame of allFrames()) {
    if (frame.ball.attachedTo) {
      frame.ball.pos = ballPositionIn(frame)
      frame.ball.attachedTo = null
    }
    frame.counters = []
  }
}
```

Import `ballPositionIn` from `'../animation'` for that. `clearDrawings`:

```ts
function clearDrawings(): void {
  if (state.frames.every((frame) => frame.drawings.length === 0)) return
  commit()
  for (const frame of allFrames()) frame.drawings = []
}
```

- [ ] **Step 5: Split the translate arithmetic out and teach the group operations about frames**

Replace `translateGroup` with a two-part version:

```ts
/**
 * Slide a set of points, trimming the move so the shape stays on the pitch.
 *
 * The delta is trimmed rather than each point clamped: clamping collapses a
 * shape against the touchline, and trimming lets a shape already on an edge
 * keep sliding along it. Something wider than the pitch cannot be brought
 * inside and squeezing it would distort it, so the room it has is allowed to
 * go negative and the min/max simply cancel the move on that axis.
 */
function translatePoints(points: Vec[], delta: Vec): void {
  if (points.length === 0) return

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)

  const dx = Math.min(PITCH_W - Math.max(...xs), Math.max(-Math.min(...xs), delta.x))
  const dy = Math.min(PITCH_H - Math.max(...ys), Math.max(-Math.min(...ys), delta.y))

  for (const point of points) {
    point.x += dx
    point.y += dy
  }
}

function translateGroup(refs: SelectionRef[], delta: Vec): void {
  translatePoints(refs.flatMap((ref) => pointsOfRef(ref) ?? []), delta)
}
```

Add a frame-addressed variant of `pointsOfRef` beside it, taking the same shape as the existing one but reading a given frame. Keep the existing `pointsOfRef` exactly as it is — PitchBoard hit-tests through it:

```ts
/** The live position points of a reference, within one frame. */
function pointsOfRefIn(frame: Frame, ref: SelectionRef): Vec[] | null {
  if (ref.kind === 'counter') {
    const counter = frame.counters.find((c) => c.id === ref.id)
    return counter ? [counter.pos] : null
  }
  if (ref.kind === 'marker') {
    const marker = frame.markers.find((m) => m.id === ref.id)
    return marker ? [marker.pos] : null
  }
  if (ref.kind === 'label') {
    const label = frame.labels.find((l) => l.id === ref.id)
    return label ? [label.pos] : null
  }
  const drawing = frame.drawings.find((d) => d.id === ref.id)
  return drawing ? pointsOf(drawing) : null
}
```

`deleteGroup` — cast off every frame, drawings off this one:

```ts
function deleteGroup(refs: SelectionRef[]): void {
  if (refs.length === 0) return
  const ids = {
    counter: new Set<string>(),
    marker: new Set<string>(),
    label: new Set<string>(),
    drawing: new Set<string>(),
  }
  for (const ref of refs) ids[ref.kind].add(ref.id)

  commit()

  for (const frame of allFrames()) {
    if (frame.ball.attachedTo && ids.counter.has(frame.ball.attachedTo)) {
      frame.ball.pos = ballPositionIn(frame)
      frame.ball.attachedTo = null
    }
    frame.counters = rawFilter(frame.counters, (c) => !ids.counter.has(c.id))
    frame.markers = rawFilter(frame.markers, (m) => !ids.marker.has(m.id))
    frame.labels = rawFilter(frame.labels, (l) => !ids.label.has(l.id))
  }

  // Drawings belong to the moment, so only this one loses them.
  state.drawings = rawFilter(state.drawings, (d) => !ids.drawing.has(d.id))
}
```

`duplicateGroup` — the copy joins the cast on every frame, offset from wherever the original stands on that frame, so a duplicated player repeats the original's run rather than standing still through it:

```ts
function duplicateGroup(refs: SelectionRef[], offset: Vec): SelectionRef[] {
  const live = refs.filter((ref) => pointsOfRef(ref) !== null)
  if (live.length === 0) return []

  commit()

  // One new id per original, shared by that original's copy on every frame,
  // so the copies are one player rather than one per moment.
  const copies: SelectionRef[] = live.map((ref) => ({ kind: ref.kind, id: newId() }))

  for (const frame of allFrames()) {
    const isCurrent = frame === toRaw(state).frames[state.currentFrame]
    const made: SelectionRef[] = []

    live.forEach((ref, i) => {
      const copyId = copies[i].id
      if (ref.kind === 'counter') {
        const original = frame.counters.find((c) => c.id === ref.id)
        if (!original) return
        // Cloned whole rather than field by field, so anything a counter
        // grows later comes along without being listed here. A copy never
        // inherits the ball: a drill has one ball, and duplicating a shape is
        // not a reason to grow another.
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.counters.push(copy)
      } else if (ref.kind === 'marker') {
        const original = frame.markers.find((m) => m.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.markers.push(copy)
      } else if (ref.kind === 'label') {
        const original = frame.labels.find((l) => l.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.labels.push(copy)
      } else {
        // Drawings belong to the moment, so only this one gets a copy.
        if (!isCurrent) return
        const original = frame.drawings.find((d) => d.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.drawings.push(copy)
      }
      made.push(copies[i])
    })

    // Each frame is trimmed against the pitch on its own, so a copy made
    // beside a touchline in one moment is not pushed off in another.
    translatePoints(made.flatMap((ref) => pointsOfRefIn(frame, ref) ?? []), offset)
  }

  return copies
}
```

Add `translatePoints` to the `board` object; `pointsOfRefIn` stays private.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run tests/useBoard.frames.spec.ts`
Expected: PASS.

Run: `npm test` — the existing 623 must still pass, because with one frame drill-wide and current-frame-only are the same thing. `npm run build` clean.

- [ ] **Step 7: Commit**

```bash
git add src/composables/useBoard.ts tests/useBoard.frames.spec.ts
git commit -m "feat: add, remove and reorder the moments of a drill

A new frame is a copy of the one you are on, because the next moment of a
drill is nearly always the same players a few yards further on. Selecting
a frame is not undoable: reading five moments should not bury real work
under five entries that changed nothing.

The cast is drill-wide. Adding, removing or renumbering a player, cone or
label reaches every frame; only positions and drawings belong to one
moment. A squad does not change halfway through a session, and it is what
makes tweening by id total rather than a special case.

A duplicated player joins every frame, offset from wherever the original
stands in that moment, so the copy repeats the run rather than standing
still through it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Saving, loading and migrating

**Files:**
- Modify: `src/types.ts` (`Pattern`), `src/composables/useStorage.ts`
- Test: `tests/useStorage.spec.ts` (extend and repair)

**Interfaces:**
- Consumes: `BoardSnapshot` (Task 2), `Frame` (Task 1).
- Produces: `toPattern` writes `version: 2` with per-frame drawings; `patternToSnapshot` and the draft reader both accept the old shape and return the new one.

- [ ] **Step 1: Update `Pattern`**

In `src/types.ts`:

```ts
export type Pattern = {
  id: string
  name: string
  version: 2
  pitch: { type: PitchType; rotated: boolean }
  /**
   * Where drawings lived before they belonged to a moment. Read into the
   * first frame when a v1 pattern is opened, and never written again.
   */
  drawings?: Drawing[]
  labelsVisible?: boolean
  notes?: string
  notesVisible?: boolean
  frames: Frame[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/useStorage.spec.ts`. Use whatever local pattern-building helpers that file already has; these are written against the raw shapes so they do not depend on them:

```ts
describe('opening a pattern saved before playback existed', () => {
  it('reads its pattern-level drawings into the first frame', () => {
    const v1 = {
      id: 'p1',
      name: 'Old drill',
      version: 1,
      pitch: { type: 'full', rotated: false },
      drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
      frames: [
        {
          counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 10, y: 10 } }],
          markers: [],
          labels: [],
          ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    localStorage.setItem('fct.patterns.v1', JSON.stringify([v1]))

    const storage = useStorage()
    const [pattern] = storage.listPatterns()
    const snap = storage.patternToSnapshot(pattern)

    expect(snap.frames).toHaveLength(1)
    expect(snap.frames[0].drawings).toHaveLength(1)
    expect(snap.frames[0].counters).toHaveLength(1)
    expect(snap.currentFrame).toBe(0)
  })

  it('is written back as version 2 with the drawings on the frame', () => {
    const storage = useStorage()
    const saved = storage.savePattern('Drill', {
      frames: [
        {
          counters: [],
          markers: [],
          labels: [],
          ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
          drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
        },
      ],
      currentFrame: 0,
      labelsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    expect(saved.version).toBe(2)
    expect(saved.drawings).toBeUndefined()
    expect(saved.frames[0].drawings).toHaveLength(1)
  })
})

describe('a multi-frame pattern round-trips', () => {
  it('keeps every frame and its duration', () => {
    const storage = useStorage()
    const frame = (duration?: number) => ({
      counters: [],
      markers: [],
      labels: [],
      ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
      drawings: [],
      ...(duration === undefined ? {} : { duration }),
    })
    const saved = storage.savePattern('Drill', {
      frames: [frame(), frame(400), frame(600)],
      currentFrame: 2,
      labelsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })

    const back = storage.patternToSnapshot(saved)
    expect(back.frames).toHaveLength(3)
    expect(back.frames[1].duration).toBe(400)
    expect(back.frames[2].duration).toBe(600)
  })

  it('always opens on the first frame, because that is where a drill starts', () => {
    const storage = useStorage()
    const frame = () => ({
      counters: [],
      markers: [],
      labels: [],
      ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
      drawings: [],
    })
    const saved = storage.savePattern('Drill', {
      frames: [frame(), frame()],
      currentFrame: 1,
      labelsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })
    expect(storage.patternToSnapshot(saved).currentFrame).toBe(0)
  })
})

describe('restoring a draft saved before playback existed', () => {
  it('wraps the flat board into a single frame', () => {
    localStorage.setItem(
      'fct.draft.v1',
      JSON.stringify({
        counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 10, y: 10 } }],
        markers: [],
        labels: [],
        labelsVisible: true,
        notes: 'old',
        notesVisible: true,
        ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
        drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
        pitch: { type: 'blank', rotated: false },
      }),
    )

    const draft = useStorage().readDraft()
    expect(draft).not.toBeNull()
    expect(draft!.frames).toHaveLength(1)
    expect(draft!.frames[0].counters).toHaveLength(1)
    expect(draft!.frames[0].drawings).toHaveLength(1)
    expect(draft!.notes).toBe('old')
    expect(draft!.currentFrame).toBe(0)
  })

  it('reads a framed draft straight back', () => {
    const storage = useStorage()
    storage.saveDraft({
      frames: [
        {
          counters: [],
          markers: [],
          labels: [],
          ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
          drawings: [],
        },
        {
          counters: [],
          markers: [],
          labels: [],
          ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
          drawings: [],
          duration: 250,
        },
      ],
      currentFrame: 1,
      labelsVisible: true,
      notes: '',
      notesVisible: true,
      pitch: { type: 'blank', rotated: false },
    })
    const draft = storage.readDraft()
    expect(draft!.frames).toHaveLength(2)
    expect(draft!.currentFrame).toBe(1)
  })

  it('still throws away a draft whose frame is damaged, rather than bricking the app', () => {
    localStorage.setItem(
      'fct.draft.v1',
      JSON.stringify({ frames: [{ counters: 'not an array' }], currentFrame: 0 }),
    )
    expect(useStorage().readDraft()).toBeNull()
  })
})
```

The literal snapshots in this file were already brought onto the new shape in Task 2, so nothing existing needs repairing here — only the new cases above are added.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run tests/useStorage.spec.ts`
Expected: FAIL on the new cases — `saved.version` is 1, `frames[0].drawings` is undefined, and the draft comes back without `frames`.

- [ ] **Step 4: Update `useStorage.ts`**

Set `const SCHEMA_VERSION = 2`, and accept the older one on read:

```ts
/** Versions this build can open. Only SCHEMA_VERSION is ever written. */
const READABLE_VERSIONS = new Set([1, 2])
```

Replace the version check in the validator:

```ts
if (typeof value.version !== 'number' || !READABLE_VERSIONS.has(value.version)) {
  throw new Error('That pattern was saved by a different version of this app.')
}
```

Keep the existing pattern-level `drawings` check, but make it tolerate absence, since a v2 pattern has none:

```ts
if (value.drawings !== undefined) {
  if (!Array.isArray(value.drawings)) throw new Error('That pattern is missing its drawings.')
  if (!value.drawings.every(isValidDrawing)) {
    throw new Error('That pattern has a damaged drawing.')
  }
}
```

and add a per-frame drawings check inside the existing frame loop:

```ts
if (frame.drawings !== undefined) {
  if (!Array.isArray(frame.drawings) || !frame.drawings.every(isValidDrawing)) {
    throw new Error('That pattern has a damaged drawing.')
  }
}
```

Add the migration helper:

```ts
/**
 * Fill in what a frame saved by an older build does not have.
 *
 * A v1 pattern kept its drawings at the pattern level, where they hung over
 * the whole drill. They belong to the first frame now — the only frame a v1
 * pattern has.
 */
function frameWithDefaults(frame: Record<string, unknown>, legacyDrawings: Drawing[]): Frame {
  return {
    counters: (frame.counters ?? []) as Counter[],
    markers: (frame.markers ?? []) as Marker[],
    labels: (frame.labels ?? []) as Label[],
    ball: withBallDefaults(frame.ball) as Ball,
    drawings: (frame.drawings ?? legacyDrawings) as Drawing[],
    ...(typeof frame.duration === 'number' ? { duration: frame.duration } : {}),
  }
}
```

`toPattern` writes the new shape:

```ts
function toPattern(name: string, snap: BoardSnapshot, id: string, createdAt: string): Pattern {
  const copy = structuredClone(snap)
  return {
    id,
    name,
    version: SCHEMA_VERSION,
    pitch: copy.pitch,
    frames: copy.frames,
    labelsVisible: copy.labelsVisible ?? true,
    notes: copy.notes ?? '',
    notesVisible: copy.notesVisible ?? true,
    createdAt,
    updatedAt: nowIso(),
  }
}
```

`patternToSnapshot` reads either:

```ts
function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern) as unknown as Record<string, unknown>
  const legacy = (copy.drawings ?? []) as Drawing[]
  const frames = (copy.frames as Record<string, unknown>[]).map((frame, index) =>
    // Only the first frame inherits the legacy drawings. A v1 pattern has no
    // others, and a v2 one has no legacy drawings to inherit.
    frameWithDefaults(frame, index === 0 ? legacy : []),
  )
  return {
    // A drill starts at the beginning. Reopening halfway through the
    // animation is never what anyone meant by opening a pattern.
    frames: frames.length > 0 ? frames : [emptyFrameData()],
    currentFrame: 0,
    labelsVisible: (copy.labelsVisible as boolean | undefined) ?? true,
    notes: (copy.notes as string | undefined) ?? '',
    notesVisible: (copy.notesVisible as boolean | undefined) ?? true,
    pitch: copy.pitch as BoardSnapshot['pitch'],
  }
}
```

Add a local `emptyFrameData()` returning the same literal `emptyFrame()` does in `useBoard` — it is two lines and importing across would tangle the two modules.

`isValidSnapshot` accepts both shapes:

```ts
/**
 * Validate an untrusted value as a board snapshot, to the same standard the
 * library path applies, reusing the same predicates.
 *
 * A draft that passes a weaker check than the library is worse than no check
 * at all: a draft missing its ball is restored, the ball's position throws
 * during render, and because the draft is reloaded on every start the app is
 * bricked with no way back from inside it.
 *
 * A draft written before playback existed is flat, so both shapes are
 * accepted and the flat one is wrapped into a single frame on the way out.
 */
function isValidFrameData(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.counters) &&
    value.counters.every(isValidCounter) &&
    markersOf(value).every(isValidMarker) &&
    labelsOf(value).every(isValidLabel) &&
    isValidBall(value.ball) &&
    (value.drawings === undefined ||
      (Array.isArray(value.drawings) && value.drawings.every(isValidDrawing)))
  )
}

function isValidSnapshot(value: unknown): boolean {
  if (!isObject(value)) return false
  if (!isValidPitch(value.pitch)) return false
  if (Array.isArray(value.frames)) {
    return value.frames.length > 0 && value.frames.every(isValidFrameData)
  }
  return isValidFrameData(value)
}
```

Keep whatever other checks the existing `isValidSnapshot` makes — read it before replacing it, and carry them across rather than dropping them.

Then wrap on read, wherever `readDraft` currently returns the parsed value:

```ts
function toSnapshot(value: Record<string, unknown>): BoardSnapshot {
  const frames = Array.isArray(value.frames)
    ? (value.frames as Record<string, unknown>[]).map((frame) => frameWithDefaults(frame, []))
    : // A draft from before playback existed: the whole board was one moment.
      [frameWithDefaults(value, [])]
  return {
    frames,
    currentFrame: Math.max(0, Math.min((value.currentFrame as number) ?? 0, frames.length - 1)),
    labelsVisible: (value.labelsVisible as boolean | undefined) ?? true,
    notes: (value.notes as string | undefined) ?? '',
    notesVisible: (value.notesVisible as boolean | undefined) ?? true,
    pitch: value.pitch as BoardSnapshot['pitch'],
  }
}
```

Note the flat branch reads `value.drawings` through `frameWithDefaults`'s `frame.drawings`, which is exactly where a flat draft keeps them.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/useStorage.spec.ts`
Expected: PASS.

Run: `npm test` and `npm run build`. Both clean.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/composables/useStorage.ts tests/useStorage.spec.ts
git commit -m "feat: save and open a drill with more than one moment

Patterns are version 2, with drawings on the frame that owns them. A v1
pattern opens with its pattern-level drawings read into its only frame,
and is written back as v2 the next time it is saved. Nothing writes v1
again.

The autosaved draft gets the same treatment: a flat one from an older
build is wrapped into a single frame on the way in. It is still validated
as strictly as the library, because a draft is reloaded on every start,
so a bad one that renders as an exception leaves no way back from inside
the app.

Opening a pattern always lands on the first frame. Reopening halfway
through the animation is never what anyone meant by opening a drill.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The playhead, and what the board renders

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.playback.spec.ts` (create)

**Interfaces:**
- Consumes: `timelineOf`, `interpolateFrames`, `ballPositionIn`, `FrameView` from `src/animation.ts`; frame operations from Task 3.
- Produces, on the `board` object:
  ```ts
  playback: { playing: boolean; at: number }     // reactive; `at` is ms from the start
  timeline: ComputedRef<Timeline>
  view: ComputedRef<FrameView>
  viewBallPosition: ComputedRef<Vec>
  isDerived: ComputedRef<boolean>                // true while the view is a blend
  function play(): void
  function pause(): void
  function rewind(): void
  function scrubTo(ms: number): void
  function endScrub(): void
  ```
  `goToFrame` also moves the playhead to that frame's start.

The clock uses `requestAnimationFrame`, which jsdom provides. Tests drive `scrubTo` rather than waiting on frames — the clock itself is verified in the browser.

- [ ] **Step 1: Write the failing tests**

Create `tests/useBoard.playback.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

const board = useBoard()

/** Two frames, a player at each end, 1000ms between them. */
function twoFrameDrill(): string {
  board.addCounter('red')
  const id = board.state.counters[0].id
  board.moveCounter(id, { x: 10, y: 30 })
  board.addFrame()
  board.moveCounter(id, { x: 50, y: 30 })
  board.setFrameDuration(1, 1000)
  board.goToFrame(0)
  return id
}

beforeEach(() => {
  __resetBoardForTests()
})

describe('parked on a frame', () => {
  it('the view is the frame’s own arrays, not a copy', () => {
    board.addCounter('red')
    expect(board.view.value.counters).toBe(board.state.frames[0].counters)
  })

  it('nothing is derived, so editing is allowed', () => {
    expect(board.isDerived.value).toBe(false)
  })

  it('a one-frame drill can never be anywhere else', () => {
    board.scrubTo(5000)
    expect(board.isDerived.value).toBe(false)
    expect(board.view.value.counters).toBe(board.state.frames[0].counters)
  })
})

describe('between two frames', () => {
  it('the view is a blend', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    const shown = board.view.value.counters.find((c) => c.id === id)!
    expect(shown.pos.x).toBeCloseTo(30, 6)
    expect(board.isDerived.value).toBe(true)
  })

  it('the frame under the playhead is the current one', () => {
    twoFrameDrill()
    board.scrubTo(500)
    expect(board.state.currentFrame).toBe(0)
    board.scrubTo(1000)
    expect(board.state.currentFrame).toBe(1)
  })

  it('the board itself has not moved — only the view has', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    expect(board.state.frames[0].counters.find((c) => c.id === id)!.pos.x).toBe(10)
  })
})

describe('editing while the view is derived', () => {
  it('is refused', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    board.moveCounter(id, { x: 99, y: 1 })
    expect(board.state.frames[0].counters.find((c) => c.id === id)!.pos.x).toBe(10)
  })

  it('is refused for anything that would commit, too', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    board.deleteCounter(id)
    expect(board.state.frames[0].counters).toHaveLength(1)
    expect(board.canUndo.value).toBe(true) // the setup's entries, not a new one
  })

  it('leaves the drill-wide settings alone — a coach can still rotate or jot a note', () => {
    twoFrameDrill()
    board.scrubTo(500)
    board.setNotes('two touch')
    board.toggleRotated()
    expect(board.state.notes).toBe('two touch')
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('is allowed again once the scrub ends', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    board.endScrub()
    board.moveCounter(id, { x: 40, y: 20 })
    expect(board.state.counters.find((c) => c.id === id)!.pos).toEqual({ x: 40, y: 20 })
  })
})

describe('ending a scrub', () => {
  it('snaps to the nearer frame rather than leaving the board mid-move', () => {
    twoFrameDrill()
    board.scrubTo(400)
    board.endScrub()
    expect(board.state.currentFrame).toBe(0)
    expect(board.isDerived.value).toBe(false)

    board.scrubTo(700)
    board.endScrub()
    expect(board.state.currentFrame).toBe(1)
    expect(board.isDerived.value).toBe(false)
  })
})

describe('the transport', () => {
  it('play sets it going', () => {
    twoFrameDrill()
    board.play()
    expect(board.playback.playing).toBe(true)
    board.pause()
    expect(board.playback.playing).toBe(false)
  })

  it('play at the very end starts again from the beginning', () => {
    twoFrameDrill()
    board.scrubTo(1000)
    board.endScrub()
    board.play()
    expect(board.playback.at).toBe(0)
  })

  it('a one-frame drill has nothing to play', () => {
    board.play()
    expect(board.playback.playing).toBe(false)
  })

  it('rewind goes back to the start and stops', () => {
    twoFrameDrill()
    board.scrubTo(600)
    board.play()
    board.rewind()
    expect(board.playback.at).toBe(0)
    expect(board.playback.playing).toBe(false)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('the playhead follows the board', () => {
  it('going to a frame moves it to that frame’s start', () => {
    twoFrameDrill()
    board.goToFrame(1)
    expect(board.playback.at).toBe(1000)
    expect(board.isDerived.value).toBe(false)
  })

  it('undo puts it back somewhere real', () => {
    twoFrameDrill()
    board.goToFrame(1)
    board.undo()
    expect(board.playback.at).toBe(board.timeline.value.startOf(board.state.currentFrame))
  })
})

describe('the ball in the view', () => {
  it('is drawn where the view says, not where the board says', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.moveCounter(id, { x: 10, y: 30 })
    board.dropBall({ x: 10, y: 30 })
    board.addFrame()
    board.moveCounter(id, { x: 50, y: 30 })
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)

    board.scrubTo(500)
    expect(board.view.value.ball.attachedTo).toBeNull()
    expect(board.viewBallPosition.value.x).toBeGreaterThan(10)
    expect(board.viewBallPosition.value.x).toBeLessThan(50)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/useBoard.playback.spec.ts`
Expected: FAIL — `board.view is undefined`.

- [ ] **Step 3: Add the playhead**

In `src/composables/useBoard.ts`, below the state declaration:

```ts
/**
 * Where the drill is being watched from.
 *
 * `at` is milliseconds from the start of the drill. It is not part of the
 * snapshot: it is where the coach is looking, not something about the drill,
 * so it is neither saved nor undone. `currentFrame` is the part that is.
 *
 * The invariant, whenever the board is not playing and not being scrubbed:
 * `at === timeline.startOf(state.currentFrame)`.
 */
const playback = reactive({ playing: false, at: 0 })
let scrubbing = false

const timeline = computed(() => timelineOf(state.frames))

const position = computed(() => timeline.value.at(playback.at))

/**
 * What the board draws.
 *
 * Parked on a frame this is the frame's own arrays, by identity, so nothing
 * about editing or rendering changes from before frames existed. Between two
 * frames it is a blend, which is derived and must never be written to — see
 * `isDerived`.
 */
const view = computed<FrameView>(() => {
  const { index, t } = position.value
  const frame = state.frames[index]
  if (t === 0 || index + 1 >= state.frames.length) return frame
  return interpolateFrames(frame, state.frames[index + 1], t)
})

const viewBallPosition = computed(() => ballPositionIn(view.value))

/** True while what is on screen is a blend rather than a frame. */
const isDerived = computed(() => playback.playing || position.value.t !== 0)
```

Import `computed` is already imported; add `interpolateFrames`, `timelineOf`, `ballPositionIn` and `type FrameView` from `'../animation'`.

- [ ] **Step 4: Add the transport**

```ts
let rafHandle: number | null = null
let lastTick = 0

function stopClock(): void {
  if (rafHandle !== null) cancelAnimationFrame(rafHandle)
  rafHandle = null
}

/**
 * Delta-timed rather than frame-counted, so a drill plays at the speed the
 * coach set it to on a slow tablet as well as a fast laptop.
 */
function tick(now: number): void {
  if (!playback.playing) return
  const delta = lastTick === 0 ? 0 : now - lastTick
  lastTick = now
  playback.at = Math.min(playback.at + delta, timeline.value.total)
  state.currentFrame = position.value.index
  if (playback.at >= timeline.value.total) {
    // Stops on the last frame. The exported GIF loops; a drill being
    // demonstrated wants to end somewhere.
    pause()
    return
  }
  rafHandle = requestAnimationFrame(tick)
}

function play(): void {
  if (playback.playing) return
  if (timeline.value.total <= 0) return
  // At the very end, play means play again — a button that appears to do
  // nothing is worse than one that starts over.
  if (playback.at >= timeline.value.total) playback.at = 0
  scrubbing = false
  playback.playing = true
  lastTick = 0
  state.currentFrame = position.value.index
  rafHandle = requestAnimationFrame(tick)
}

function pause(): void {
  playback.playing = false
  stopClock()
  state.currentFrame = position.value.index
}

function rewind(): void {
  pause()
  playback.at = 0
  state.currentFrame = 0
}

/** Drag-time. Leaves the view derived, so editing stays blocked. */
function scrubTo(ms: number): void {
  pause()
  scrubbing = true
  playback.at = Math.max(0, Math.min(ms, timeline.value.total))
  state.currentFrame = position.value.index
}

/**
 * Release. Lands on the nearer frame, so the board is never left parked
 * mid-move refusing every drag with nothing on screen saying why.
 */
function endScrub(): void {
  scrubbing = false
  const { index, t } = position.value
  const target = t > 0.5 ? Math.min(index + 1, state.frames.length - 1) : index
  goToFrame(target)
}
```

`scrubbing` is only read by `endScrub` today; keep it, because Task 8's slider needs to know a drag is in flight to avoid fighting the clock.

Extend `goToFrame` to move the playhead with it:

```ts
function goToFrame(index: number): void {
  if (index < 0 || index >= state.frames.length) return
  pause()
  state.currentFrame = index
  playback.at = timeline.value.startOf(index)
}
```

And make `apply` restore the invariant, since undo and loading can both change how many frames there are:

```ts
function apply(snap: BoardSnapshot): void {
  // ...existing body...
  playback.playing = false
  stopClock()
  scrubbing = false
  playback.at = timeline.value.startOf(state.currentFrame)
}
```

- [ ] **Step 5: Block edits while the view is derived**

Add one guard and use it in every mutator:

```ts
/**
 * Refuse a change while the board is showing a blend of two frames.
 *
 * The blend is a derived object: writing to it would be thrown away on the
 * next tick, and the coach would drag a player and watch nothing happen.
 * Blocking here rather than only in the component means no future caller can
 * forget.
 */
function locked(): boolean {
  return isDerived.value
}
```

**Guard what writes a moment, not what writes the drill.** Moving a player, moving the ball or touching a drawing writes into one frame, and the coach would watch it vanish under the blend on the next tick. Renaming the pattern's notes, rotating the board or hiding the labels are drill-wide, harmless mid-play, and blocking them would be a regression with no benefit.

Add `if (locked()) return` as the first line of:

- the drag-time writers: `moveCounter`, `moveMarker`, `moveLabel`, `moveBall`, `dropBall`, `updateSegment`, `extendPen`, `setArrowBend`, `moveSegmentEnd`, `translateGroup`, `translateDrawing`
- the committing writers of a moment: `deleteCounter`, `setCounterLabel`, `clearCounters`, `deleteMarker`, `setLabelText`, `deleteLabel`, `deleteDrawing`, `clearDrawings`, `deleteGroup`
- the ones that change what is being played: `deleteFrame`, `moveFrame`, `setFrameDuration`, `resetBoard`, `loadSnapshot`, `undo`, `redo`

Three need a return value rather than a bare `return`: `addLabel` (`return null` — it is already `Label | null`), `duplicateGroup` (`return []`), and `addFrame` (`return state.currentFrame`).

Keep `commit` guarded too, as a backstop:

```ts
function commit(): BoardSnapshot {
  const entry = snapshot()
  if (locked()) return entry
  undoStack.value.push(entry)
  // ...
}
```

**Five are deliberately NOT guarded here**, because guarding them would mean changing a return type that dozens of existing tests depend on, for no gain: `addCounter`, `addMarker`, `startPen`, `startArrow` and `startLine`. Every one of them is reached only through `PitchBoard`'s pointer handlers or the toolbar's player swatches, both of which Task 6 and the step below already block. Add a comment saying exactly that where `locked()` is defined, so nobody adds a guard later and breaks thirty tests wondering why it was missing.

Also not guarded: `setNotes`, `toggleNotesVisible`, `toggleLabelsVisible`, `toggleBallVisible`, `setPitchType`, `setRotated` — drill-wide, and there is no reason a coach should not rotate the board or jot a note while watching a drill play.

`restoreSnapshot` is not guarded either: it restores the draft at startup, before anything can be playing.

- [ ] **Step 5b: Block the player swatches while the view is derived**

`addCounter` is unguarded, so its one route in has to be. In both `src/components/Toolbar.vue` and `src/components/ToolRail.vue`, add `:disabled="board.isDerived.value"` to the player colour swatches, with:

```
        title="A player appearing mid-drill is never what anyone meant"
```

on the disabled state, or simply leave the existing title — a greyed swatch reads clearly enough. Both files are covered by their own tests, so the two layouts cannot drift apart on this; add a case to each of `tests/Toolbar.spec.ts` and `tests/ToolRail.spec.ts`:

```ts
it('will not add a player while the drill is playing', async () => {
  const board = useBoard()
  board.addFrame()
  board.setFrameDuration(1, 1000)
  board.goToFrame(0)
  board.scrubTo(500)

  const wrapper = mount(/* as the rest of this file mounts it */)
  expect(wrapper.find('[data-add-counter="red"]').attributes('disabled')).toBeDefined()
  board.endScrub()
})
```

- [ ] **Step 6: Export the new surface**

Add to the `board` object: `playback`, `timeline`, `view`, `viewBallPosition`, `isDerived`, `play`, `pause`, `rewind`, `scrubTo`, `endScrub`.

Add to `__resetBoardForTests`:

```ts
  playback.playing = false
  playback.at = 0
  scrubbing = false
  stopClock()
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run tests/useBoard.playback.spec.ts`
Expected: PASS.

Run: `npm test` and `npm run build`. Both clean.

- [ ] **Step 8: Commit**

```bash
git add src/composables/useBoard.ts tests/useBoard.playback.spec.ts
git commit -m "feat: a playhead, and a view of the board at any moment

Parked on a frame the view is that frame's own arrays, so nothing about
editing or rendering changes from before frames existed. Between two
frames it is a blend, and the board itself is untouched.

Editing is refused whenever the view is a blend, not merely while
playing. The blend is derived, so a write to it would be thrown away on
the next tick and the coach would drag a player and watch nothing happen.
Releasing a scrub lands on the nearer frame, which is the other half of
that: the board is never left parked mid-move refusing every drag with
nothing on screen saying why.

The clock is delta-timed rather than frame-counted, so a drill plays at
the speed it was set to on a slow tablet as well as a fast laptop.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The board renders what the playhead says

**Files:**
- Modify: `src/components/PitchBoard.vue`
- Test: `tests/PitchBoard.spec.ts` (extend)

**Interfaces:**
- Consumes: `board.view`, `board.viewBallPosition`, `board.isDerived` from Task 5.
- Produces: no new exports. `PitchBoard` renders `board.view` and continues to hit-test `board.state`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/PitchBoard.spec.ts`, using whatever mount helper the file already defines:

```ts
describe('rendering the playhead', () => {
  it('draws players where the blend says, not where the frame says', async () => {
    const board = useBoard()
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.moveCounter(id, { x: 10, y: 30 })
    board.addFrame()
    board.moveCounter(id, { x: 50, y: 30 })
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)

    const wrapper = mountBoard()
    board.scrubTo(500)
    await nextTick()

    const counter = wrapper.find(`[data-counter="${id}"]`)
    // Halfway between 10 and 50 under the easing curve, which is even at t=0.5.
    expect(Number(counter.attributes('data-x'))).toBeCloseTo(30, 4)
  })

  it('ignores a press while the view is a blend', async () => {
    const board = useBoard()
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.moveCounter(id, { x: 10, y: 30 })
    board.addFrame()
    board.moveCounter(id, { x: 50, y: 30 })
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)

    const wrapper = mountBoard()
    board.scrubTo(500)
    await nextTick()

    firePointer(wrapper, 'pointerdown', { x: 30, y: 30 })
    firePointer(wrapper, 'pointermove', { x: 80, y: 10 })
    firePointer(wrapper, 'pointerup', { x: 80, y: 10 })

    expect(board.state.frames[0].counters.find((c) => c.id === id)!.pos).toEqual({ x: 10, y: 30 })
  })

  it('follows the coach to another frame', async () => {
    // Carried forward from Task 2's review: the plan rests on a rendered
    // board actually following the current frame, and until now that was
    // only ever asserted by reading state directly, which would pass even
    // if nothing re-rendered.
    const board = useBoard()
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.moveCounter(id, { x: 10, y: 30 })
    board.addFrame()
    board.moveCounter(id, { x: 50, y: 30 })

    const wrapper = mountBoard()
    board.goToFrame(0)
    await nextTick()
    expect(Number(wrapper.find(`[data-counter="${id}"]`).attributes('data-x'))).toBeCloseTo(10, 4)

    board.goToFrame(1)
    await nextTick()
    expect(Number(wrapper.find(`[data-counter="${id}"]`).attributes('data-x'))).toBeCloseTo(50, 4)
  })

  it('clears the selection when play starts', async () => {
    const board = useBoard()
    const drawingId = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(drawingId, { x: 25, y: 25 })
    board.finishDrawing(drawingId)
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)

    const wrapper = mountBoard()
    selectDrawing(wrapper, drawingId)
    expect(wrapper.emitted('selectionSize')?.at(-1)).toEqual([1])

    board.play()
    await nextTick()
    expect(wrapper.emitted('selectionSize')?.at(-1)).toEqual([0])
    board.pause()
  })
})
```

`data-x` and `data-y` may not exist on the counter element. Check `PlayerCounter.vue` first; if it exposes the position another way (a `transform`, a `cx`), assert on that instead — do not add attributes to the component just to make a test easier to write.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/PitchBoard.spec.ts -t "rendering the playhead"`
Expected: FAIL — the counter renders at 10, not 30.

- [ ] **Step 3: Render from the view**

In `src/components/PitchBoard.vue`, change only the *rendering* reads. Hit-testing, `gatherInto`, `pointsOfRef` and the drag logic stay on `board.state`, because those are about what the coach is editing.

Template. Note the `.value`: `board` is a plain object, so a ref inside it is **not** auto-unwrapped in a template. The file already does this with `board.canUndo.value`; follow it.

- `:drawings="board.state.drawings"` becomes `:drawings="board.view.value.drawings"`
- `v-for="marker in board.state.markers"` becomes `v-for="marker in board.view.value.markers"`
- `v-for="counter in board.state.counters"` becomes `v-for="counter in board.view.value.counters"`
- `:has-ball="board.state.ball.visible && board.state.ball.attachedTo === counter.id"` becomes `:has-ball="board.view.value.ball.visible && board.view.value.ball.attachedTo === counter.id"`
- `v-for="label in board.state.labelsVisible ? board.state.labels : []"` becomes `v-for="label in board.state.labelsVisible ? board.view.value.labels : []"` — `labelsVisible` is drill-wide and stays on state
- `v-if="board.state.ball.visible"` becomes `v-if="board.view.value.ball.visible"`

If the repeated `board.view.value` reads badly, add `const view = computed(() => board.view.value)` in the script and use `view` in the template, where a top-level ref *is* unwrapped. Either is fine; pick one and be consistent.

Script:
```ts
const ballPos = computed(() => board.viewBallPosition.value)

/** True only when the ball is actually riding on a counter that still exists. */
const ballAttached = computed(() => {
  const holder = board.view.value.ball.attachedTo
  return holder !== null && board.view.value.counters.some((c) => c.id === holder)
})
```

Add a comment above the first of these explaining the split:

```ts
/*
 * Rendering reads `board.view`; editing reads and writes `board.state`.
 *
 * Parked on a frame the two are the same arrays, so nothing changes. Between
 * two frames the view is a blend and the state is the moment the coach was
 * last on — which is exactly what hit-testing should still be about, except
 * that presses are refused while the view is a blend anyway.
 */
```

- [ ] **Step 4: Refuse input and drop the selection while the view is derived**

At the top of the pointerdown entry point (the handler on the SVG, and each token's grab handler):

```ts
if (board.isDerived.value) return
```

The cleanest place is one guard in `onPointerDown` plus one in each `grab*` handler, because the token handlers do not pass through the SVG one. Find them by searching for `capture(event)`.

And clear the selection when play starts:

```ts
// Playing is for watching. Handles and halos belong to editing, and a
// selection surviving into playback would put them over the animation.
watch(
  () => board.playback.playing,
  (playing) => {
    if (playing) clearSelection()
  },
)
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/PitchBoard.spec.ts`
Expected: PASS, including all the existing cases in that file.

Run: `npm test` and `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/components/PitchBoard.vue tests/PitchBoard.spec.ts
git commit -m "feat: the board draws whatever moment the playhead is on

Rendering reads the view; editing reads and writes the state. Parked on a
frame the two are the same arrays, so nothing about editing changes.

Presses are refused while the view is a blend, and the selection is
dropped when play starts: playing is for watching, and handles and halos
over the top of an animation are furniture the coach is trying to see
past.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The frame strip

**Files:**
- Create: `src/components/FrameStrip.vue`
- Test: `tests/FrameStrip.spec.ts` (create)

**Interfaces:**
- Consumes: `useBoard()` — `state.frames`, `state.currentFrame`, `playback`, `timeline`, `addFrame`, `deleteFrame`, `moveFrame`, `setFrameDuration`, `goToFrame`, `play`, `pause`, `rewind`, `scrubTo`, `endScrub`.
- Produces: a component with no props. Emits nothing — it drives the board directly, as `Toolbar` does.

Test hooks: `[data-add-frame]`, `[data-frame="<index>"]`, `[data-delete-frame]`, `[data-frame-earlier]`, `[data-frame-later]`, `[data-frame-duration]`, `[data-play]`, `[data-rewind]`, `[data-scrub]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/FrameStrip.spec.ts`:

```ts
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import FrameStrip from '../src/components/FrameStrip.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { MAX_FRAME_MS, MIN_FRAME_MS } from '../src/animation'

const board = useBoard()

beforeEach(() => {
  __resetBoardForTests()
})

describe('a drill with one frame', () => {
  it('offers only a way to add another', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-add-frame]').exists()).toBe(true)
    expect(wrapper.find('[data-play]').exists()).toBe(false)
    expect(wrapper.find('[data-scrub]').exists()).toBe(false)
    expect(wrapper.find('[data-frame="0"]').exists()).toBe(false)
  })

  it('adding one opens the strip', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-add-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(2)
    expect(wrapper.find('[data-frame="0"]').exists()).toBe(true)
    expect(wrapper.find('[data-play]').exists()).toBe(true)
  })
})

describe('a drill with several frames', () => {
  beforeEach(() => {
    board.addFrame()
    board.addFrame()
    board.goToFrame(1)
  })

  it('marks the frame you are on', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-frame="1"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-frame="0"]').classes()).not.toContain('is-active')
  })

  it('pressing a frame goes to it', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-frame="2"]').trigger('click')
    expect(board.state.currentFrame).toBe(2)
  })

  it('deletes the frame you are on', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-delete-frame]').trigger('click')
    expect(board.state.frames).toHaveLength(2)
  })

  it('will not delete the last frame', async () => {
    board.deleteFrame(2)
    board.deleteFrame(1)
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-delete-frame]').exists()).toBe(false)
  })

  it('moves the frame you are on earlier and later', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-frame-earlier]').trigger('click')
    expect(board.state.currentFrame).toBe(0)
    await wrapper.find('[data-frame-later]').trigger('click')
    expect(board.state.currentFrame).toBe(1)
  })

  it('cannot move the first frame earlier or the last one later', async () => {
    const wrapper = mount(FrameStrip)
    board.goToFrame(0)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-frame-earlier]').attributes('disabled')).toBeDefined()
    board.goToFrame(2)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-frame-later]').attributes('disabled')).toBeDefined()
  })
})

describe('the duration field', () => {
  beforeEach(() => {
    board.addFrame()
  })

  it('shows the current frame’s duration in seconds', () => {
    board.setFrameDuration(1, 1500)
    const wrapper = mount(FrameStrip)
    expect((wrapper.find('[data-frame-duration]').element as HTMLInputElement).value).toBe('1.5')
  })

  it('sets it, in seconds', async () => {
    const wrapper = mount(FrameStrip)
    const field = wrapper.find('[data-frame-duration]')
    await field.setValue('2.5')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(2500)
  })

  it('clamps what a coach can type', async () => {
    const wrapper = mount(FrameStrip)
    const field = wrapper.find('[data-frame-duration]')
    await field.setValue('0.01')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(MIN_FRAME_MS)
    await field.setValue('900')
    await field.trigger('change')
    expect(board.state.frames[1].duration).toBe(MAX_FRAME_MS)
  })

  it('is hidden on the first frame, which nothing moves into', async () => {
    board.goToFrame(0)
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-frame-duration]').exists()).toBe(false)
  })
})

describe('the transport', () => {
  beforeEach(() => {
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
  })

  it('plays and pauses', async () => {
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-play]').trigger('click')
    expect(board.playback.playing).toBe(true)
    await wrapper.find('[data-play]').trigger('click')
    expect(board.playback.playing).toBe(false)
  })

  it('says which it will do', async () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-play]').attributes('aria-label')).toBe('Play the drill')
    await wrapper.find('[data-play]').trigger('click')
    expect(wrapper.find('[data-play]').attributes('aria-label')).toBe('Pause')
    board.pause()
  })

  it('rewinds', async () => {
    board.scrubTo(600)
    const wrapper = mount(FrameStrip)
    await wrapper.find('[data-rewind]').trigger('click')
    expect(board.playback.at).toBe(0)
  })

  it('scrubs, and lands on a frame when released', async () => {
    const wrapper = mount(FrameStrip)
    const slider = wrapper.find('[data-scrub]')
    await slider.setValue('700')
    expect(board.playback.at).toBe(700)
    await slider.trigger('change')
    expect(board.state.currentFrame).toBe(1)
    expect(board.isDerived.value).toBe(false)
  })

  it('spans the whole drill', () => {
    const wrapper = mount(FrameStrip)
    expect(wrapper.find('[data-scrub]').attributes('max')).toBe('1000')
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/FrameStrip.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/components/FrameStrip.vue"`.

- [ ] **Step 3: Write the component**

Create `src/components/FrameStrip.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_FRAME_MS, MAX_FRAME_MS, MIN_FRAME_MS } from '../animation'
import { useBoard } from '../composables/useBoard'

const board = useBoard()

/**
 * A drill that has never used frames looks exactly as it did before frames
 * existed: one chip offering another moment, and nothing else. The strip
 * opens only once there is a sequence to show.
 */
const hasSequence = computed(() => board.state.frames.length > 1)

const current = computed(() => board.state.currentFrame)
const last = computed(() => board.state.frames.length - 1)

/**
 * Seconds, not milliseconds. A coach thinks in seconds, and a field showing
 * 1500 invites someone to type 2 and wonder why nothing moved.
 */
const durationSeconds = computed(() => {
  const ms = board.state.frames[current.value]?.duration ?? DEFAULT_FRAME_MS
  return String(Math.round(ms) / 1000)
})

function setDuration(event: Event): void {
  const seconds = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(seconds)) return
  board.setFrameDuration(current.value, seconds * 1000)
}

function onScrub(event: Event): void {
  board.scrubTo(Number((event.target as HTMLInputElement).value))
}

function togglePlay(): void {
  if (board.playback.playing) board.pause()
  else board.play()
}
</script>

<template>
  <div class="strip" :class="{ 'is-open': hasSequence }">
    <button
      data-add-frame
      class="chip"
      title="Add a moment, copied from the one you are on"
      @click="board.addFrame()"
    >+ Frame</button>

    <template v-if="hasSequence">
      <div class="frames">
        <button
          v-for="(frame, index) in board.state.frames"
          :key="index"
          :data-frame="index"
          :class="['chip', 'frame', { 'is-active': index === current }]"
          :title="`Go to moment ${index + 1}`"
          @click="board.goToFrame(index)"
        >{{ index + 1 }}</button>
      </div>

      <div class="group">
        <button
          data-frame-earlier
          class="chip"
          :disabled="current === 0"
          title="Move this moment earlier"
          aria-label="Move this moment earlier"
          @click="board.moveFrame(current, current - 1)"
        >◀</button>
        <button
          data-frame-later
          class="chip"
          :disabled="current === last"
          title="Move this moment later"
          aria-label="Move this moment later"
          @click="board.moveFrame(current, current + 1)"
        >▶</button>
        <button
          data-delete-frame
          class="chip"
          title="Remove this moment"
          @click="board.deleteFrame(current)"
        >Delete frame</button>
      </div>

      <!--
        Hidden on the first frame: a duration is how long the move INTO a
        moment takes, and nothing moves into the start of a drill.
      -->
      <label v-if="current > 0" class="duration">
        <span class="duration-label">Takes</span>
        <input
          data-frame-duration
          class="duration-field"
          type="number"
          :min="MIN_FRAME_MS / 1000"
          :max="MAX_FRAME_MS / 1000"
          step="0.1"
          :value="durationSeconds"
          @change="setDuration"
        />
        <span class="duration-label">s</span>
      </label>

      <div class="group transport">
        <button
          data-rewind
          class="chip"
          title="Back to the start"
          aria-label="Back to the start"
          @click="board.rewind()"
        >⏮</button>
        <button
          data-play
          class="chip"
          :title="board.playback.playing ? 'Pause' : 'Play the drill'"
          :aria-label="board.playback.playing ? 'Pause' : 'Play the drill'"
          @click="togglePlay()"
        >{{ board.playback.playing ? '❚❚' : '▶' }}</button>
        <input
          data-scrub
          class="scrub"
          type="range"
          min="0"
          :max="board.timeline.value.total"
          step="10"
          :value="board.playback.at"
          aria-label="Scrub through the drill"
          @input="onScrub"
          @change="board.endScrub()"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0.6rem;
}
.strip.is-open {
  background: #263238;
  color: #eceff1;
  border-radius: 0.4rem;
}
.frames { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.group { display: flex; gap: 0.3rem; align-items: center; }
.transport { flex: 1 1 12rem; min-width: 0; }
.chip {
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
  border-radius: 0.4rem; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem;
}
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.is-active { background: #546e7a; border-color: #ffffff; }
.frame { min-width: 2.2rem; }
.duration { display: flex; gap: 0.3rem; align-items: center; font-size: 0.8rem; }
.duration-field {
  width: 4.5rem; border-radius: 0.3rem; padding: 0.3rem;
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
}
.scrub { flex: 1 1 auto; min-width: 6rem; }

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the side
 * of a pitch. 44px is the smallest reliably hittable target.
 */
@media (pointer: coarse) {
  .chip { min-height: 44px; padding-inline: 0.85rem; }
  .duration-field { min-height: 44px; }
  .scrub { height: 44px; }
}
</style>
```

`MIN_FRAME_MS` and `MAX_FRAME_MS` are used in the template, so they must be in scope in `<script setup>` — they are imported there, which is enough.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/FrameStrip.spec.ts`
Expected: PASS.

Run: `npm test` and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/FrameStrip.vue tests/FrameStrip.spec.ts
git commit -m "feat: a strip for the moments of a drill

One frame shows a single chip offering another and nothing else, so a
board that has never used frames looks exactly as it did. The strip opens
only once there is a sequence to show.

Durations are in seconds, because a coach thinks in seconds and a field
reading 1500 invites someone to type 2 and wonder why nothing moved. The
field is hidden on the first frame: a duration is how long the move INTO
a moment takes, and nothing moves into the start of a drill.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire the strip into the app

**Files:**
- Modify: `src/App.vue`
- Test: `tests/App.spec.ts` (extend)

**Interfaces:**
- Consumes: `FrameStrip` (Task 7), `board.playback` and `board.play`/`pause` (Task 5).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Append to `tests/App.spec.ts`, using whatever mount helper it already defines:

```ts
describe('the frame strip', () => {
  it('is on the page', () => {
    const wrapper = mountApp()
    expect(wrapper.find('[data-add-frame]').exists()).toBe(true)
  })
})

describe('space plays and pauses', () => {
  it('toggles playback', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    mountApp()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    await nextTick()
    expect(board.playback.playing).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    await nextTick()
    expect(board.playback.playing).toBe(false)
  })

  it('is left alone while the coach is typing in the notes', async () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    const wrapper = mountApp()

    const notes = wrapper.find('[data-notes]').element as HTMLTextAreaElement
    document.body.appendChild(notes)
    notes.focus()
    notes.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    await nextTick()
    expect(board.playback.playing).toBe(false)
  })
})

describe('autosave during playback', () => {
  it('does not write a half-tweened board to the draft', async () => {
    const board = useBoard()
    const storage = useStorage()
    board.addCounter('red')
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    mountApp()

    // Let the initial save settle, then note what is on disk.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const before = localStorage.getItem('fct.draft.v1')

    board.play()
    board.scrubTo(500)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(localStorage.getItem('fct.draft.v1')).toBe(before)

    board.pause()
    void storage
  })
})
```

The autosave test uses real timers against the existing 400ms debounce. If `tests/App.spec.ts` already uses fake timers, follow whatever that file does rather than mixing the two.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/App.spec.ts -t "frame strip"`
Expected: FAIL — no `[data-add-frame]` on the page.

- [ ] **Step 3: Put the strip on the page**

In `src/App.vue`, import `FrameStrip` and place it inside `.stage`, under the board:

```vue
      <div class="stage">
        <PitchBoard
          ref="boardRef"
          :tool="tool"
          :draw-color="drawColor"
          @rename="openRenamePrompt"
          @add-label="promptNewLabel"
          @edit-label="promptEditLabel"
          @selection-size="selectionSize = $event"
        />
        <FrameStrip />
      </div>
```

- [ ] **Step 4: Add the Space shortcut**

In the existing keydown handler, beside the other shortcuts. Find how the handler already decides the coach is typing — there is a check for the notes field and the label prompt — and reuse it rather than writing a second one:

```ts
  if (event.key === ' ') {
    // Space is the universal play/pause, but it is also a character. The
    // typing guard above is what keeps a space in the drill notes from
    // starting the animation.
    event.preventDefault()
    if (board.playback.playing) board.pause()
    else board.play()
    return
  }
```

- [ ] **Step 5: Suspend autosave while playing**

The draft watcher fires on every state change. Without this a play-through writes a draft several times a second, and any one of them could be restored on the next start as a half-tweened board.

```ts
watch(
  () => board.state,
  () => {
    // Playing moves the playhead, not the drill. Writing a draft several
    // times a second during a play-through risks restoring a half-tweened
    // board on the next start, and none of it is a change worth saving.
    if (board.isDerived.value) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => storage.saveDraft(board.snapshot()), 400)
  },
  { deep: true },
)
```

Keep the rest of the watcher exactly as it is.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run tests/App.spec.ts`
Expected: PASS.

Run: `npm test` and `npm run build`.

- [ ] **Step 7: Verify in a browser**

```bash
npm run dev -- --port 5180
```

Use port 5180 rather than the default, so this runs on a fresh origin and cannot touch the autosaved draft of any real work in the browser's normal one.

Check by hand, because none of this is visible to jsdom:

1. Drop three players, drag them into a shape, draw a pass arrow.
2. Press **+ Frame**, drag two players and the ball forward. The strip should open with chips 1 and 2.
3. Press **▶**. The players should ease and the ball should fly across in a straight line, detached.
4. Scrub the slider. Release it. The board should land on a frame and accept a drag again.
5. Press **+ Frame** twice more, reorder with ◀ and ▶, set a duration of 0.3s and play again.
6. Undo back through the lot.
7. Refresh. The whole drill, every frame, should come back.

- [ ] **Step 8: Commit**

```bash
git add src/App.vue tests/App.spec.ts
git commit -m "feat: put the frame strip on the page and play with space

Autosave is suspended while the view is a blend. The draft watcher fires
on every state change, and without this a play-through writes a draft
several times a second, any one of which could be restored on the next
start as a half-tweened board.

Space is the universal play and pause, and it is also a character, so it
goes through the same typing guard the other shortcuts already use.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The GIF sampling schedule

**Files:**
- Modify: `src/animation.ts`
- Test: `tests/animation.spec.ts` (extend)

**Interfaces:**
- Consumes: `Frame`, `durationOf`, `timelineOf`.
- Produces:
  ```ts
  export const GIF_FPS = 12.5
  export const GIF_TAIL_MS = 500
  export type GifSample = { atMs: number; delayMs: number }
  export function gifSchedule(frames: Frame[], fps?: number): GifSample[]
  ```

Split out on its own because it is the only part of GIF export that can be tested here: jsdom has no canvas, so the rasterising half cannot be.

- [ ] **Step 1: Write the failing tests**

Add `GIF_FPS`, `GIF_TAIL_MS` and `gifSchedule` to the existing `from '../src/animation'` import at the top of `tests/animation.spec.ts` — do not append a second import block at the bottom of the file. Then append:

```ts
describe('gifSchedule', () => {
  it('samples the whole drill at the given rate', () => {
    // 1000ms at 12.5fps is 80ms a sample: 0, 80, ... 960, then the last frame.
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples[0].atMs).toBe(0)
    expect(samples[1].atMs).toBe(80)
    expect(samples.at(-1)!.atMs).toBe(1000)
  })

  it('holds on the last frame so the loop does not snap', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples.at(-1)!.delayMs).toBe(GIF_TAIL_MS)
  })

  it('gives every other sample the frame interval', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    expect(samples[0].delayMs).toBe(80)
    expect(samples.at(-2)!.delayMs).toBe(80)
  })

  it('uses delays GIF can actually express, in whole hundredths', () => {
    const samples = gifSchedule([frame(), frame({ duration: 1000 })], GIF_FPS)
    for (const sample of samples) expect(sample.delayMs % 10).toBe(0)
  })

  it('never samples past the end of the drill', () => {
    const samples = gifSchedule([frame(), frame({ duration: 250 })], GIF_FPS)
    for (const sample of samples) expect(sample.atMs).toBeLessThanOrEqual(250)
  })

  it('a single frame is one still, held', () => {
    const samples = gifSchedule([frame()], GIF_FPS)
    expect(samples).toEqual([{ atMs: 0, delayMs: GIF_TAIL_MS }])
  })

  it('follows the durations rather than assuming they are equal', () => {
    const samples = gifSchedule([frame(), frame({ duration: 160 }), frame({ duration: 800 })], GIF_FPS)
    expect(samples.at(-1)!.atMs).toBe(960)
    expect(samples).toHaveLength(Math.floor(960 / 80) + 1)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/animation.spec.ts -t gifSchedule`
Expected: FAIL — `gifSchedule is not a function`.

- [ ] **Step 3: Implement it**

Append to `src/animation.ts`:

```ts
/**
 * How often the exported animation is sampled.
 *
 * 12.5 a second is 80ms, and GIF expresses delays in hundredths of a second,
 * so this lands on a whole one. Fast enough to read as movement, slow enough
 * that a ten-second drill is not hundreds of frames.
 */
export const GIF_FPS = 12.5

/** A beat on the last frame, so the loop does not snap back. */
export const GIF_TAIL_MS = 500

export type GifSample = { atMs: number; delayMs: number }

/**
 * When to sample the board, and how long each sample is held.
 *
 * Pure and separate from the rasterising, which is the half that cannot be
 * tested here: jsdom has no canvas.
 */
export function gifSchedule(frames: Frame[], fps = GIF_FPS): GifSample[] {
  // Rounded to a whole hundredth, because that is GIF's unit; anything else
  // is silently rounded by the encoder and the animation drifts.
  const step = Math.max(10, Math.round(1000 / fps / 10) * 10)
  const total = timelineOf(frames).total

  const samples: GifSample[] = []
  for (let at = 0; at < total; at += step) samples.push({ atMs: at, delayMs: step })
  samples.push({ atMs: total, delayMs: GIF_TAIL_MS })
  return samples
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/animation.spec.ts`
Expected: PASS. Then `npm test` and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/animation.ts tests/animation.spec.ts
git commit -m "feat: work out when to sample a drill for export

12.5 a second is 80ms, and GIF expresses delays in hundredths, so it
lands on a whole one — anything else is silently rounded by the encoder
and the animation drifts. The last frame is held half a second so the
loop does not snap back.

Kept separate from the rasterising, because this is the half that can be
tested: jsdom has no canvas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Export the animation

**Files:**
- Modify: `package.json` (add `modern-gif`), `src/composables/useExport.ts`, `src/components/Toolbar.vue`, `src/App.vue`
- Test: `tests/useExport.spec.ts` (extend), `tests/Toolbar.spec.ts` (extend)

**Interfaces:**
- Consumes: `gifSchedule`, `GIF_TAIL_MS` (Task 9); `exportableClone` (already in `useExport`); `board.playback`, `board.scrubTo`, `board.endScrub` (Task 5).
- Produces:
  ```ts
  // useExport
  boardToGifBlob(
    svg: SVGSVGElement,
    samples: GifSample[],
    seek: (atMs: number) => Promise<void>,
    notes?: string,
    pixelWidth?: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Blob>
  ```
  `seek` is injected rather than reached for, so the test can drive it without a board and without a canvas.

- [ ] **Step 1: Install the encoder**

```bash
npm install --save-exact modern-gif@2.1.0
```

Confirm `package.json` shows `"modern-gif": "2.1.0"` with no `^` or `~`.

- [ ] **Step 2: Write the failing tests**

Append to `tests/useExport.spec.ts`:

```ts
describe('boardToGifBlob', () => {
  it('seeks to every sample, in order', async () => {
    const seen: number[] = []
    const seek = async (atMs: number) => {
      seen.push(atMs)
    }
    const { boardToGifBlob } = useExport()

    await boardToGifBlob(svgStub(), [
      { atMs: 0, delayMs: 80 },
      { atMs: 80, delayMs: 80 },
      { atMs: 160, delayMs: 500 },
    ], seek).catch(() => {
      // jsdom cannot rasterise, so this rejects. What is being asserted is
      // that it seeked first, in order.
    })

    expect(seen).toEqual([0, 80, 160])
  })

  it('reports progress as it goes', async () => {
    const progress: Array<[number, number]> = []
    const { boardToGifBlob } = useExport()

    await boardToGifBlob(
      svgStub(),
      [{ atMs: 0, delayMs: 80 }, { atMs: 80, delayMs: 500 }],
      async () => {},
      '',
      800,
      (done, total) => progress.push([done, total]),
    ).catch(() => {})

    expect(progress[0]).toEqual([0, 2])
  })
})
```

`svgStub()` builds a minimal `<svg viewBox="0 0 100 64.76">` element. If `tests/useExport.spec.ts` already has such a helper for the PNG tests, use that one.

Append to `tests/Toolbar.spec.ts`:

```ts
describe('the GIF button', () => {
  it('is hidden while the drill is a single moment, because PNG covers that', () => {
    const wrapper = mount(Toolbar, { props: { tool: 'select', drawColor: '#fff' } })
    expect(wrapper.find('[data-export-gif]').exists()).toBe(false)
  })

  it('appears once there is something to animate', async () => {
    const board = useBoard()
    board.addFrame()
    const wrapper = mount(Toolbar, { props: { tool: 'select', drawColor: '#fff' } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-export-gif]').exists()).toBe(true)
  })

  it('asks the app to export', async () => {
    const board = useBoard()
    board.addFrame()
    const wrapper = mount(Toolbar, { props: { tool: 'select', drawColor: '#fff' } })
    await wrapper.find('[data-export-gif]').trigger('click')
    expect(wrapper.emitted('exportGif')).toHaveLength(1)
  })
})
```

Match the mount options and prop names the rest of `tests/Toolbar.spec.ts` uses rather than the sketch above.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run tests/useExport.spec.ts tests/Toolbar.spec.ts`
Expected: FAIL — `boardToGifBlob is not a function`, and no `[data-export-gif]`.

- [ ] **Step 4: Add `boardToGifBlob`**

In `src/composables/useExport.ts`:

```ts
import { encode } from 'modern-gif'
import type { GifSample } from '../animation'
```

Extract the notes-band drawing that `svgToPngBlob` already does into a shared helper so the GIF gets the same band without a second copy of the layout constants — read `svgToPngBlob` and lift the block that measures, sizes the canvas and fills the band into:

```ts
/**
 * Draw the board onto a canvas, with the drill notes in a band beneath it.
 *
 * Shared by the still and the animation, so a change to the layout cannot
 * apply to one and not the other.
 */
function drawBoard(
  image: HTMLImageElement,
  notes: string,
  width: number,
  boardHeight: number,
): HTMLCanvasElement { /* ...the existing body, returning the canvas... */ }
```

Then:

```ts
/** Serialise the board as it stands and decode it as an image. */
function rasterise(svg: SVGSVGElement, width: number, boardHeight: number): Promise<HTMLImageElement> {
  const clone = exportableClone(svg)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(boardHeight))
  const source = new XMLSerializer().serializeToString(clone)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The board could not be converted to an image.'))
    image.src = dataUrl
  })
}

/**
 * Rasterise the drill one sample at a time and encode the result as a GIF.
 *
 * It samples the LIVE board rather than drawing the frames itself, which is
 * why `seek` is a parameter: the caller moves the playhead and waits for Vue
 * to render, and what is captured is exactly what the coach just watched.
 * The bend dots and endpoint rings are excluded by the same `data-transient`
 * rule that already keeps them out of the PNG.
 *
 * 800px rather than the still's 1600: every sample pays for the width.
 */
async function boardToGifBlob(
  svg: SVGSVGElement,
  samples: GifSample[],
  seek: (atMs: number) => Promise<void>,
  notes = '',
  pixelWidth = 800,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const viewBox = (svg.getAttribute('viewBox') ?? '0 0 100 65').split(/\s+/).map(Number)
  const aspect = viewBox[2] / viewBox[3]
  const width = pixelWidth
  const boardHeight = Math.round(pixelWidth / aspect)

  const gifFrames: Array<{ data: ImageData; delay: number }> = []
  let canvasWidth = width
  let canvasHeight = boardHeight

  for (const [index, sample] of samples.entries()) {
    onProgress?.(index, samples.length)
    await seek(sample.atMs)
    const image = await rasterise(svg, width, boardHeight)
    const canvas = drawBoard(image, notes, width, boardHeight)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not create the image.')
    canvasWidth = canvas.width
    canvasHeight = canvas.height
    gifFrames.push({
      data: context.getImageData(0, 0, canvas.width, canvas.height),
      delay: sample.delayMs,
    })
  }

  onProgress?.(samples.length, samples.length)

  const output = await encode({
    width: canvasWidth,
    height: canvasHeight,
    // 0 means forever. A drill read once is a drill half read.
    looped: true,
    frames: gifFrames,
  })

  return new Blob([output], { type: 'image/gif' })
}
```

Add `boardToGifBlob` to the `api` object.

Check `modern-gif`'s `encode` signature against its own README before writing this — it is the one API here that is not ours. If `frames` wants `{ data: Uint8ClampedArray }` rather than an `ImageData`, pass `imageData.data`, and if the option is `loop` rather than `looped`, use that. Adjust and note what you found in the commit message.

- [ ] **Step 5: Add the button**

In `src/components/Toolbar.vue`, beside `data-export-png`:

```vue
      <button
        v-if="board.state.frames.length > 1"
        data-export-gif
        class="chip"
        title="Save the drill as an animation"
        @click="emit('exportGif')"
      >GIF</button>
```

Add `exportGif: []` to the emits. It is hidden on a single-frame drill because PNG already covers that, and a GIF of one still is a worse PNG.

- [ ] **Step 6: Wire it up in `src/App.vue`**

```ts
const exporting = ref(false)

/**
 * Export the drill as an animation.
 *
 * The playhead is driven by hand and restored in a `finally`, so a failure
 * halfway through leaves the board where the coach left it rather than parked
 * mid-move. `nextTick` between samples is what makes the SVG show the moment
 * being captured; without it every sample would be the same picture.
 */
async function exportGif() {
  const svg = boardRef.value?.svgEl
  if (!svg || exporting.value) return

  const samples = gifSchedule(board.state.frames)
  const wasAt = board.playback.at
  exporting.value = true

  try {
    const blob = await exporter.boardToGifBlob(
      svg,
      samples,
      async (atMs) => {
        board.scrubTo(atMs)
        await nextTick()
      },
      board.state.notesVisible ? board.state.notes : '',
      800,
      (done, total) => {
        notice.value = `Building the animation… ${done} of ${total}`
      },
    )
    exporter.downloadBlob(blob, `${exporter.slugify(currentName.value)}.gif`)
    notice.value = 'Animation saved.'
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The animation could not be created.'
  } finally {
    exporting.value = false
    board.scrubTo(wasAt)
    board.endScrub()
  }
}
```

Bind `@exportGif="exportGif"` on the `Toolbar`. Match the names this file already uses for the storage and export composables and for the current pattern name — read the top of `App.vue` rather than assuming `exporter` and `currentName`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run tests/useExport.spec.ts tests/Toolbar.spec.ts`
Expected: PASS. Then `npm test` and `npm run build`.

- [ ] **Step 8: Verify in a browser**

jsdom cannot rasterise, so this is the only place the export is actually exercised.

```bash
npm run dev -- --port 5180
```

1. Build a four-frame drill with a pass in it.
2. Press **GIF**. The notice should count up.
3. Open the downloaded file. It should loop, the players should ease, the ball should fly, and there should be no bend dots or endpoint rings anywhere in it.
4. Check the board is back where it was, on a frame, accepting drags.
5. Check the file size and report it in the commit message — it is the number that decides whether 800px and 12.5fps were the right calls.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/composables/useExport.ts src/components/Toolbar.vue src/App.vue tests/useExport.spec.ts tests/Toolbar.spec.ts
git commit -m "feat: save a drill as an animation

The exporter samples the live board rather than drawing the frames
itself: it moves the playhead, waits for Vue, and rasterises what is
there. Two things fall out of that. The GIF is exactly what the coach
just watched, and the bend dots and endpoint rings are excluded by the
same data-transient rule that already keeps them out of the still.

GIF rather than video because it plays inline in a chat message and a
document, which is where a session plan goes. A pitch is flat colour, so
the 256-colour palette costs nothing. 800px rather than the still's 1600,
because every sample pays for the width.

The playhead is restored in a finally, so a failure halfway through
leaves the board where the coach left it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`, `docs/roadmap.md`

- [ ] **Step 1: Add a frames section to `README.md`**

After the "Going back to a drawing" section, before "Drill notes":

```markdown
**Frames.** A drill is a sequence, not a picture. **+ Frame** adds a moment,
copied from the one you are on, so the next frame starts as the same players a
few yards from where they were. Move them, move the ball, draw on it — the
frame you came from is untouched.

Once there are two, the strip opens: numbered chips for each moment, controls
to reorder or remove one, a field for how long the move into it takes, and
play, rewind and a scrub slider. `Space` plays and pauses.

Players ease away and settle; the ball travels in a straight line and leaves
the passer's boot as it goes, so a pass looks like a pass. A drawing belongs to
the moment it describes, so the arrow showing a pass is on screen while the
pass happens and gone once you rub it out on the next frame.

Your squad is the same in every moment. Adding, removing or renumbering a
player, cone or label reaches every frame; only positions and drawings differ
between them. Nobody appears halfway through a drill.

**GIF** saves the whole thing as an animation that loops — it plays inline in a
message or a document, which is where a session plan goes. It appears once
there is more than one frame; a single moment is what **PNG** is for.

While a drill is playing, or while you are dragging the scrub slider, the board
is showing a blend of two moments rather than a moment, so it will not take an
edit. Let go of the slider and it lands on the nearest frame.
```

Update the "Not built yet" section, which currently promises this feature:

```markdown
## Not built yet

Timing one movement against another — a run that starts before the pass that
finds it. Every object on a frame currently moves over the same duration.

See [docs/roadmap.md](docs/roadmap.md) for that and the rest of what is worth
building next.
```

Also correct the coordinate-system section if it says anything about frames, and check the "Where patterns live" section — patterns are `version: 2` now, though the storage key is unchanged.

- [ ] **Step 2: Rewrite the roadmap's playback section**

Replace the whole "Frames and playback" section of `docs/roadmap.md` with what landed and what it left:

```markdown
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

Still to do:

- **Timing one movement against another.** A run that starts before the pass
  that finds it. Every object on a frame currently moves over the same
  duration, and staggering them needs its own model and its own UI.
- **Motion paths.** A player travels in a straight line between frames. A
  curved run is expressed by adding a frame at the turn, which is usually
  enough — worth revisiting only if it turns out not to be.
```

Keep the roadmap's other sections as they are, and check the "Editing what you have already drawn" section for anything that now reads as out of date.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/roadmap.md
git commit -m "docs: frames, playback and the animation export

The roadmap section becomes a record of what landed and why, keeping the
five decisions that each closed off a plausible alternative, and what is
left: staggering one movement against another, and motion paths.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Final check**

```bash
npm test && npm run build
```

Both clean. Then open a PR against `main`.

---

## Self-review notes

**Spec coverage.** Every section of the design maps to a task: data model → Tasks 1 and 2; migration → Task 4; authoring rules → Task 3; tweening → Task 1; playback → Tasks 5 and 6; frame strip → Tasks 7 and 8; export → Tasks 9 and 10; testing → distributed; docs → Task 11.

**Two things the spec left implicit, decided here.** Opening a saved pattern always lands on frame 1 rather than wherever it was saved from, because reopening halfway through an animation is not what anyone means by opening a drill. And a duplicated player joins every frame offset from wherever the original stands in that moment, so the copy repeats the run rather than standing still through it.

**One risk the plan carries.** Task 10 writes against `modern-gif`'s `encode`, which is the only API here that is not ours. Its exact option and frame shapes are to be checked against its README at the point of writing, and the step says so.
