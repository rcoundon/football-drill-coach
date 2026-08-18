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

const board = useBoard()
const svgEl = ref<SVGSVGElement | null>(null)

defineExpose({ svgEl })

type Drag =
  | { kind: 'counter'; id: string }
  | { kind: 'ball' }
  | { kind: 'pen'; id: string }
  | { kind: 'arrow'; id: string }

const drag = ref<Drag | null>(null)

const viewBox = computed(() => viewBoxOf(board.state.pitch.rotated))

/** The rotation is applied once, here, so nothing downstream knows about it. */
const boardTransform = computed(() =>
  board.state.pitch.rotated ? `translate(${PITCH_H} 0) rotate(90)` : '',
)

const ballPos = computed(() => board.ballPosition())

function toPitch(event: PointerEvent) {
  const rect = svgEl.value!.getBoundingClientRect()
  return clientToPitch(rect, event.clientX, event.clientY, board.state.pitch.rotated)
}

function capture(event: PointerEvent) {
  svgEl.value?.setPointerCapture(event.pointerId)
}

function onCounterGrab(id: string, event: PointerEvent) {
  if (props.tool === 'erase') {
    board.deleteCounter(id)
    return
  }
  if (props.tool !== 'select') return
  event.stopPropagation()
  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = { kind: 'counter', id }
  board.moveCounter(id, toPitch(event))
}

function onBallGrab(event: PointerEvent) {
  if (props.tool !== 'select') return
  event.stopPropagation()
  capture(event)
  board.commit()
  drag.value = { kind: 'ball' }
  board.moveBall(toPitch(event))
}

function onDrawingHit(id: string) {
  if (props.tool === 'erase') board.deleteDrawing(id)
}

function onPointerDown(event: PointerEvent) {
  const at = toPitch(event)
  if (props.tool === 'pen') {
    capture(event)
    drag.value = { kind: 'pen', id: board.startPen(at, props.drawColor) }
  } else if (props.tool === 'arrow-run' || props.tool === 'arrow-pass') {
    capture(event)
    const style = props.tool === 'arrow-run' ? 'run' : 'pass'
    drag.value = { kind: 'arrow', id: board.startArrow(at, props.drawColor, style) }
  }
}

function onPointerMove(event: PointerEvent) {
  const active = drag.value
  if (!active) return
  const at = toPitch(event)
  if (active.kind === 'counter') board.moveCounter(active.id, at)
  else if (active.kind === 'ball') board.moveBall(at)
  else if (active.kind === 'pen') board.extendPen(active.id, at)
  else board.updateArrow(active.id, at)
}

function onPointerUp(event: PointerEvent) {
  const active = drag.value
  if (!active) return
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
      <BallToken :pos="ballPos" @grab="onBallGrab" />
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
