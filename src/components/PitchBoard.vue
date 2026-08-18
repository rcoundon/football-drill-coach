<script lang="ts">
/**
 * How close together two presses on the same counter must be to count as a
 * double press. Roughly a platform double-click interval.
 */
export const DOUBLE_PRESS_MS = 400
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolMode } from '../types'
import { PITCH_H, PITCH_W, clientToPitch, viewBoxOf } from '../geometry'
import { useBoard } from '../composables/useBoard'
import PitchMarkings from './PitchMarkings.vue'
import PlayerCounter from './PlayerCounter.vue'
import BallToken from './BallToken.vue'
import DrawingLayer from './DrawingLayer.vue'

const props = defineProps<{ tool: ToolMode; drawColor: string }>()
const emit = defineEmits<{ rename: [id: string] }>()

const board = useBoard()
const svgEl = ref<SVGSVGElement | null>(null)

defineExpose({ svgEl })

type DragTarget =
  | { kind: 'counter'; id: string }
  | { kind: 'ball' }
  | { kind: 'pen'; id: string }
  | { kind: 'arrow'; id: string }

/**
 * There is one drag at a time, and it belongs to one pointer.
 *
 * Without the pointerId, a second pointer going down mid-drag (a resting
 * palm beside a stylus, a second finger) overwrites this value, leaks the
 * first pointer's capture and misattributes its moves to the new target.
 */
type Drag = DragTarget & { pointerId: number }

const drag = ref<Drag | null>(null)

/** The last press on a counter, for detecting a double press. */
let lastCounterPress: { id: string; at: number } | null = null

/** True for a pointermove/up belonging to some pointer other than the dragging one. */
function isOtherPointer(event: PointerEvent): boolean {
  return drag.value !== null && drag.value.pointerId !== event.pointerId
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
  svgEl.value?.setPointerCapture(event.pointerId)
}

function onCounterGrab(id: string, event: PointerEvent) {
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteCounter(id)
    return
  }
  if (props.tool !== 'select') return
  if (drag.value) return // a drag is already live; ignore the second pointer
  event.stopPropagation()

  /*
   * Rename is detected here rather than from a `dblclick` handler on the
   * counter. `setPointerCapture` below retargets the compatibility mouse
   * events at the capturing <svg>, so `click` and `dblclick` never reach the
   * counter in a real browser and a handler there can never fire. Counting
   * presses ourselves survives capture and matches double-tap on a tablet.
   */
  const now = Date.now()
  const isSecondPress =
    lastCounterPress !== null &&
    lastCounterPress.id === id &&
    now - lastCounterPress.at <= DOUBLE_PRESS_MS
  lastCounterPress = isSecondPress ? null : { id, at: now }

  if (isSecondPress) {
    emit('rename', id)
    return
  }

  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = { kind: 'counter', id, pointerId: event.pointerId }
  board.moveCounter(id, toPitch(event))
}

function onBallGrab(event: PointerEvent) {
  if (props.tool !== 'select') return
  if (drag.value) return
  event.stopPropagation()
  capture(event)
  board.commit()
  drag.value = { kind: 'ball', pointerId: event.pointerId }
  board.moveBall(toPitch(event))
}

function onDrawingHit(id: string) {
  if (props.tool === 'erase') board.deleteDrawing(id)
}

function onPointerDown(event: PointerEvent) {
  if (drag.value) return
  const at = toPitch(event)
  if (props.tool === 'pen') {
    capture(event)
    drag.value = { kind: 'pen', id: board.startPen(at, props.drawColor), pointerId: event.pointerId }
  } else if (props.tool === 'arrow-run' || props.tool === 'arrow-pass') {
    capture(event)
    const style = props.tool === 'arrow-run' ? 'run' : 'pass'
    drag.value = {
      kind: 'arrow',
      id: board.startArrow(at, props.drawColor, style),
      pointerId: event.pointerId,
    }
  }
}

function onPointerMove(event: PointerEvent) {
  const active = drag.value
  if (!active || isOtherPointer(event)) return
  const at = toPitch(event)
  if (active.kind === 'counter') board.moveCounter(active.id, at)
  else if (active.kind === 'ball') board.moveBall(at)
  else if (active.kind === 'pen') board.extendPen(active.id, at)
  else board.updateArrow(active.id, at)
}

function onPointerUp(event: PointerEvent) {
  const active = drag.value
  if (!active || isOtherPointer(event)) return
  const at = toPitch(event)
  if (active.kind === 'counter') board.moveCounter(active.id, at)
  else if (active.kind === 'ball') board.dropBall(at)
  else if (active.kind === 'pen') {
    board.extendPen(active.id, at)
    board.finishDrawing(active.id)
  } else {
    board.updateArrow(active.id, at)
    board.finishDrawing(active.id)
  }
  drag.value = null
  svgEl.value?.releasePointerCapture(event.pointerId)
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
      <PlayerCounter
        v-for="counter in board.state.counters"
        :key="counter.id"
        :counter="counter"
        :rotated="board.state.pitch.rotated"
        :has-ball="board.state.ball.attachedTo === counter.id"
        @grab="onCounterGrab(counter.id, $event)"
      />
      <BallToken :pos="ballPos" :attached="ballAttached" @grab="onBallGrab" />
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
