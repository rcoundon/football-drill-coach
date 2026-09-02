# Curved Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player's run between two phases bow off the straight line, using the same encoding, maths and gesture that already bend an arrow.

**Architecture:** Two optional fields on `Counter` (`bend`, `bendAlong`) describe the move *into* the frame they sit on, held relative to the chord so they survive rotation, group moves and duplication. `interpolateFrames` samples a quadratic Bézier for counters instead of a straight lerp. On the pitch, a held player gets a dashed movement trail from their previous-frame position with a bend handle at its peak; the drag reuses `bendFor`.

**Tech Stack:** Vue 3.5 `<script setup>`, TypeScript, Vitest 4 + @vue/test-utils, SVG in pitch units.

**Spec:** `docs/superpowers/specs/2026-09-02-curved-runs-design.md`

## Global Constraints

- `Pattern.version` stays at **3**. Both new fields are optional; absent reads as straight. Do not add a version, do not touch `READABLE_VERSIONS`.
- Zero is stored as an **absent field**, never as `0` — mirroring `setArrowBend` in `src/composables/useBoard.ts:1190`. A straightened run must be indistinguishable from one never bent.
- Straightening drops the skew: setting `bend` to 0 deletes `bendAlong` too.
- Cones (`Marker`), text labels (`Label`) and loose balls in flight stay straight. Only `Counter` gains the fields.
- All positions are in **pitch units**, never pixels.
- Editing affordances on the board carry `data-transient` so `useExport` strips them (`src/composables/useExport.ts:108`).
- Board mutators called on every pointer-move do **not** `commit()`; the grab commits. Follow `onBendGrab` in `src/components/PitchBoard.vue:850`.
- Every board mutator begins `if (locked()) return`.
- Run `npx vitest run` and `npx vue-tsc --noEmit` before every commit. Both must be clean.
- Commit messages are normal prose, imperative mood, `feat:` / `fix:` / `docs:` / `test:` prefix. Comments explain *why*, matching the density of the file being edited.

---

### Task 1: The curve sampler

**Files:**
- Modify: `src/animation.ts`
- Test: `tests/animation.spec.ts`

**Interfaces:**
- Consumes: `curveControlPoint(from, to, bend, bendAlong)` and `curveHandle(from, to, bend, bendAlong)` from `src/geometry.ts` (both already exported).
- Produces: `export function pointOnCurve(from: Vec, to: Vec, bend: number, bendAlong: number, t: number): Vec` from `src/animation.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/animation.spec.ts`. Add `pointOnCurve` to the existing import list from `../src/animation`, and add `curveHandle` to the existing import from `../src/geometry`.

```ts
describe('pointOnCurve', () => {
  const from = { x: 10, y: 10 }
  const to = { x: 30, y: 10 }

  it('is the plain lerp when there is no bend', () => {
    expect(pointOnCurve(from, to, 0, 0, 0.25)).toEqual({ x: 15, y: 10 })
    expect(pointOnCurve(from, to, 0, 0.2, 0.5)).toEqual({ x: 20, y: 10 })
  })

  it('returns the endpoints exactly', () => {
    expect(pointOnCurve(from, to, 6, 0.1, 0)).toEqual(from)
    expect(pointOnCurve(from, to, 6, 0.1, 1)).toEqual(to)
  })

  it('passes through the handle at the halfway point', () => {
    const handle = curveHandle(from, to, 6, 0.1)
    const mid = pointOnCurve(from, to, 6, 0.1, 0.5)
    expect(mid.x).toBeCloseTo(handle.x, 10)
    expect(mid.y).toBeCloseTo(handle.y, 10)
  })

  it('leaves the straight line when bent', () => {
    expect(pointOnCurve(from, to, 6, 0, 0.5).y).not.toBe(10)
  })

  it('holds still when the ends coincide', () => {
    expect(pointOnCurve(from, from, 6, 0.1, 0.5)).toEqual(from)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/animation.spec.ts`
Expected: FAIL — `pointOnCurve is not a function` / no exported member.

- [ ] **Step 3: Implement**

In `src/animation.ts`, extend the existing geometry import to `import { BALL_OFFSET, curveControlPoint } from './geometry'`, then add beside `lerpVec`:

```ts
/**
 * Where a curved move has reached at `t`.
 *
 * The quadratic whose control point `curveControlPoint` gives, so the path a
 * player travels is the same curve the trail draws — one set of maths, and a
 * bend that means the same thing on a run as it does on an arrow.
 *
 * A straight move takes the plain lerp rather than a Bezier with a control
 * point on the chord: the same answer, without the floating-point noise that
 * would make a straight run wander by a millionth of a unit.
 */
export function pointOnCurve(
  from: Vec,
  to: Vec,
  bend: number,
  bendAlong: number,
  t: number,
): Vec {
  if (bend === 0) return lerpVec(from, to, t)
  const control = curveControlPoint(from, to, bend, bendAlong)
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  }
}
```

