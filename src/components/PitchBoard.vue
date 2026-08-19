<script lang="ts">
/**
 * How close together two presses on the same counter must be to count as a
 * double press. Roughly a platform double-click interval.
 */
export const DOUBLE_PRESS_MS = 400

/**
 * How near the first press a second one must land to read as a double press,
 * in pitch units. A press further away than this is a fresh grab, not the
 * second half of a gesture.
 */
export const DOUBLE_PRESS_RADIUS = 3

/**
 * Pointer travel past which a press counts as a drag rather than a tap, in
 * pitch units. Small enough that a deliberate nudge registers, large enough
 * to absorb the wobble of a finger holding still.
 */
export const TAP_TOLERANCE = 0.5

/**
 * How long a drag may sit with no pointer events before a new press is
 * allowed to take it over, when the browser cannot say whether the pointer
 * still holds capture. Only a fallback: `hasPointerCapture` answers instantly
 * everywhere that implements it.
 */
export const STALE_DRAG_MS = 10_000
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolMode, Vec } from '../types'
import { PITCH_H, PITCH_W, clientToPitch, viewBoxOf } from '../geometry'
import { useBoard } from '../composables/useBoard'
import PitchMarkings from './PitchMarkings.vue'
import PlayerCounter from './PlayerCounter.vue'
import BallToken from './BallToken.vue'
import ConeMarker from './ConeMarker.vue'
import PitchLabel from './PitchLabel.vue'
import DrawingLayer from './DrawingLayer.vue'

const props = defineProps<{ tool: ToolMode; drawColor: string }>()
const emit = defineEmits<{ rename: [id: string]; addLabel: [at: Vec]; editLabel: [id: string] }>()

const board = useBoard()
const svgEl = ref<SVGSVGElement | null>(null)

defineExpose({ svgEl })

type DragTarget =
  | { kind: 'counter'; id: string }
  | { kind: 'marker'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'ball' }
  | { kind: 'pen'; id: string }
  | { kind: 'segment'; id: string }

/**
 * There is one drag at a time, and it belongs to one pointer.
 *
 * Without the pointerId, a second pointer going down mid-drag (a resting
 * palm beside a stylus, a second finger) overwrites this value, leaks the
 * first pointer's capture and misattributes its moves to the new target.
 */
type Drag = DragTarget & {
  pointerId: number
  /** Where the press landed, so travel can be measured against it. */
  origin: Vec
  /** True once the pointer has travelled far enough to mean a drag, not a tap. */
  moved: boolean
  startedAt: number
}

const drag = ref<Drag | null>(null)

/** The last press on a counter that ended without moving, for detecting a double press. */
let lastCounterPress: { id: string; at: number; pos: Vec } | null = null
let lastLabelPress: { id: string; at: number; pos: Vec } | null = null

/** True for a pointermove/up belonging to some pointer other than the dragging one. */
function isOtherPointer(event: PointerEvent): boolean {
  return drag.value !== null && drag.value.pointerId !== event.pointerId
}

function clearDrag(): void {
  const active = drag.value
  drag.value = null
  if (!active) return
  try {
    svgEl.value?.releasePointerCapture(active.pointerId)
  } catch {
    // The pointer is already gone; there was nothing left to release.
  }
}

/**
 * True when a drag is still owned by a pointer that exists.
 *
 * A pointerup can go missing — a browser quirk, a pointercancel that never
 * arrives, a pointer leaving under a system gesture. Refusing every new press
 * while `drag` is set would then brick the board for the rest of the session,
 * so a drag whose pointer no longer holds capture is abandoned and the new
 * press takes over. That is the self-healing the old code got for free by
 * overwriting `drag` blindly, kept without the misattribution that caused.
 */
function dragIsLive(): boolean {
  const active = drag.value
  if (!active) return false

  const svg = svgEl.value
  let stale: boolean
  if (svg && typeof svg.hasPointerCapture === 'function') {
    try {
      stale = !svg.hasPointerCapture(active.pointerId)
    } catch {
      stale = true
    }
  } else {
    stale = Date.now() - active.startedAt > STALE_DRAG_MS
  }

  if (!stale) return true
  clearDrag()
  return false
}

/** Record travel away from the press point, once, for the whole drag. */
function noteTravel(active: Drag, at: Vec): void {
  if (active.moved) return
  if (Math.hypot(at.x - active.origin.x, at.y - active.origin.y) > TAP_TOLERANCE) {
    active.moved = true
  }
}

