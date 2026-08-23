<script setup lang="ts">
import type { Vec } from '../types'

defineProps<{ at: Vec; color: string }>()
defineEmits<{ grab: [event: PointerEvent] }>()

/** The drawn ring, in pitch units. Small enough not to hide the arrowhead. */
const RADIUS = 0.9

/** A finger is far bigger than the ring, so the hit target is larger. */
const HIT_RADIUS = 2.6
</script>

<template>
  <!--
    Transient: an editing affordance rather than part of the drill, so the
    export strips it rather than baking rings onto every arrow.

    Hollow, where the bend handle is solid: at a glance the coach can tell
    the end of a line from the middle of it.

    The listener sits on the enlarged transparent circle, which is painted
    last: see the paint-order note in PlayerCounter.vue.
  -->
  <g data-end-handle data-transient style="cursor: grab">
    <circle
      data-end
      :cx="at.x"
      :cy="at.y"
      :r="RADIUS"
      fill="#00000060"
      :stroke="color"
      stroke-width="0.4"
    />
    <circle
      :cx="at.x"
      :cy="at.y"
      :r="HIT_RADIUS"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