`curveControlPoint` returns the chord midpoint when the two ends coincide, so the coinciding-ends case falls out without a branch of its own.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/animation.spec.ts && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/animation.ts tests/animation.spec.ts
git commit -m "feat: sample the curve a bend describes"
```

---

### Task 2: The fields, and reading them back

**Files:**
- Modify: `src/types.ts:13-18` (the `Counter` type)
- Modify: `src/composables/useStorage.ts:43-51` (`isValidCounter`)
- Test: `tests/useStorage.spec.ts`

**Interfaces:**
- Produces: `Counter.bend?: number` and `Counter.bendAlong?: number`, consumed by every later task.

- [ ] **Step 1: Write the failing tests**

Add to `tests/useStorage.spec.ts`. Follow the file's existing helpers for building a pattern object and calling `parsePattern`; if it builds patterns through a local helper, use that helper and add the fields to the counter it produces.

```ts
describe('a curved run', () => {
  it('reads a counter carrying a bend', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 }, bend: 4, bendAlong: 0.1 })
    const parsed = parsePattern(raw)
    expect(parsed.frames[0].counters[0].bend).toBe(4)
    expect(parsed.frames[0].counters[0].bendAlong).toBe(0.1)
  })

  it('reads a counter saved before curves existed', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 } })
    const parsed = parsePattern(raw)
    expect(parsed.frames[0].counters[0].bend).toBeUndefined()
  })

  it('rejects a bend that is not a number', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 }, bend: 'lots' })
    expect(() => parsePattern(raw)).toThrow()
  })

  it('rejects a bend that is not finite', () => {
    const raw = patternWithCounter({ id: 'c1', color: 'red', label: '9', pos: { x: 10, y: 10 }, bend: Number.POSITIVE_INFINITY })
    expect(() => parsePattern(raw)).toThrow()
  })
})
```

Write `patternWithCounter(counter: unknown)` as a local helper in the test file if the file has no equivalent: a version-3 pattern object with `id`, `name`, `pitch: { type: 'full', rotated: false }`, `createdAt`, `updatedAt`, and one frame whose `counters` is `[counter]` and whose `markers`, `labels`, `balls`, `drawings` are empty arrays.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/useStorage.spec.ts`
Expected: the two rejection tests FAIL — a string `bend` is accepted today.

- [ ] **Step 3: Add the fields**

In `src/types.ts`, extend `Counter`:

```ts
export type Counter = {
  id: string
  color: CounterColor
  label: string
  pos: Vec
  /**
   * How far this player's run bows off the straight line into this frame, in
   * pitch units, signed by which side it bows towards. Absent or zero is a
   * straight run.
   *
   * The chord is where this player stood on the PREVIOUS frame to `pos` on
   * this one, so the value describes the move into the frame it sits on. The
   * first frame's is ignored: nothing moves into the start of a drill, the
   * same rule `Frame.duration` follows.
   *
   * Held as a chord-relative offset rather than a control point, exactly as
   * `ArrowDrawing.bend` is, so a curve keeps its shape through a board
   * rotation, a group move and a duplicate — and so a pattern saved before
   * curves existed loads as the straight one it was.
   */
  bend?: number
  /**
   * Where along the run the bow peaks, as a signed fraction of the chord
   * either side of its midpoint. Absent or zero is an even arc; positive
   * leans towards the arrival.
   */
  bendAlong?: number
}
```

- [ ] **Step 4: Validate them**

In `src/composables/useStorage.ts`, extend `isValidCounter`:

```ts
function isValidCounter(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.color === 'string' &&
    typeof value.label === 'string' &&
    isVec(value.pos) &&
    // Curved runs arrived after version 3, so a counter with neither field is
    // a straight run saved before them. A value that is present must still be
    // a real number: anything else reaches the tween as a NaN position.
    isOptionalNumber(value.bend) &&
    isOptionalNumber(value.bendAlong)
  )
}
```

`isOptionalNumber` is declared later in the same module; function declarations hoist, so no reordering is needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: PASS, no type errors. The whole suite runs here because `Counter` is shared widely.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/composables/useStorage.ts tests/useStorage.spec.ts
git commit -m "feat: give a player's run a bend to carry"
```

---

### Task 3: Playing the curve back

**Files:**
- Modify: `src/animation.ts` (`interpolateFrames`, around line 164)
- Test: `tests/animation.spec.ts`

**Interfaces:**
- Consumes: `pointOnCurve` (Task 1), `Counter.bend`/`bendAlong` (Task 2).
- Produces: no new exports. `interpolateFrames(a, b, t)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

Add to `tests/animation.spec.ts`. The file's local `counter(id, x, y)` helper returns a straight counter; build bent ones inline by spreading it.

