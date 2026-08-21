<script setup lang="ts">
import { computed } from 'vue'
import type { ArrowDrawing } from '../types'
import { curveMidpoint } from '../geometry'

const props = defineProps<{ arrow: ArrowDrawing }>()
defineEmits<{ grab: [event: PointerEvent] }>()

/** The drawn dot, in pitch units. Small enough not to hide the arrow it rides. */
const RADIUS = 0.9

/** A finger is far bigger than the dot, so the hit target is larger. */
const BEND_HIT_RADIUS = 2.6

/**
 * The handle rides the curve rather than the straight chord, so dragging it
 * bends the line the coach can see rather than moving an abstract control
 * point somewhere off it.
 */
const at = computed(() => curveMidpoint(props.arrow.from, props.arrow.to, props.arrow.bend ?? 0))
</script>

<template>
  <!--
    Transient: an editing affordance rather than part of the drill, so the
    export strips it rather than baking a row of dots into the coach's image.

    The listener sits on the enlarged transparent circle, which is painted
    last: see the paint-order note in PlayerCounter.vue.
  -->
  <g data-bend-handle data-transient style="cursor: grab">
    <circle
      data-bend
      :cx="at.x"
      :cy="at.y"
      :r="RADIUS"
      :fill="arrow.color"
      stroke="#00000060"
      stroke-width="0.2"
    />
    <circle
      :cx="at.x"
      :cy="at.y"
      :r="BEND_HIT_RADIUS"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
