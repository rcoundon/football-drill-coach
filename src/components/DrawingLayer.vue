<script setup lang="ts">
import type { Drawing, PenDrawing } from '../types'

defineProps<{ drawings: Drawing[] }>()
defineEmits<{ hit: [id: string] }>()

function penPath(drawing: PenDrawing): string {
  return drawing.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
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
      <line
        v-else
        data-drawing
        :x1="d.from.x"
        :y1="d.from.y"
        :x2="d.to.x"
        :y2="d.to.y"
        :stroke="d.color"
        stroke-width="0.5"
        :stroke-dasharray="d.style === 'pass' ? '1.6 1.2' : undefined"
        :marker-end="`url(#head-${d.id})`"
        @pointerdown="$emit('hit', d.id)"
      />
    </template>
  </g>
</template>