```ts
describe('a curved run in playback', () => {
  it('leaves the straight line between the two phases', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [] })
    const b = frame({ counters: [{ ...counter('c1', 30, 10), bend: 6 }], balls: [] })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.counters[0].pos.y).not.toBeCloseTo(10, 6)
  })

  it('reads the bend off the phase being moved into, not the one being left', () => {
    const a = frame({ counters: [{ ...counter('c1', 10, 10), bend: 6 }], balls: [] })
    const b = frame({ counters: [counter('c1', 30, 10)], balls: [] })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.counters[0].pos.y).toBeCloseTo(10, 10)
  })

  it('still arrives exactly where the phase says', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [] })
    const b = frame({ counters: [{ ...counter('c1', 30, 10), bend: 6 }], balls: [] })
    expect(interpolateFrames(a, b, 1).counters[0].pos).toEqual({ x: 30, y: 10 })
  })

  it('does not bend a cone', () => {
    const a = frame({ counters: [], markers: [marker('m1', 10, 10)], balls: [] })
    const b = frame({
      counters: [],
      markers: [{ ...marker('m1', 30, 10), bend: 6 } as never],
      balls: [],
    })
    expect(interpolateFrames(a, b, 0.5).markers[0].pos.y).toBeCloseTo(10, 10)
  })

  it('carries a held ball around the curve with its carrier', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [ball(10, 10, 'c1')] })
    const b = frame({
      counters: [{ ...counter('c1', 30, 10), bend: 6 }],
      balls: [ball(30, 10, 'c1')],
    })
    const view = interpolateFrames(a, b, 0.5)
    expect(view.balls[0].pos.x).toBeCloseTo(view.counters[0].pos.x + BALL_OFFSET.x, 10)
    expect(view.balls[0].pos.y).toBeCloseTo(view.counters[0].pos.y + BALL_OFFSET.y, 10)
  })

  it('does not bend a ball in flight', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [ball(10, 10, null)] })
    const b = frame({
      counters: [{ ...counter('c1', 30, 10), bend: 6 }],
      balls: [ball(30, 10, null)],
    })
    expect(interpolateFrames(a, b, 0.5).balls[0].pos.y).toBeCloseTo(10, 10)
  })

  it('holds a player with no counterpart in the next phase', () => {
    const a = frame({ counters: [counter('c1', 10, 10)], balls: [] })
    const b = frame({ counters: [], balls: [] })
    expect(interpolateFrames(a, b, 0.5).counters[0].pos).toEqual({ x: 10, y: 10 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/animation.spec.ts`
Expected: the first test FAILS — the player still travels in a straight line.

- [ ] **Step 3: Implement**

In `src/animation.ts`, leave `tweenAll` untouched — it is shared with cones and labels, which do not curve. Replace the counters line inside `interpolateFrames`:

```ts
const counters = tweenCounters(a.counters, b.counters, e)
```

and add beside `tweenAll`:

```ts
/**
 * Move each player towards where the next phase puts them, along the curve
 * that phase asks for.
 *
 * The bend is read off the TARGET, because it describes the move into that
 * frame — the same leg its `duration` times. A player with no counterpart in
 * the target holds position, the insurance `tweenAll` gives everything else.
 *
 * Separate from `tweenAll` rather than a widening of it: cones and labels
 * share that function and do not run, so there is no curve for them to take.
 */
function tweenCounters(from: Counter[], to: Counter[], e: number): Counter[] {
  return from.map((item) => {
    const target = to.find((other) => other.id === item.id)
    if (!target) return { ...item }
    return {
      ...item,
      pos: pointOnCurve(item.pos, target.pos, target.bend ?? 0, target.bendAlong ?? 0, e),
    }
  })
}
```

The returned counters keep the *source* frame's `bend`, which nothing reads during playback — the board draws positions, and the trail is only ever drawn for a landed frame.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: PASS. The whole suite runs because playback feeds the GIF export and the phase-card thumbnails.

- [ ] **Step 5: Commit**

```bash
git add src/animation.ts tests/animation.spec.ts
git commit -m "feat: play a bent run back along its curve"
```

---

### Task 4: The board action

**Files:**
- Modify: `src/composables/useBoard.ts` (add beside `setArrowBend` at line 1190; export it in the returned object near `setCounterColor` at line 1574)
- Test: `tests/useBoard.counters.spec.ts`

**Interfaces:**
- Produces: `setCounterBend(id: string, bend: number, bendAlong?: number): void` on the object `useBoard()` returns.

- [ ] **Step 1: Write the failing tests**

Add to `tests/useBoard.counters.spec.ts`. That file already calls `__resetBoardForTests()` in `beforeEach` and takes the board from `useBoard()`. Note `addCounter` takes a colour alone and returns the counter — it does not take a position.

