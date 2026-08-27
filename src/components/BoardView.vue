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