const viewBox = computed(() => viewBoxOf(board.state.pitch.rotated))

/** The rotation is applied once, here, so nothing downstream knows about it. */
const boardTransform = computed(() =>
  board.state.pitch.rotated ? `translate(${PITCH_H} 0) rotate(90)` : '',
)

const ballPos = computed(() => board.ballPosition())

/** True only when the ball is actually riding on a counter that still exists. */
const ballAttached = computed(() => {
  const holder = board.state.ball.attachedTo
  return holder !== null && board.counterById(holder) !== undefined
})

function toPitch(event: PointerEvent) {
  const rect = svgEl.value!.getBoundingClientRect()
  return clientToPitch(rect, event.clientX, event.clientY, board.state.pitch.rotated)
}

function capture(event: PointerEvent) {
  try {
    svgEl.value?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is a nicety — it keeps events coming when the pointer leaves the
    // svg. A browser that refuses must not cost the coach the drag itself.
  }
}

function onCounterGrab(id: string, event: PointerEvent) {
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteCounter(id)
    return
  }
  if (props.tool !== 'select') return
  if (dragIsLive()) return // another pointer is mid-drag; ignore this one
  event.stopPropagation()

  /*
   * Rename is detected here rather than from a `dblclick` handler on the
   * counter. `setPointerCapture` below retargets the compatibility mouse
   * events at the capturing <svg>, so `click` and `dblclick` never reach the
   * counter in a real browser and a handler there can never fire. Counting
   * presses ourselves survives capture and matches double-tap on a tablet.
   */
  const now = Date.now()
  const at = toPitch(event)
  const isSecondPress =
    lastCounterPress !== null &&
    lastCounterPress.id === id &&
    now - lastCounterPress.at <= DOUBLE_PRESS_MS &&
    Math.hypot(at.x - lastCounterPress.pos.x, at.y - lastCounterPress.pos.y) <= DOUBLE_PRESS_RADIUS
  lastCounterPress = isSecondPress ? null : { id, at: now, pos: at }

  if (isSecondPress) {
    emit('rename', id)
    return
  }

  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = { kind: 'counter', id, pointerId: event.pointerId, origin: at, moved: false, startedAt: now }
  board.moveCounter(id, at)
}

/**
 * The ball is deliberately NOT moved here. It is drawn at BALL_OFFSET from
 * its holder, so a press anywhere on it is off the holder's centre and may be
 * nearer a neighbour's; snapping it to the finger and re-resolving possession
 * on release would hand a tapped ball to the wrong player. A tap that never
 * travels is not a re-placement at all, so it leaves possession untouched —
 * the ball only moves once the pointer does.
 */
function onLabelGrab(id: string, event: PointerEvent) {
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteLabel(id)
    return
  }
  if (props.tool !== 'select' || dragIsLive()) return
  event.stopPropagation()

  // Same double-press detection as a counter, and for the same reason:
  // pointer capture stops dblclick ever reaching this element.
  const now = Date.now()
  const at = toPitch(event)
  const isSecondPress =
    lastLabelPress !== null &&
    lastLabelPress.id === id &&
    now - lastLabelPress.at <= DOUBLE_PRESS_MS &&
    Math.hypot(at.x - lastLabelPress.pos.x, at.y - lastLabelPress.pos.y) <= DOUBLE_PRESS_RADIUS
  lastLabelPress = isSecondPress ? null : { id, at: now, pos: at }

  if (isSecondPress) {
    emit('editLabel', id)
    return
  }

  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = {
    kind: 'label',
    id,
    pointerId: event.pointerId,
    origin: at,
    moved: false,
    startedAt: now,
  }
  board.moveLabel(id, at)
}

function onMarkerGrab(id: string, event: PointerEvent) {
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteMarker(id)
    return
  }
  if (props.tool !== 'select' || dragIsLive()) return
  event.stopPropagation()
  capture(event)
  board.commit() // one entry for the whole drag
  const at = toPitch(event)
  drag.value = {
    kind: 'marker',
    id,
    pointerId: event.pointerId,
    origin: at,
    moved: false,
    startedAt: Date.now(),
  }
  board.moveMarker(id, at)
}

function onBallGrab(event: PointerEvent) {
  if (props.tool !== 'select') return
  if (dragIsLive()) return
  event.stopPropagation()
  capture(event)
  board.commit()
  drag.value = {
    kind: 'ball',
    pointerId: event.pointerId,
    origin: toPitch(event),
    moved: false,
    startedAt: Date.now(),
  }
}