```ts
describe('bending a run', () => {
  /** A player on a second phase, which is the only place a run exists. */
  function playerWithARun() {
    const board = useBoard()
    const c = board.addCounter('red')
    board.addFrame()
    board.moveCounter(c.id, { x: 30, y: 10 })
    return { board, id: c.id }
  }

  it('stores the bend on the phase it is set on', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    expect(board.counterById(id)!.bend).toBe(4)
    expect(board.counterById(id)!.bendAlong).toBe(0.1)
  })

  it('leaves the other phases straight', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    board.goToFrame(0)
    expect(board.counterById(id)!.bend).toBeUndefined()
  })

  it('stores a straightened run as no fields at all', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    board.setCounterBend(id, 0, 0)
    expect('bend' in board.counterById(id)!).toBe(false)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })

  it('drops the skew when the bow goes', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    board.setCounterBend(id, 0)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })

  it('stores an even arc as no skew field', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0)
    expect(board.counterById(id)!.bend).toBe(4)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })

  it('does nothing while the drill is playing', () => {
    const { board, id } = playerWithARun()
    board.play()
    board.setCounterBend(id, 4, 0.1)
    board.pause()
    expect(board.counterById(id)!.bend).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/useBoard.counters.spec.ts`
Expected: FAIL — `setCounterBend is not a function`.

- [ ] **Step 3: Implement**

Add beside `setArrowBend` in `src/composables/useBoard.ts`:

```ts
/**
 * Bow a player's run into this phase, and set where along it the bow peaks.
 * Called on every pointer-move of a handle drag, so it deliberately does not
 * commit — the grab does that.
 *
 * On this phase alone, unlike a player's colour or label: where somebody
 * stands, and how they got there, is what differs from phase to phase.
 *
 * Zeroes are stored as absent fields, exactly as `setArrowBend` stores them,
 * so a straightened run is indistinguishable from one that was never bent.
 */
function setCounterBend(id: string, bend: number, bendAlong = 0): void {
  if (locked()) return
  const counter = counterById(id)
  if (!counter) return
  if (bend === 0) {
    delete counter.bend
    delete counter.bendAlong
    return
  }
  counter.bend = bend
  if (bendAlong === 0) delete counter.bendAlong
  else counter.bendAlong = bendAlong
}
```

Add `setCounterBend,` to the returned object beside `setCounterColor`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/useBoard.counters.spec.ts && npx vue-tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useBoard.ts tests/useBoard.counters.spec.ts
git commit -m "feat: let the board bend a player's run"
```

---

### Task 5: Widen the bend handle

**Files:**
- Modify: `src/components/BendHandle.vue`
- Modify: `src/components/PitchBoard.vue:1100-1105` (the `BendHandle` render)
- Test: `tests/PitchBoard.spec.ts` (existing arrow-bend tests must keep passing)

**Interfaces:**
- Produces: `BendHandle` props become `{ from: Vec; to: Vec; bend?: number; bendAlong?: number; color: string }`, emitting `grab: [event: PointerEvent]` as before. Task 7 mounts it for a player.

This is a refactor with no behaviour change. Its gate is that the existing suite stays green.

- [ ] **Step 1: Rewrite the component's script**

```ts
<script setup lang="ts">
import { computed } from 'vue'
import type { Vec } from '../types'
import { curveHandle } from '../geometry'

const props = withDefaults(
  defineProps<{
    /** The chord this handle bends: from where the movement starts, to where it ends. */
    from: Vec
    to: Vec
    bend?: number
    bendAlong?: number
    /** The dot takes the colour of whatever it is bending. */
    color: string
  }>(),
  { bend: 0, bendAlong: 0 },
)
defineEmits<{ grab: [event: PointerEvent] }>()
```

Keep `RADIUS`, `BEND_HIT_RADIUS` and their comments exactly as they are. The `at` computed becomes:

```ts
const at = computed(() => curveHandle(props.from, props.to, props.bend, props.bendAlong))
```

In the template, `:fill="arrow.color"` becomes `:fill="color"`. Nothing else in the template changes — `data-bend-handle`, `data-bend`, `data-transient` and the enlarged hit circle all stay, because `tests/PitchBoard.spec.ts` routes synthetic presses through the last child of `[data-bend-handle]`.

Update the component's leading comment so it no longer says "arrow": it bends a chord, and a run is now one of them.

- [ ] **Step 2: Update the call site**

In `src/components/PitchBoard.vue`:

```html
<BendHandle
  v-for="arrow in bendHandles"
  :key="`bend-${arrow.id}`"
  :from="arrow.from"
  :to="arrow.to"
  :bend="arrow.bend"
  :bend-along="arrow.bendAlong"
  :color="arrow.color"
  @grab="onBendGrab(arrow.id, $event)"
