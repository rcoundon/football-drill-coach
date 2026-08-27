# BoardView Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the drawing of the board out of `PitchBoard.vue` into a presentational `BoardView.vue` that renders any frame handed to it, so a drill that is not open can be rendered off-screen.

**Architecture:** `BoardView` owns the `<svg>`, the rotation transform and every piece on the pitch, driven entirely by props. It imports no board state. `PitchBoard` keeps the pointer handling, drag state and selection model, and fills two named slots with its own furniture. Behaviour does not change; `PitchBoard`'s 160 existing tests are the proof.

**Tech Stack:** Vue 3.5.41 (`<script setup>`, TypeScript), Vitest 4.1.11, @vue/test-utils 2.4.11.

**Spec:** `docs/superpowers/specs/2026-08-26-session-plans-and-tags-design.md` — section "Rendering drills that are not open", and "Sequencing", which is why this lands alone.

## Global Constraints

- Dependencies are pinned to exact versions in `package.json`. Never `^` or `~`. This plan adds no dependency.
- Run the suite with `npm test`. A single file: `npx vitest run tests/BoardView.spec.ts`.
- `npm run build` runs `vue-tsc --noEmit` first; a type error fails the build.
- Comments explain *why*, not *what*, matching the surrounding code.
- **This plan must not change behaviour.** If a `PitchBoard` test needs editing to pass, stop — that is a regression, not a stale test.

---

### Task 1: `BoardView` renders a frame

**Files:**
- Create: `src/components/BoardView.vue`
- Test: `tests/BoardView.spec.ts`