function onDrawingHit(id: string) {
  if (props.tool === 'erase') board.deleteDrawing(id)
}

function onPointerDown(event: PointerEvent) {
  if (dragIsLive()) return
  const at = toPitch(event)
  const shared = { pointerId: event.pointerId, origin: at, moved: false, startedAt: Date.now() }
  if (props.tool === 'pen') {
    capture(event)
    drag.value = { kind: 'pen', id: board.startPen(at, props.drawColor), ...shared }
  } else if (props.tool === 'arrow-run' || props.tool === 'arrow-pass') {
    capture(event)
    const style = props.tool === 'arrow-run' ? 'run' : 'pass'
    drag.value = { kind: 'segment', id: board.startArrow(at, props.drawColor, style), ...shared }
  } else if (props.tool === 'text') {
    // The text itself is typed in a dialog the app owns, so the board only
    // reports where the coach tapped.
    emit('addLabel', at)
  } else if (props.tool === 'cone') {
    // Placed on press rather than as a drag: laying out a grid is a
    // sequence of taps, and a cone has no size to drag out.
    board.addMarker(at)
  } else if (props.tool === 'line') {
    capture(event)
    drag.value = { kind: 'segment', id: board.startLine(at, props.drawColor), ...shared }
  }
}

function onPointerMove(event: PointerEvent) {
  const active = drag.value
  if (!active || isOtherPointer(event)) return
  const at = toPitch(event)
  noteTravel(active, at)
  if (active.kind === 'counter') board.moveCounter(active.id, at)
  else if (active.kind === 'marker') board.moveMarker(active.id, at)
  else if (active.kind === 'label') board.moveLabel(active.id, at)
  else if (active.kind === 'ball') {
    if (active.moved) board.moveBall(at)
  } else if (active.kind === 'pen') board.extendPen(active.id, at)
  else board.updateSegment(active.id, at)
}

function onPointerUp(event: PointerEvent) {
  const active = drag.value
  if (!active || isOtherPointer(event)) return
  const at = toPitch(event)
  noteTravel(active, at)

  if (active.kind === 'counter') {
    board.moveCounter(active.id, at)
    // A press that travelled was a drag, not the first half of a double
    // press. Leaving it armed turns an ordinary nudge-release-regrab rhythm
    // into a rename prompt with no drag.
    if (active.moved && lastCounterPress?.id === active.id) lastCounterPress = null
  } else if (active.kind === 'marker') {
    board.moveMarker(active.id, at)
  } else if (active.kind === 'label') {
    board.moveLabel(active.id, at)
  } else if (active.kind === 'ball') {
    if (active.moved) board.dropBall(at)
  } else if (active.kind === 'pen') {
    board.extendPen(active.id, at)
    board.finishDrawing(active.id)
  } else {
    board.updateSegment(active.id, at)
    board.finishDrawing(active.id)
  }
  clearDrag()
}
</script>

<template>
  <svg
    ref="svgEl"
    class="board"
    :viewBox="viewBox"
    xmlns="http://www.w3.org/2000/svg"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <g :transform="boardTransform">
      <rect :x="0" :y="0" :width="PITCH_W" :height="PITCH_H" fill="#2e7d32" />
      <PitchMarkings :type="board.state.pitch.type" />
      <DrawingLayer :drawings="board.state.drawings" @hit="onDrawingHit" />
      <ConeMarker
        v-for="marker in board.state.markers"
        :key="marker.id"
        :marker="marker"
        :rotated="board.state.pitch.rotated"
        @grab="onMarkerGrab(marker.id, $event)"
      />
      <PlayerCounter
        v-for="counter in board.state.counters"
        :key="counter.id"
        :counter="counter"
        :rotated="board.state.pitch.rotated"
        :has-ball="board.state.ball.visible && board.state.ball.attachedTo === counter.id"
        @grab="onCounterGrab(counter.id, $event)"
      />
      <PitchLabel
        v-for="label in board.state.labelsVisible ? board.state.labels : []"
        :key="label.id"
        :label="label"
        :rotated="board.state.pitch.rotated"
        @grab="onLabelGrab(label.id, $event)"
      />
      <BallToken
        v-if="board.state.ball.visible"
        :pos="ballPos"
        :attached="ballAttached"
        @grab="onBallGrab"
      />
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
