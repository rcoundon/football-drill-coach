<script setup lang="ts">
import { computed } from 'vue'
import type { Counter } from '../types'

const props = defineProps<{ counter: Counter; rotated: boolean; hasBall: boolean }>()

/*
 * There is no `rename` event here. A double press is detected from
 * `pointerdown` in PitchBoard instead: the board calls `setPointerCapture`
 * on press, and pointer capture retargets the compatibility mouse events at
 * the capturing <svg>, so a `@dblclick` handler on this counter would never
 * fire in a real browser.
 */
defineEmits<{ grab: [event: PointerEvent] }>()

const FILLS: Record<Counter['color'], string> = {
  red: '#e53935',
  blue: '#1e88e5',
  yellow: '#fdd835',
  purple: '#8e24aa',
  black: '#212121',
}

const fill = computed(() => FILLS[props.counter.color])
const textFill = computed(() => (props.counter.color === 'yellow' ? '#212121' : '#ffffff'))

/** Labels stay upright when the board is rotated. */
const labelTransform = computed(() => (props.rotated ? 'rotate(-90)' : ''))

const RADIUS = 2.4
/** A finger is far bigger than the drawn counter, so the hit target is larger. */
const HIT_RADIUS = 4.2
</script>

<template>
  <g data-counter :transform="`translate(${counter.pos.x} ${counter.pos.y})`" style="cursor: grab">
    <circle
      v-if="hasBall"
      data-possession-ring
      :r="RADIUS + 1"
      fill="none"
      stroke="#ffffff"
      stroke-width="0.5"
    />
    <circle :r="RADIUS" :fill="fill" />
    <text
      data-counter-label
      :transform="labelTransform"
      text-anchor="middle"
      dominant-baseline="central"
      :fill="textFill"
      font-size="2.2"
      font-weight="600"
      style="user-select: none; pointer-events: none"
    >{{ counter.label }}</text>
    <circle
      :r="HIT_RADIUS"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