**Interfaces:**
- Consumes: `FrameView` and `ballPositionIn` from `src/animation.ts`; `PITCH_W`, `PITCH_H`, `viewBoxOf` from `src/geometry.ts`; the existing `PitchMarkings`, `DrawingLayer`, `ConeMarker`, `PlayerCounter`, `PitchLabel`, `BallToken` components.
- Produces:
  - props: `{ frame: FrameView; pitch: { type: PitchType; rotated: boolean }; labelsVisible: boolean; ballsVisible: boolean; selectedDrawingIds?: string[] }`
  - emits: `grabCounter: [id: string, event: PointerEvent]`, `grabMarker: [id: string, event: PointerEvent]`, `grabLabel: [id: string, event: PointerEvent]`, `grabBall: [id: string, event: PointerEvent]`, `hitDrawing: [id: string, event: PointerEvent]`
  - slots: `under-tokens`, `over-tokens`
  - exposes: `svgEl` — a `Ref<SVGSVGElement | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/BoardView.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BoardView from '../src/components/BoardView.vue'
import { BALL_OFFSET, PITCH_H, PITCH_W } from '../src/geometry'
import type { FrameView } from '../src/animation'

function frame(over: Partial<FrameView> = {}): FrameView {
  return { counters: [], markers: [], labels: [], balls: [], drawings: [], ...over }
}

function mountView(over: Partial<FrameView> = {}, props: Record<string, unknown> = {}) {
  return mount(BoardView, {
    props: {
      frame: frame(over),
      pitch: { type: 'blank', rotated: false },
      labelsVisible: true,
      ballsVisible: true,
      ...props,
    },
  })
}

describe('BoardView', () => {
  it('draws every piece of the frame it is handed', () => {
    const wrapper = mountView({
      counters: [
        { id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } },
        { id: 'c2', color: 'blue', label: '2', pos: { x: 20, y: 20 } },
      ],
      markers: [{ id: 'm1', pos: { x: 30, y: 30 } }],
      labels: [{ id: 'l1', text: 'press here', pos: { x: 40, y: 40 } }],
      balls: [{ id: 'b1', pos: { x: 50, y: 50 }, attachedTo: null }],
      drawings: [{ id: 'd1', kind: 'line', color: '#fff', from: { x: 1, y: 1 }, to: { x: 9, y: 9 } }],
    })

    expect(wrapper.findAll('[data-counter]')).toHaveLength(2)
    expect(wrapper.findAll('[data-marker]')).toHaveLength(1)
    expect(wrapper.findAll('[data-label]')).toHaveLength(1)
    expect(wrapper.findAll('[data-ball]')).toHaveLength(1)
    expect(wrapper.findAll('[data-drawing]')).toHaveLength(1)
  })

  it('needs no board state: two views of different frames disagree', () => {
    const one = mountView({ counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }] })
    const two = mountView({ counters: [] })

    expect(one.findAll('[data-counter]')).toHaveLength(1)
    expect(two.findAll('[data-counter]')).toHaveLength(0)
  })

  it('hides labels when told to, without losing them', async () => {
    const wrapper = mountView(
      { labels: [{ id: 'l1', text: 'press here', pos: { x: 40, y: 40 } }] },
      { labelsVisible: false },
    )

    expect(wrapper.findAll('[data-label]')).toHaveLength(0)

    await wrapper.setProps({ labelsVisible: true })
    expect(wrapper.findAll('[data-label]')).toHaveLength(1)
  })

  it('hides balls when told to', () => {
    const wrapper = mountView(
      { balls: [{ id: 'b1', pos: { x: 50, y: 50 }, attachedTo: null }] },
      { ballsVisible: false },
    )

    expect(wrapper.findAll('[data-ball]')).toHaveLength(0)
  })

  it('draws a carried ball at its carrier’s feet, not at its stored position', () => {
    const wrapper = mountView({
      counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
      balls: [{ id: 'b1', pos: { x: 90, y: 60 }, attachedTo: 'c1' }],
    })

    const ball = wrapper.find('[data-ball]')
    expect(ball.attributes('transform')).toContain(String(10 + BALL_OFFSET.x))
    expect(ball.attributes('transform')).toContain(String(10 + BALL_OFFSET.y))
  })

  it('rotates the board without the pieces knowing', async () => {
    const wrapper = mountView()

    expect(wrapper.find('svg').attributes('viewBox')).toBe(`0 0 ${PITCH_W} ${PITCH_H}`)

    await wrapper.setProps({ pitch: { type: 'blank', rotated: true } })
    expect(wrapper.find('svg').attributes('viewBox')).toBe(`0 0 ${PITCH_H} ${PITCH_W}`)
    expect(wrapper.find('g').attributes('transform')).toBe(`translate(${PITCH_H} 0) rotate(90)`)
  })

  it('reports a grab rather than acting on it', () => {
    const wrapper = mountView({
      counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    })

    // PlayerCounter puts its listener on the enlarged transparent hit circle,
    // the last child of its group — jsdom does no hit-testing, so a press has
    // to be aimed there. See the note atop tests/PitchBoard.spec.ts.
    const hit = wrapper.find('[data-counter]').element.lastElementChild!
    hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))

    expect(wrapper.emitted('grabCounter')?.[0]?.[0]).toBe('c1')
  })

  it('paints what is under the tokens beneath them, and what is over above', () => {
    const wrapper = mountView({
      counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    }, {})

    const withSlots = mount(BoardView, {
      props: {
        frame: frame({ counters: [{ id: 'c1', color: 'red', label: '1', pos: { x: 10, y: 10 } }] }),
        pitch: { type: 'blank', rotated: false },
        labelsVisible: true,
        ballsVisible: true,
      },
      slots: {
        'under-tokens': '<circle data-under r="1" />',
        'over-tokens': '<circle data-over r="1" />',
      },
    })

    const order = [...withSlots.find('g').element.children].map((el) =>
      el.hasAttribute('data-under') ? 'under'
        : el.hasAttribute('data-over') ? 'over'
        : el.hasAttribute('data-counter') ? 'counter'
        : 'other',
    )

    expect(order.indexOf('under')).toBeLessThan(order.indexOf('counter'))
    expect(order.indexOf('over')).toBeGreaterThan(order.indexOf('counter'))
    expect(wrapper.findAll('[data-under]')).toHaveLength(0)
  })

  it('exposes its svg element so it can be rasterised', () => {
    const wrapper = mountView()
    expect((wrapper.vm as unknown as { svgEl: SVGSVGElement }).svgEl.tagName).toBe('svg')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/BoardView.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/components/BoardView.vue"`.

