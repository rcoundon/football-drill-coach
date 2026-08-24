<script setup lang="ts">
import type { Drawing, PenDrawing, SegmentDrawing } from '../types'
import { curveControlPoint } from '../geometry'

defineProps<{ drawings: Drawing[]; selectedIds: string[] }>()
defineEmits<{ hit: [id: string, event: PointerEvent] }>()

/**
 * The halo behind the chosen drawing. Wide and translucent so it reads on
 * grass and under all four draw colours, and painted beneath the line itself
 * so it never dulls the thing the coach is looking at.
 */
const SELECTED_STROKE = 1.8

/**
 * An invisible stroke wide enough to press. A drawn line is half a pitch unit
 * across — a couple of pixels on a projector and less than that under a
 * finger — so without this, choosing a drawing would be a test of aim.
 */
const HIT_STROKE = 3

/** Trim the floating-point tail off a coordinate; the pitch is 100 units wide. */
function n(value: number): number {
  return Number(value.toFixed(4))
}

function penPath(drawing: PenDrawing): string {
  return drawing.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${n(p.x)} ${n(p.y)}`).join(' ')
}

/**
 * A segment as a path rather than a line, so a bent arrow can be the same
 * element as a straight one — and so `orient="auto"` swings the head round to
 * the angle the curve actually arrives at, which is the point of drawing a
 * curved pass in the first place.
 *
 * A plain line has no bend to read, so it always comes out straight.
 */
function segmentPath(drawing: SegmentDrawing): string {
  const { from, to } = drawing
  const bend = drawing.kind === 'arrow' ? drawing.bend : undefined
  const start = `M ${n(from.x)} ${n(from.y)}`
  if (!bend) return `${start} L ${n(to.x)} ${n(to.y)}`
  const bendAlong = drawing.kind === 'arrow' ? (drawing.bendAlong ?? 0) : 0
  const control = curveControlPoint(from, to, bend, bendAlong)
  return `${start} Q ${n(control.x)} ${n(control.y)} ${n(to.x)} ${n(to.y)}`
}

/** The geometry of any drawing, for the halo and the press target alike. */
function pathOf(drawing: Drawing): string {
  return drawing.kind === 'pen' ? penPath(drawing) : segmentPath(drawing)
}
</script>

<template>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- One marker per arrow so the head takes the arrow's own colour. -->
    <defs>
      <marker
        v-for="d in drawings.filter((x) => x.kind === 'arrow')"
        :key="`m-${d.id}`"
        :id="`head-${d.id}`"
        markerWidth="4"
        markerHeight="4"
        refX="3"
        refY="2"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M 0 0 L 4 2 L 0 4 z" :fill="d.color" />
      </marker>
    </defs>

    <!--
      Every halo before every line, so one drawing's halo cannot wash out
      another drawing that happens to cross it.
    -->
    <path
      v-for="d in drawings.filter((x) => selectedIds.includes(x.id))"
      :key="`sel-${d.id}`"
      data-selected
      :d="pathOf(d)"
      stroke="#ffffff"
      stroke-opacity="0.45"
      :stroke-width="SELECTED_STROKE"
    />

    <template v-for="d in drawings" :key="d.id">
      <!--
        The press target, under the line it belongs to. Later drawings are
        painted over earlier ones, so pressing where two cross picks the one
        drawn most recently — the same rule the eye is already using.
      -->
      <path
        data-drawing-hit
        :d="pathOf(d)"
        stroke="transparent"
        :stroke-width="HIT_STROKE"
        @pointerdown="$emit('hit', d.id, $event as PointerEvent)"
      />
      <path
        v-if="d.kind === 'pen'"
        data-drawing
        :d="penPath(d)"
        :stroke="d.color"
        stroke-width="0.5"
        @pointerdown="$emit('hit', d.id, $event as PointerEvent)"
      />
      <path
        v-else-if="d.kind === 'arrow'"
        data-drawing
        :d="segmentPath(d)"
        :stroke="d.color"
        stroke-width="0.5"
        :stroke-dasharray="d.style === 'pass' ? '1.6 1.2' : undefined"
        :marker-end="`url(#head-${d.id})`"
        @pointerdown="$emit('hit', d.id, $event as PointerEvent)"
      />
      <line
        v-else
        data-drawing
        :x1="d.from.x"
        :y1="d.from.y"
        :x2="d.to.x"
        :y2="d.to.y"
        :stroke="d.color"
        stroke-width="0.5"
        @pointerdown="$emit('hit', d.id, $event as PointerEvent)"
      />
    </template>
  </g>
</template>
