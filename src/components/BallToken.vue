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
    <!--
      A football rather than a plain disc: one dark pentagon with seams
      running towards the edge, stopping just short of the outline the way
      a real ball's seams meet its outer patches rather than its rim.
      A full net turns to mush at this size, and
      every value here is an SVG attribute so it survives PNG export, which
      serialises the SVG and loses anything styled in CSS.
    -->
    <circle r="1.3" fill="#ffffff" stroke="#3f3f3f" stroke-width="0.18" />
    <line x1="0.0" y1="-0.52" x2="0.0" y2="-1.17" stroke="#212121" stroke-width="0.14" stroke-linecap="round" />
    <line x1="0.495" y1="-0.161" x2="1.113" y2="-0.362" stroke="#212121" stroke-width="0.14" stroke-linecap="round" />
    <line x1="0.306" y1="0.421" x2="0.688" y2="0.946" stroke="#212121" stroke-width="0.14" stroke-linecap="round" />
    <line x1="-0.306" y1="0.421" x2="-0.688" y2="0.946" stroke="#212121" stroke-width="0.14" stroke-linecap="round" />
    <line x1="-0.495" y1="-0.161" x2="-1.113" y2="-0.362" stroke="#212121" stroke-width="0.14" stroke-linecap="round" />
    <polygon points="0.0,-0.52 0.495,-0.161 0.306,0.421 -0.306,0.421 -0.495,-0.161" fill="#212121" />
    <circle
      :r="hitRadius"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