/>
```

- [ ] **Step 3: Run the suite to verify nothing changed**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: PASS, with no test edits. If a test fails, the refactor changed behaviour — fix the component, not the test.

- [ ] **Step 4: Commit**

```bash
git add src/components/BendHandle.vue src/components/PitchBoard.vue
git commit -m "refactor: let the bend handle bend any chord"
```

---

### Task 6: The movement trail

**Files:**
- Create: `src/components/MovementTrail.vue`
- Create: `tests/MovementTrail.spec.ts`

**Interfaces:**
- Consumes: `curveControlPoint` from `src/geometry.ts`.
- Produces: `MovementTrail` with props `{ from: Vec; to: Vec; bend?: number; bendAlong?: number; color: string }`, no emits. Task 7 mounts it.

- [ ] **Step 1: Write the failing test**

`tests/MovementTrail.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MovementTrail from '../src/components/MovementTrail.vue'
import { curveControlPoint } from '../src/geometry'

const base = { from: { x: 10, y: 10 }, to: { x: 30, y: 10 }, color: '#c33' }

describe('MovementTrail', () => {
  it('draws a straight path when there is no bend', () => {
    const trail = mount(MovementTrail, { props: base })
    expect(trail.find('[data-movement-trail]').attributes('d')).toBe('M 10 10 L 30 10')
  })

  it('draws the quadratic the bend describes', () => {
    const trail = mount(MovementTrail, { props: { ...base, bend: 6, bendAlong: 0.1 } })
    const control = curveControlPoint(base.from, base.to, 6, 0.1)
    expect(trail.find('[data-movement-trail]').attributes('d')).toBe(
      `M 10 10 Q ${control.x} ${control.y} 30 10`,
    )
  })

  it('takes the colour of the player it belongs to', () => {
    const trail = mount(MovementTrail, { props: base })
    expect(trail.find('[data-movement-trail]').attributes('stroke')).toBe('#c33')
  })

  it('is stripped from an export', () => {
    const trail = mount(MovementTrail, { props: base })
    expect(trail.find('[data-transient]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/MovementTrail.spec.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

`src/components/MovementTrail.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Vec } from '../types'
import { curveControlPoint } from '../geometry'

const props = withDefaults(
  defineProps<{
    /** Where the movement starts — the previous phase — and where it ends. */
    from: Vec
    to: Vec
    bend?: number
    bendAlong?: number
    color: string
  }>(),
  { bend: 0, bendAlong: 0 },
)

/**
 * The path the player will actually travel, so what the coach bends is what
 * playback runs. A straight move is drawn as a line rather than as a
 * quadratic with its control point on the chord: the same shape, and one
 * fewer number for a reader of the exported markup to check.
 */
const path = computed(() => {
  const { from, to, bend, bendAlong } = props
  if (bend === 0) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  const control = curveControlPoint(from, to, bend, bendAlong)
  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`
})
</script>

<template>
  <!--
    Transient: it says where this player came from, which is a thing the
    coach is editing rather than a thing the drill contains. The export
    strips it, as it strips the handles.

    Dashed and faint so it reads as a ghost of a move rather than as an
    arrow somebody drew.
  -->
  <path
    data-movement-trail
    data-transient
    :d="path"
    fill="none"
    :stroke="color"
    stroke-opacity="0.45"
    stroke-width="0.4"
    stroke-dasharray="1.4 1.2"
    stroke-linecap="round"
    pointer-events="none"
  />
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/MovementTrail.spec.ts && npx vue-tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MovementTrail.vue tests/MovementTrail.spec.ts
git commit -m "feat: draw the trail a player left getting here"
```

---

### Task 7: Wire the trail to the board

**Files:**
- Modify: `src/components/PitchBoard.vue` — the drag union at line 113-133, the `bendTo` helper at line 877, `onBendGrab` at line 850, the pointer-move branch at line 949, the pointer-up branch at line 1022, and the `over-tokens` slot at line 1100
- Test: `tests/PitchBoard.spec.ts`

**Interfaces:**
- Consumes: `setCounterBend` (Task 4), `MovementTrail` (Task 6), the widened `BendHandle` (Task 5), `bendFor` and `clampToPitch` from `src/geometry.ts` (already imported in this file).
- Produces: no exports. Behaviour only.

- [ ] **Step 1: Write the failing tests**

Add to `tests/PitchBoard.spec.ts`, at the end of the file. It reuses that file's existing `mountBoard`, `clientFor` and `firePointer` helpers — `firePointer` already routes presses on `[data-bend-handle]` to the last child, so a player's handle needs nothing new.

A single player is picked up by dragging a box round them, the way the group tests already do it; a plain press on a player starts a drag rather than a selection.

```ts
describe('curving a run', () => {
  async function dragBox(
    wrapper: ReturnType<typeof mountBoard>,
    from: Vec,
    to: Vec,
  ) {
    const svg = wrapper.find('svg')
    await firePointer(svg, 'pointerdown', clientFor(from.x, from.y))
    await firePointer(svg, 'pointermove', clientFor(to.x, to.y))
    await firePointer(svg, 'pointerup', clientFor(to.x, to.y))
  }

  /**
   * A player who ran from (20, 30) to (60, 30) into the second phase — a
   * flat chord, so its midpoint is (40, 30) and a handle dragged to (40, 38)
   * asks for a bend of 8.
   */
  function playerWithARun() {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 20, y: 30 })
    board.addFrame()
    board.moveCounter(c.id, { x: 60, y: 30 })
    return { board, id: c.id }
  }

  it('shows no trail on the first phase', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 20, y: 30 })
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 10, y: 20 }, { x: 30, y: 40 })
    expect(wrapper.find('[data-movement-trail]').exists()).toBe(false)
  })

  it('shows the trail once the player has run into this phase', async () => {
    playerWithARun()
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 70, y: 40 })
    expect(wrapper.find('[data-movement-trail]').exists()).toBe(true)
  })

  it('shows no trail for a player who stayed where they were', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 20, y: 30 })
    board.addFrame()
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 10, y: 20 }, { x: 30, y: 40 })
    expect(wrapper.find('[data-movement-trail]').exists()).toBe(false)
  })

  it('shows no trail while several players are held', async () => {
    const board = useBoard()
    const one = board.addCounter('red')
    const two = board.addCounter('blue')
    board.moveCounter(one.id, { x: 20, y: 30 })
    board.moveCounter(two.id, { x: 30, y: 30 })
    board.addFrame()
    board.moveCounter(one.id, { x: 60, y: 30 })
    board.moveCounter(two.id, { x: 70, y: 30 })
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 80, y: 40 })
    expect(wrapper.findAll('[data-selected-token]')).toHaveLength(2)
    expect(wrapper.find('[data-movement-trail]').exists()).toBe(false)
  })

  it('hides the trail under a drawing tool, so it cannot be drawn over', async () => {
    playerWithARun()
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 70, y: 40 })
    await wrapper.setProps({ tool: 'arrow-run' })
    expect(wrapper.find('[data-movement-trail]').exists()).toBe(false)
  })

  it('bows the run to wherever the handle is dragged', async () => {
    const { board, id } = playerWithARun()
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 70, y: 40 })

    const handle = wrapper.find('[data-bend-handle]')
    await firePointer(handle, 'pointerdown', clientFor(40, 30))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(40, 38))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(40, 38))

    expect(board.counterById(id)!.bend).toBeCloseTo(8, 6)
  })

  it('straightens the run when the handle is dragged back onto the line', async () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 8)
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 70, y: 40 })

    const handle = wrapper.find('[data-bend-handle]')
    await firePointer(handle, 'pointerdown', clientFor(40, 38))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(40, 30))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(40, 30))

    expect(board.counterById(id)!.bend).toBeUndefined()
  })

  it('undoes a whole bend drag in one step', async () => {
    const { board, id } = playerWithARun()
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 70, y: 40 })

    const handle = wrapper.find('[data-bend-handle]')
    await firePointer(handle, 'pointerdown', clientFor(40, 30))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(40, 34))
    await firePointer(wrapper.find('svg'), 'pointermove', clientFor(40, 38))
    await firePointer(wrapper.find('svg'), 'pointerup', clientFor(40, 38))
    board.undo()

    expect(board.counterById(id)!.bend).toBeUndefined()
  })

  it('draws the trail the player will actually travel', async () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 8)
    const wrapper = mountBoard('select')
    await wrapper.vm.$nextTick()
    await dragBox(wrapper, { x: 50, y: 20 }, { x: 70, y: 40 })
    expect(wrapper.find('[data-movement-trail]').attributes('d')).toBe('M 20 30 Q 40 46 60 30')
  })
})
```

The last test's expected path is the same arithmetic the existing arrow test at `tests/PitchBoard.spec.ts:1245` relies on — it asserts `M 20 30 Q 40 40 60 30` for a bend of 5 on that same chord. The control point sits at twice the handle's offset, so a bend of 8 puts it at (40, 46).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/PitchBoard.spec.ts`
Expected: FAIL — no `[data-movement-trail]` is ever rendered.

