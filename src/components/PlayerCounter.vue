<script setup lang="ts">
import { computed } from 'vue'
import type { Counter } from '../types'
import { LABEL_INK, SWATCHES, TOKEN_CASING } from './controls'

const props = defineProps<{
  counter: Counter
  rotated: boolean
  hasBall: boolean
  /** Whether what is written on the disc is drawn at all. */
  labelVisible: boolean
}>()

/*
 * There is no `rename` event here. A double press is detected from
 * `pointerdown` in PitchBoard instead: the board calls `setPointerCapture`
 * on press, and pointer capture retargets the compatibility mouse events at
 * the capturing <svg>, so a `@dblclick` handler on this counter would never
 * fire in a real browser.
 */
defineEmits<{ grab: [event: PointerEvent] }>()

/*
 * Both read from the shared palette rather than restating it. A counter
 * drawn in one red and a swatch offering another is the kind of drift two
 * copies of a colour eventually produce.
 */
const fill = computed(() => SWATCHES[props.counter.color])
const textFill = computed(() => LABEL_INK[props.counter.color])

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
    <!--
      A casing, so a player has an edge whatever colour they are. The flat
      discs this restores read cleanly against grass by hue, but hue is the
      one channel a colour-blind coach, bright sunlight or a cheap screen
      takes away: red sits at 1.03:1 against the pitch by luminance, blue at
      1.11:1. The ring is what makes the shape survive all three.
    -->
    <circle
      :r="RADIUS"
      :fill="fill"
      :stroke="TOKEN_CASING"
      stroke-width="0.3"
    />
    <text
      v-if="labelVisible"
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