- [ ] **Step 3: Write `BoardView.vue`**

Create `src/components/BoardView.vue`. The template is lifted from `PitchBoard.vue:1016-1119` with the furniture replaced by slots and `board.state.*` replaced by props:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PitchType } from '../types'
import type { FrameView } from '../animation'
import { ballPositionIn } from '../animation'
import { PITCH_H, PITCH_W, viewBoxOf } from '../geometry'
import PitchMarkings from './PitchMarkings.vue'
import PlayerCounter from './PlayerCounter.vue'
import BallToken from './BallToken.vue'
import ConeMarker from './ConeMarker.vue'
import PitchLabel from './PitchLabel.vue'
import DrawingLayer from './DrawingLayer.vue'

/**
 * The board, drawn.
 *
 * Everything it needs arrives as props, so it can draw a frame from a saved
 * drill that is not open as readily as the one on screen — which is what lets
 * a session export rasterise several drills without disturbing the board the
 * coach is working on.
 *
 * It knows nothing about selection, dragging or tools. Those live in
 * PitchBoard, which wraps this and fills the two slots below.
 */
const props = defineProps<{
  frame: FrameView
  pitch: { type: PitchType; rotated: boolean }
  labelsVisible: boolean
  ballsVisible: boolean
  /** Drawings to draw a halo behind. Absent for a board nobody is editing. */
  selectedDrawingIds?: string[]
}>()

/**
 * Grabs are reported, not acted on. What a press means depends on the tool
 * and on the drag already in progress, and neither is this component's
 * business.
 */
const emit = defineEmits<{
  grabCounter: [id: string, event: PointerEvent]
  grabMarker: [id: string, event: PointerEvent]
  grabLabel: [id: string, event: PointerEvent]
  grabBall: [id: string, event: PointerEvent]
  hitDrawing: [id: string, event: PointerEvent]
}>()

const svgEl = ref<SVGSVGElement | null>(null)

const viewBox = computed(() => viewBoxOf(props.pitch.rotated))

/** The rotation is applied once, here, so nothing downstream knows about it. */
const boardTransform = computed(() =>
  props.pitch.rotated ? `translate(${PITCH_H} 0) rotate(90)` : '',
)

const drawingHaloes = computed(() => props.selectedDrawingIds ?? [])

/**
 * Every ball on screen: where it is drawn, and whether it is riding on a
 * counter that still exists. A carried ball is drawn at its carrier's feet
 * rather than at its own stored position, which is what `ballPositionIn`
 * answers — and it answers it from the frame alone, with no board involved.
 */
const shownBalls = computed(() =>
  props.frame.balls.map((ball) => ({
    id: ball.id,
    pos: ballPositionIn(props.frame, ball),
    attached:
      ball.attachedTo !== null &&
      props.frame.counters.some((c) => c.id === ball.attachedTo),
  })),
)

defineExpose({ svgEl })
</script>

