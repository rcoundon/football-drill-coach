<script setup lang="ts">
import type { Vec } from '../types'

defineProps<{ pos: Vec }>()
defineEmits<{ grab: [event: PointerEvent] }>()
</script>

<template>
  <g data-ball :transform="`translate(${pos.x} ${pos.y})`" style="cursor: grab">
    <circle r="1.3" fill="#ffffff" stroke="#212121" stroke-width="0.25" />
    <circle
      r="3.2"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
