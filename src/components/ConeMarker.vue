<script setup lang="ts">
import { computed } from 'vue'
import type { Marker } from '../types'

const props = defineProps<{ marker: Marker; rotated: boolean }>()
defineEmits<{ grab: [event: PointerEvent] }>()

/** Half the base width, in pitch units. Comfortably smaller than a player. */
const HALF_BASE = 1.3
const HEIGHT = 2.2

/** A finger is far bigger than the drawn cone, so the hit target is larger. */
const HIT_RADIUS = 3

/**
 * Drawn from the cone's own centre so it can be rotated upright
 * independently of the board, the same way counter labels are.
 */
const shape = `${-HALF_BASE},${HEIGHT / 2} ${HALF_BASE},${HEIGHT / 2} 0,${-HEIGHT / 2}`

const uprightTransform = computed(() => (props.rotated ? 'rotate(-90)' : ''))
</script>

<template>
  <g data-marker :transform="`translate(${marker.pos.x} ${marker.pos.y})`" style="cursor: grab">
    <g :transform="uprightTransform">
      <polygon :points="shape" fill="#fb8c00" stroke="#00000055" stroke-width="0.2" />
    </g>
    <circle :r="HIT_RADIUS" fill="transparent" @pointerdown="$emit('grab', $event as PointerEvent)" />
  </g>
</template>
