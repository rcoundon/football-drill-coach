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
