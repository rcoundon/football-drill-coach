<script lang="ts">
/**
 * The ball's transparent hit circle, in pitch units.
 *
 * The ball is painted after the counters, so wherever this circle overlaps a
 * counter it takes the press. While the ball is attached it therefore has to
 * stay clear of the counter holding it — BALL_OFFSET minus this radius must
 * be at least the counter's drawn radius — or pressing the middle of a
 * player in possession grabs the ball rather than the player.
 *
 * A free ball sits on open grass with nothing to steal a press from, so it
 * keeps the larger, easier target.
 *
 * Both are well above a fingertip's worth of board: 2.3 units is roughly a
 * 46px target on a tablet-sized pitch.
 */
export const BALL_HIT_RADIUS_ATTACHED = 2.3
export const BALL_HIT_RADIUS_FREE = 3.2
</script>

<script setup lang="ts">
import { computed } from 'vue'
import type { Vec } from '../types'

const props = defineProps<{ pos: Vec; attached: boolean }>()
defineEmits<{ grab: [event: PointerEvent] }>()

const hitRadius = computed(() =>
  props.attached ? BALL_HIT_RADIUS_ATTACHED : BALL_HIT_RADIUS_FREE,
)
</script>

<template>
  <g data-ball :transform="`translate(${pos.x} ${pos.y})`" style="cursor: grab">
    <circle r="1.3" fill="#ffffff" stroke="#212121" stroke-width="0.25" />
    <circle
      :r="hitRadius"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