- [ ] **Step 3: Add the trail computed**

In `src/components/PitchBoard.vue`, beside `bendHandles`:

```ts
/**
 * The run into this phase, when there is one worth bending.
 *
 * Only ever the one player being held: an onion skin of the whole previous
 * phase would fill the pitch with grey duplicates for the sake of one
 * editable value, and a group has no single run to offer.
 *
 * Nothing on the first phase, because nothing moves into the start of a
 * drill, and nothing for a player who ended the phase where they began it —
 * there is no chord to bow off.
 */
const movementTrail = computed(() => {
  if (props.tool !== 'select') return null
  const [only] = selection.value
  if (selection.value.length !== 1 || only.kind !== 'counter') return null

  const index = board.state.currentFrame
  if (index < 1) return null
  const was = board.state.frames[index - 1]?.counters.find((c) => c.id === only.id)
  const now = board.counterById(only.id)
  if (!was || !now) return null
  if (was.pos.x === now.pos.x && was.pos.y === now.pos.y) return null

  return {
    id: now.id,
    from: was.pos,
    to: now.pos,
    bend: now.bend ?? 0,
    bendAlong: now.bendAlong ?? 0,
    color: SWATCHES[now.color],
  }
})
```

Import `SWATCHES` from `./controls` if this file does not import it already; if the file resolves counter colours another way, use that way instead — the colour on screen must match the player's disc.

