<script setup lang="ts">
import { computed } from 'vue'
import type { Goal } from '../types'
import { goalCorners } from '../geometry'
import { TOKEN_CASING } from './controls'

const props = defineProps<{ goal: Goal; selected?: boolean }>()
defineEmits<{ grab: [event: PointerEvent] }>()

/** How many strands of net run back from the goal line. Enough to read as a net, few enough to stay quiet. */
const STRANDS = 4

const corners = computed(() => goalCorners(props.goal))

const outline = computed(() => corners.value.map((p) => `${p.x},${p.y}`).join(' '))

/** Lines from the goal line to the back of the net, evenly spaced between the posts. */
const strands = computed(() => {
  const [a, b, backB, backA] = corners.value
  return Array.from({ length: STRANDS }, (_, i) => {
    const t = (i + 1) / (STRANDS + 1)
    return {
      x1: a.x + (b.x - a.x) * t,
      y1: a.y + (b.y - a.y) * t,
      x2: backA.x + (backB.x - backA.x) * t,
      y2: backA.y + (backB.y - backA.y) * t,
    }
  })
})
</script>

<template>
  <!--
    Every value is an SVG attribute, since PNG export serialises the SVG and
    loses anything set in CSS. Not turned upright with the board, unlike a
    cone: a goal faces a way, and that way turns with the pitch.
  -->
  <g data-goal style="cursor: grab">
    <polygon
      v-if="selected"
      data-goal-halo
      data-transient
      :points="outline"
      fill="none"
      stroke="#ffffff"
      stroke-opacity="0.35"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <polygon :points="outline" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.75" stroke-width="0.18" />
    <line
      v-for="(strand, i) in strands"
      :key="i"
      v-bind="strand"
      stroke="#ffffff"
      stroke-opacity="0.45"
      stroke-width="0.12"
    />
    <!-- The goal line itself, cased like a player so it reads on any grass. -->
    <line
      :x1="goal.a.x" :y1="goal.a.y" :x2="goal.b.x" :y2="goal.b.y"
      :stroke="TOKEN_CASING" stroke-width="0.9" stroke-linecap="round"
    />
    <line
      :x1="goal.a.x" :y1="goal.a.y" :x2="goal.b.x" :y2="goal.b.y"
      stroke="#ffffff" stroke-width="0.55" stroke-linecap="round"
    />
    <!-- A finger is far bigger than a crossbar, so the hit area takes a margin all round. -->
    <polygon
      :points="outline"
      fill="transparent"
      stroke="transparent"
      stroke-width="2.4"
      stroke-linejoin="round"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
