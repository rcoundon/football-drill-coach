<script setup lang="ts">
import { computed } from 'vue'
import type { Label } from '../types'

const props = defineProps<{ label: Label; rotated: boolean }>()
defineEmits<{ grab: [event: PointerEvent] }>()

/** Pitch units. Readable on a tablet without swamping the players. */
const FONT_SIZE = 2.6

/** Roughly half an average glyph's width at this size, in pitch units. */
const HALF_GLYPH = FONT_SIZE * 0.28

const halfWidth = computed(() => Math.max(props.label.text.length * HALF_GLYPH, 2))

/** Kept upright whichever way the board is turned, like counter numbers. */
const uprightTransform = computed(() => (props.rotated ? 'rotate(-90)' : ''))
</script>

<template>
  <g data-label :transform="`translate(${label.pos.x} ${label.pos.y})`" style="cursor: grab">
    <g :transform="uprightTransform">
      <!--
        A dark plate behind the text so it stays readable over pitch
        markings and grass alike. Every value is an SVG attribute, since
        PNG export serialises the SVG and loses anything set in CSS.
      -->
      <rect
        :x="-halfWidth - 0.6"
        :y="-FONT_SIZE * 0.72"
        :width="halfWidth * 2 + 1.2"
        :height="FONT_SIZE * 1.44"
        rx="0.6"
        fill="#00000099"
      />
      <text
        data-label-text
        text-anchor="middle"
        dominant-baseline="central"
        fill="#ffffff"
        :font-size="FONT_SIZE"
        font-family="system-ui, sans-serif"
        font-weight="600"
        style="user-select: none; pointer-events: none"
      >{{ label.text }}</text>
    </g>
    <rect
      :x="-halfWidth - 1"
      :y="-FONT_SIZE"
      :width="halfWidth * 2 + 2"
      :height="FONT_SIZE * 2"
      fill="transparent"
      :transform="uprightTransform"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