<template>
  <svg ref="svgEl" class="board" :viewBox="viewBox" xmlns="http://www.w3.org/2000/svg">
    <g :transform="boardTransform">
      <rect :x="0" :y="0" :width="PITCH_W" :height="PITCH_H" fill="#2e7d32" />
      <PitchMarkings :type="pitch.type" />
      <DrawingLayer
        :drawings="frame.drawings"
        :selected-ids="drawingHaloes"
        @hit="(id: string, event: PointerEvent) => emit('hitDrawing', id, event)"
      />
      <!--
        Whatever is painted beneath the pieces: the selection rings, when
        there is a selection. A slot rather than a prop because it is markup,
        and because the order it depends on belongs here, in the one file that
        draws the order.
      -->
      <slot name="under-tokens" />
      <ConeMarker
        v-for="marker in frame.markers"
        :key="marker.id"
        :marker="marker"
        :rotated="pitch.rotated"
        @grab="(event: PointerEvent) => emit('grabMarker', marker.id, event)"
      />
      <PlayerCounter
        v-for="counter in frame.counters"
        :key="counter.id"
        :counter="counter"
        :rotated="pitch.rotated"
        :has-ball="ballsVisible && frame.balls.some((b) => b.attachedTo === counter.id)"
        @grab="(event: PointerEvent) => emit('grabCounter', counter.id, event)"
      />
      <PitchLabel
        v-for="label in labelsVisible ? frame.labels : []"
        :key="label.id"
        :label="label"
        :rotated="pitch.rotated"
        @grab="(event: PointerEvent) => emit('grabLabel', label.id, event)"
      />
      <BallToken
        v-for="ball in ballsVisible ? shownBalls : []"
        :key="ball.id"
        :pos="ball.pos"
        :attached="ball.attached"
        @grab="(event: PointerEvent) => emit('grabBall', ball.id, event)"
      />
      <!--
        Whatever is painted over the pieces: the bend and end handles, and the
        marquee. Handles go above the tokens deliberately — an arrow nearly
        always ends ON a player, and when the two overlap the handle is what
        the coach is reaching for.
      -->
      <slot name="over-tokens" />
    </g>
  </svg>
</template>

<style scoped>
.board {
  /* Without this, a drag on a tablet scrolls the page instead of the counter. */
  touch-action: none;
  width: 100%;
  height: 100%;
  display: block;
  background: #1b5e20;
}
</style>
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/BoardView.spec.ts`
Expected: PASS, 9 tests.

If the carried-ball assertion fails on the transform's format, read what `BallToken.vue` actually renders and assert against that shape — do not change the component to suit the test.

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/BoardView.vue tests/BoardView.spec.ts
git commit -m "feat: a board that draws any frame it is handed"
```

---

### Task 2: `PitchBoard` draws through `BoardView`

**Files:**
- Modify: `src/components/PitchBoard.vue` — replace the template at `1016-1119`; delete the `viewBox`, `boardTransform` and `shownBalls` computeds at `204-230`; swap six child imports for `BoardView`
- Test: `tests/PitchBoard.spec.ts` — unchanged, and that is the point

**Interfaces:**
- Consumes: `BoardView`'s props, emits, slots and exposed `svgEl` from Task 1.
- Produces: `PitchBoard`'s exposed surface unchanged — `{ svgEl, deleteSelected, duplicateSelected, clearSelection }`. `App.vue` reads `boardRef.value?.svgEl` and must keep working with no edit.

- [ ] **Step 1: Run the suite and record the baseline**

Run: `npm test`
Expected: PASS. Write down the total count. That number must not change by the end of this task.

- [ ] **Step 2: Replace `PitchBoard`'s template**

Swap the whole `<template>` block for this. Every handler, every furniture element and the paint order are preserved; only ownership of the `<svg>` moves:

```vue
<template>
  <BoardView
    ref="boardView"
    :frame="view"
    :pitch="board.state.pitch"
    :labels-visible="board.state.labelsVisible"
    :balls-visible="board.state.ballsVisible"
    :selected-drawing-ids="selectedDrawingIds"
    @grab-counter="onCounterGrab"
    @grab-marker="onMarkerGrab"
    @grab-label="onLabelGrab"
    @grab-ball="onBallGrab"
    @hit-drawing="onDrawingHit"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <template #under-tokens>
      <!--
        Rings for everything held that is not a drawing, painted under the
        pieces themselves so a ring reads as a halo rather than as part of
        the player. Drawings get their halo inside the drawing layer.
      -->
      <circle
        v-for="token in selectedTokens"
        :key="token.key"
        data-selected-token
        :cx="token.pos.x"
        :cy="token.pos.y"
        :r="token.r"
        fill="#ffffff"
        fill-opacity="0.28"
      />
    </template>

    <template #over-tokens>
      <BendHandle
        v-for="arrow in bendHandles"
        :key="`bend-${arrow.id}`"
        :arrow="arrow"
        @grab="onBendGrab(arrow.id, $event)"
      />
      <template v-for="segment in endHandles" :key="`ends-${segment.id}`">
        <EndHandle
          v-for="end in (['from', 'to'] as const)"
          :key="end"
          :at="segment[end]"
          :color="segment.color"
          @grab="onEndGrab(segment.id, end, $event)"
        />
      </template>
      <!--
        The box, drawn last so it is never hidden by what it is gathering.
        Dashed and unfilled: it is a gesture in progress, not a thing on the
        pitch, and it disappears the moment the pointer comes up.
      -->
      <rect
        v-if="marqueeRect"
        data-marquee
        :x="marqueeRect.x"
        :y="marqueeRect.y"
        :width="marqueeRect.width"
        :height="marqueeRect.height"
        fill="#ffffff"
        fill-opacity="0.12"
        stroke="#ffffff"
        stroke-width="0.3"
        stroke-dasharray="1.5 1.2"
      />
    </template>
  </BoardView>
</template>
```

