<script setup lang="ts">
import { computed } from 'vue'
import type { Vec } from '../types'
import { curveHandle } from '../geometry'

const props = withDefaults(
  defineProps<{
    /** The chord this handle bends: from where the movement starts, to where it ends. */
    from: Vec
    to: Vec
    bend?: number
    bendAlong?: number
    /** The dot takes the colour of whatever it is bending. */
    color: string
  }>(),
  { bend: 0, bendAlong: 0 },
)
defineEmits<{ grab: [event: PointerEvent] }>()

/** The drawn dot, in pitch units. Small enough not to hide the line it rides. */
const RADIUS = 0.9

/** A finger is far bigger than the dot, so the hit target is larger. */
const BEND_HIT_RADIUS = 2.6

/**
 * The handle rides the curve at the point the bow peaks, so dragging it
 * bends the line the coach can see rather than moving an abstract control
 * point somewhere off it.
 */
const at = computed(() => curveHandle(props.from, props.to, props.bend, props.bendAlong))
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
      :fill="color"
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
