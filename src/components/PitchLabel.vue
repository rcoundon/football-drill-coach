<script setup lang="ts">
import { computed } from 'vue'
import type { LabelView } from '../animation'
import { labelLines } from './labelLines'

const props = defineProps<{ label: LabelView; rotated: boolean }>()
defineEmits<{ grab: [event: PointerEvent] }>()

/** Pitch units. Readable on a tablet without swamping the players. */
const FONT_SIZE = 2.6

/** Distance between one line's middle and the next, in pitch units. */
const LINE_HEIGHT = FONT_SIZE * 1.25

/** Roughly half an average glyph's width at this size, in pitch units. */
const HALF_GLYPH = FONT_SIZE * 0.28

const lines = computed(() => labelLines(props.label.text))

const halfWidth = computed(() =>
  Math.max(Math.max(...lines.value.map((line) => line.length)) * HALF_GLYPH, 2),
)

/** Centre to the top or bottom edge of the block of text. */
const halfHeight = computed(() => ((lines.value.length - 1) * LINE_HEIGHT) / 2 + FONT_SIZE * 0.72)

/** Each line's middle, with the block centred on the label's position. */
function lineY(index: number): number {
  return (index - (lines.value.length - 1) / 2) * LINE_HEIGHT
}

/** Kept upright whichever way the board is turned, like counter numbers. */
const uprightTransform = computed(() => (props.rotated ? 'rotate(-90)' : ''))
</script>

<template>
  <!-- Opacity as an attribute, not a style, so the PNG and GIF exports keep the fade. -->
  <g
    data-label
    :transform="`translate(${label.pos.x} ${label.pos.y})`"
    :opacity="label.opacity"
    style="cursor: grab"
  >
    <g :transform="uprightTransform">
      <!--
        A dark plate behind the text so it stays readable over pitch
        markings and grass alike. Every value is an SVG attribute, since
        PNG export serialises the SVG and loses anything set in CSS.
      -->
      <rect
        :x="-halfWidth - 0.6"
        :y="-halfHeight"
        :width="halfWidth * 2 + 1.2"
        :height="halfHeight * 2"
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
      ><tspan
        v-for="(line, index) in lines"
        :key="index"
        data-label-line
        x="0"
        :y="lineY(index)"
        dominant-baseline="central"
      >{{ line }}</tspan></text>
    </g>
    <rect
      :x="-halfWidth - 1"
      :y="-halfHeight - 0.3"
      :width="halfWidth * 2 + 2"
      :height="halfHeight * 2 + 0.6"
      fill="transparent"
      :transform="uprightTransform"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
