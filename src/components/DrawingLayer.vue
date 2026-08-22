<script setup lang="ts">
import type { ArrowDrawing, Drawing, PenDrawing } from '../types'
import { curveControlPoint } from '../geometry'

defineProps<{ drawings: Drawing[] }>()
defineEmits<{ hit: [id: string] }>()

/** Trim the floating-point tail off a coordinate; the pitch is 100 units wide. */
function n(value: number): number {
  return Number(value.toFixed(4))
}

function penPath(drawing: PenDrawing): string {
  return drawing.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${n(p.x)} ${n(p.y)}`).join(' ')
}

/**
 * An arrow is a path rather than a line so a bent one can be the same
 * element as a straight one — and so `orient="auto"` swings the head round
 * to the angle the curve actually arrives at, which is the point of drawing
 * a curved pass in the first place.
 */
function arrowPath(drawing: ArrowDrawing): string {
  const { from, to, bend } = drawing
  const start = `M ${n(from.x)} ${n(from.y)}`
  if (!bend) return `${start} L ${n(to.x)} ${n(to.y)}`
  const control = curveControlPoint(from, to, bend)
  return `${start} Q ${n(control.x)} ${n(control.y)} ${n(to.x)} ${n(to.y)}`
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

    <template v-for="d in drawings" :key="d.id">
      <path
        v-if="d.kind === 'pen'"
        data-drawing
        :d="penPath(d)"
        :stroke="d.color"
        stroke-width="0.5"
        @pointerdown="$emit('hit', d.id)"
      />
      <path
        v-else-if="d.kind === 'arrow'"
        data-drawing
        :d="arrowPath(d)"
        :stroke="d.color"
        stroke-width="0.5"
        :stroke-dasharray="d.style === 'pass' ? '1.6 1.2' : undefined"
        :marker-end="`url(#head-${d.id})`"
        @pointerdown="$emit('hit', d.id)"
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
        @pointerdown="$emit('hit', d.id)"
      />
    </template>
  </g>
</template>