Delete `PitchBoard`'s `<style scoped>` block entirely — `.board` moved to `BoardView` along with the element it styles.

The four pointer handlers reach the `<svg>` by attribute fallthrough: `BoardView` has a single root element and declares none of them as emits.

- [ ] **Step 3: Rewire the script**

Replace the six now-unused child imports (`PitchMarkings`, `PlayerCounter`, `BallToken`, `ConeMarker`, `PitchLabel`, `DrawingLayer`) with `BoardView`, keeping `BendHandle` and `EndHandle`:

```ts
import BoardView from './BoardView.vue'
import BendHandle from './BendHandle.vue'
import EndHandle from './EndHandle.vue'
```

Delete the `viewBox`, `boardTransform` and `shownBalls` computeds at `204-230`; all three now live in `BoardView`. Keep `view` at line `219` — it is what gets passed down.

Replace the `svgEl` ref with one that reaches through the child:

```ts
const boardView = ref<InstanceType<typeof BoardView> | null>(null)

/**
 * The svg belongs to BoardView now. Everything here that needs it — pointer
 * capture, and turning a client point into a pitch point — reads it through
 * the child, and so does the PNG export, which App reaches by way of the
 * `svgEl` this still exposes.
 */
const svgEl = computed<SVGSVGElement | null>(() => boardView.value?.svgEl ?? null)
```

`defineExpose({ svgEl, deleteSelected, duplicateSelected, clearSelection })` stays exactly as it is: Vue unwraps the computed on the exposed object, so `App.vue`'s `boardRef.value?.svgEl` still receives an element.

`onCounterGrab`, `onMarkerGrab`, `onLabelGrab` and `onBallGrab` already take `(id, event)` — the shape `BoardView` emits — so they bind by name with no adapter.

Then check whether `PITCH_W` is still used: run `grep -n 'PITCH_W' src/components/PitchBoard.vue` and drop it from the `geometry` import only if there are no hits. The hit-testing and clamping may still want it.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, with the same total as Step 1.

If a `PitchBoard` test fails, the extraction changed behaviour. Fix the components, **not the test.** Likely culprits, in order: a grab handler bound to the wrong emit name; furniture in the wrong slot, changing paint order; a pointer handler that did not fall through because `BoardView` grew a second root element.

- [ ] **Step 5: Type-check and build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 6: Check by eye**

Run `npm run dev`, open the board and confirm: a player drags; an arrow draws; Move picks up a drawing and shows its handles; a box selection gathers; Play animates; PNG export produces an image with no handles baked into it.

The suite covers all of this, but the extraction moved an `<svg>` between components, and a board that renders at the wrong size or without `touch-action` is invisible to jsdom.

- [ ] **Step 7: Commit**

```bash
git add src/components/PitchBoard.vue
git commit -m "refactor: PitchBoard draws through BoardView"
```

---

## Done when

- `BoardView` renders a frame with no board state involved, proven by `tests/BoardView.spec.ts`.
- `PitchBoard` is smaller by its whole template and three computeds, and its 160 tests pass untouched.
- `App.vue` is unmodified.
- `npm run build` is clean.