- [ ] **Step 4: Render it**

In the `over-tokens` slot, before the `BendHandle` loop:

```html
<template v-if="movementTrail">
  <MovementTrail
    :from="movementTrail.from"
    :to="movementTrail.to"
    :bend="movementTrail.bend"
    :bend-along="movementTrail.bendAlong"
    :color="movementTrail.color"
  />
  <BendHandle
    :from="movementTrail.from"
    :to="movementTrail.to"
    :bend="movementTrail.bend"
    :bend-along="movementTrail.bendAlong"
    :color="movementTrail.color"
    @grab="onCounterBendGrab(movementTrail.id, $event)"
  />
</template>
```

Import `MovementTrail` beside the existing `BendHandle` import at line 38.

- [ ] **Step 5: Wire the drag**

Add to the `DragTarget` union beside `{ kind: 'bend'; id: string }`:

```ts
  | { kind: 'counter-bend'; id: string }
```

Add the grab, modelled exactly on `onBendGrab`:

```ts
function onCounterBendGrab(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  if (dragIsLive()) return
  event.stopPropagation()
  capture(event)
  // The whole drag is one change, so the grab commits and the moves do not.
  board.commit()
  drag.value = {
    kind: 'counter-bend',
    id,
    pointerId: event.pointerId,
    origin: toPitch(event),
    // The bend is read off the chord, not carried from the grab point, so an
    // offset would only fight the projection.
    grabOffset: { x: 0, y: 0 },
    moved: false,
    startedAt: Date.now(),
  }
}
```

And the move, modelled on `bendTo`:

```ts
/**
 * Bow the run this drag holds to wherever its handle now sits.
 *
 * Clamped to the pitch like the arrow's handle, and for the same reason: a
 * drag off the edge would otherwise keep deepening the bow until the run
 * curved out over the touchline.
 */
function bendRunTo(id: string, at: Vec): void {
  const trail = movementTrail.value
  if (!trail || trail.id !== id) return
  const { bend, along } = bendFor(trail.from, trail.to, clampToPitch(at, board.state.pitch.type))
  board.setCounterBend(id, bend, along)
}
```

In the pointer-move dispatch beside `else if (active.kind === 'bend') bendTo(active.id, at)`, add:

```ts
  else if (active.kind === 'counter-bend') bendRunTo(active.id, at)
```

Read the pointer-up branch at line 1022 that handles `'bend'` and give `'counter-bend'` whatever that branch does — the two drags end the same way.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/PitchBoard.vue tests/PitchBoard.spec.ts
git commit -m "feat: bend a run by dragging its trail"
```

---

### Task 8: The Inspector row, and the words for it

**Files:**
- Modify: `src/components/Inspector.vue` (the `v-if="counter"` block in the template, around line 175)
- Modify: `src/components/HelpPanel.vue` (the `data-help-section="drill"` section, around line 140)
- Modify: `docs/roadmap.md:28-30`
- Test: `tests/Inspector.spec.ts`

**Interfaces:**
- Consumes: `setCounterBend` (Task 4), `Counter.bend`/`bendAlong` (Task 2).
- Produces: nothing later tasks depend on. This is the last task.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Inspector.spec.ts`, which already has `mountInspector(selection, open)` and a module-level `board`.

```ts
describe('the curve of a held player', () => {
  /** A player who ran left to right into the second phase. */
  function playerWithARun() {
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 20, y: 30 })
    board.addFrame()
    board.moveCounter(c.id, { x: 60, y: 30 })
    return c.id
  }

  it('says nothing about a run on the first phase', () => {
    const c = board.addCounter('red')
    const wrapper = mountInspector([{ kind: 'counter', id: c.id }])
    expect(wrapper.find('[data-run-curve]').exists()).toBe(false)
  })

  it('says nothing about a player who stayed where they were', () => {
    const c = board.addCounter('red')
    board.addFrame()
    const wrapper = mountInspector([{ kind: 'counter', id: c.id }])
    expect(wrapper.find('[data-run-curve]').exists()).toBe(false)
  })

  it('reads Straight for a run that was never bent', () => {
    const id = playerWithARun()
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-run-curve]').text()).toContain('Straight')
  })

  /**
   * Right of the direction of travel, not right of the screen: the bend is
   * held against the chord, so the words have to be too.
   */
  it('names the side the run bows towards, and how deep', () => {
    const id = playerWithARun()
    board.setCounterBend(id, 4)
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-run-curve]').text()).toContain('Bows right 4m')
  })

  it('names the other side when the bow goes the other way', () => {
    const id = playerWithARun()
    board.setCounterBend(id, -4)
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-run-curve]').text()).toContain('Bows left 4m')
  })

  it('offers no straighten button on a run that is already straight', () => {
    const id = playerWithARun()
    const wrapper = mountInspector([{ kind: 'counter', id }])
    expect(wrapper.find('[data-straighten-run]').exists()).toBe(false)
  })

  it('straightens the run', async () => {
    const id = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    const wrapper = mountInspector([{ kind: 'counter', id }])
    await wrapper.find('[data-straighten-run]').trigger('click')
    expect('bend' in board.counterById(id)!).toBe(false)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Inspector.spec.ts`
Expected: FAIL — no `[data-run-curve]`.

- [ ] **Step 3: Implement the row**

In `src/components/Inspector.vue`'s script:

```ts
/**
 * The run into this phase, when the held player has one.
 *
 * The same conditions the board draws a trail under, because the panel is
 * describing the thing the board is showing: a later phase, a player who
 * was there before, and who has actually moved.
 */
const runCurve = computed(() => {
  const held = counter.value
  if (!held) return null
  const index = board.state.currentFrame
  if (index < 1) return null
  const was = board.state.frames[index - 1]?.counters.find((c) => c.id === held.id)
  if (!was) return null
  if (was.pos.x === held.pos.x && was.pos.y === held.pos.y) return null
  return { id: held.id, bend: held.bend ?? 0 }
})

/**
 * The curve in the coach's words.
 *
 * Left and right are read from the direction of travel rather than from the
 * screen, so the words still hold when the board is rotated — which is the
 * same reason the bend itself is held against the chord.
 */
const curveLabel = computed(() => {
  const curve = runCurve.value
  if (!curve || curve.bend === 0) return 'Straight'
  const side = curve.bend > 0 ? 'right' : 'left'
  return `Bows ${side} ${Math.round(Math.abs(curve.bend))}m`
})

function straightenRun(): void {
  const curve = runCurve.value
  if (curve) board.setCounterBend(curve.id, 0)
}
```

The sign is settled, not a guess: `chordNormal` rotates the direction of travel a quarter turn to `(-dy, dx)`, so on a chord running left to right a positive `bend` moves the curve towards **+y**, which is down the screen and therefore the runner's right. The existing arrow test at `tests/PitchBoard.spec.ts:1245` pins the same arithmetic. Positive is right.

In the template, inside the `<template v-else>` branch, after the Colour field:

```html
<div v-if="runCurve" data-run-curve class="field">
  <span class="field-label">Run into this phase</span>
  <div class="curve-row">
    <span class="curve-reading">{{ curveLabel }}</span>
    <button
      v-if="runCurve.bend !== 0"
      data-straighten-run
      class="chip"
      :disabled="board.isDerived.value"
      title="Take the bow out of this run"
      @click="straightenRun"
    >Straighten</button>
  </div>
</div>
```

Style `.curve-row` and `.curve-reading` in the scoped block to match the file's existing `.actions` and `.field-label` conventions — a row with the reading on the left and the chip on the right.

- [ ] **Step 4: Say so in the help**

Add a paragraph to the `data-help-section="drill"` section of `src/components/HelpPanel.vue`, after the paragraph about durations:

```html
<p>
  A player travels in a straight line from where they stood on the phase
  before. To bend the run, pick them up under Move on any phase after the
  first: a dashed trail shows the path they took to get here, with a dot at
  its middle. Drag the dot off the trail to bow the run, or along it to slide
  where the bow peaks — an arc round the back of a defender, or a run that
  curves away and straightens. Drag the dot back onto the straight line, or
  press Straighten in the panel, to lose the curve again. A ball at the
  player's feet follows them round.
</p>
```

- [ ] **Step 5: Update the roadmap**

`docs/roadmap.md` says landed work is deleted from it. Replace the **Motion paths** bullet with what is genuinely left:

```markdown
- **Curved passes.** A player's run bends; a ball played into space still
  travels straight. The curve sampler and the handle are already shared, so
  this is a field on `Ball`, a branch in the flight path, and a handle on the
  token — worth doing when a coach asks for a whipped cross.
```

Leave the rest of the file alone.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Inspector.vue src/components/HelpPanel.vue docs/roadmap.md tests/Inspector.spec.ts
git commit -m "feat: say what a run's curve is, and offer to undo it"
```

---

## Notes for the reviewer

- The **sign** of `bend` is the one thing a test cannot catch on its own, because a test that gets it wrong agrees with code that gets it wrong. It is settled here: `chordNormal` gives `(-dy, dx)`, so positive is the runner's right, and `tests/PitchBoard.spec.ts:1245` already pins the arithmetic. Check the Inspector's two words against that rather than against the rendered screen.
- Task 5 is a pure refactor. If it needed a test change, it was not one.
- Nothing in this plan touches `tweenAll`, `Marker`, `Label`, `Ball`, `useExport`, `renderFrame` or `sessionPdf`. A diff reaching any of those wants explaining.
