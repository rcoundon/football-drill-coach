<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MAX_LABEL_LENGTH } from '../composables/useBoard'
import { LABEL_FONT_SIZE, LABEL_GLYPH_EM, LABEL_LINE_CHARS, labelLines } from './labelLines'

/**
 * A label typed straight onto the pitch, where it will sit, rather than into
 * a dialog that hides the pitch it is about.
 *
 * HTML laid over the board rather than a field inside the SVG: an SVG field
 * would be typed at the label's own size, a few pixels, and iOS zooms the
 * whole page into any field smaller than 16px. So it is typed at 16px and
 * shrunk to the label's size on screen, which iOS leaves alone.
 */
const props = defineProps<{
  modelValue: string
  /** The label's middle, in pixels from the board's top-left corner. */
  x: number
  y: number
  /** Pixels per pitch unit on screen. */
  scale: number
  /** The board, to measure how wide it sets a label's text. */
  board?: SVGSVGElement | null
}>()

const emit = defineEmits<{
  'update:modelValue': [text: string]
  /** Enter, or the coach letting go of the field. */
  done: []
  /** The Cancel button: what Escape does, for a screen with no keyboard. */
  cancel: []
}>()

const TYPED_PX = 16

const field = ref<HTMLTextAreaElement | null>(null)

const shrink = computed(() => (LABEL_FONT_SIZE * props.scale) / TYPED_PX)

/** The shape the pitch will draw, so what is typed is the shape it lands as. */
const lines = computed(() => labelLines(props.modelValue))
const rows = computed(() => Math.max(1, lines.value.length))

const FONT = `600 ${16}px system-ui, sans-serif`
const SAMPLE = 'Winger holds width until the full back'
const PLACEHOLDER = 'Type here'

/**
 * Extra space per letter, in pixels at 16px, so the field sets text as wide
 * as the board draws it.
 *
 * Measured, not assumed: the board lays its few-pixel label text out wider
 * than the same font at 16px — about a tenth wider on a Mac — and by how
 * much depends on the platform's font. Without this the field fitted a word
 * more per line than the label it became.
 */
const tracking = ref(0)
let context: CanvasRenderingContext2D | null = null

function measureTracking(): void {
  context = document.createElement('canvas').getContext?.('2d') ?? null
  const board = props.board
  if (!context || !board) return
  context.font = FONT
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  probe.setAttribute('font-size', String(LABEL_FONT_SIZE))
  probe.setAttribute('font-weight', '600')
  probe.setAttribute('font-family', 'system-ui, sans-serif')
  probe.setAttribute('visibility', 'hidden')
  probe.textContent = SAMPLE
  board.appendChild(probe)
  const drawn = typeof probe.getComputedTextLength === 'function' ? probe.getComputedTextLength() : 0
  probe.remove()
  if (drawn <= 0) return
  const boardPx = (drawn / LABEL_FONT_SIZE) * TYPED_PX
  tracking.value = (boardPx - context.measureText(SAMPLE).width) / SAMPLE.length
}

/**
 * As wide as the longest line the pitch will draw, so the field breaks its
 * lines where the label will. Estimated from character counts where nothing
 * can be measured.
 */
const width = computed(() => {
  // Read first, so the width is worked out again once mounting has measured.
  const extra = tracking.value
  const ctx = context
  const shown = props.modelValue === '' ? [PLACEHOLDER] : lines.value
  if (!ctx) {
    const cols = Math.min(LABEL_LINE_CHARS, Math.max(8, ...shown.map((line) => line.length + 1)))
    return `${cols * LABEL_GLYPH_EM}em`
  }
  const widest = Math.max(...shown.map((line) => ctx.measureText(line).width + extra * line.length))
  // A pixel of slack, and a letter's room for the caret at the end of a line.
  return `${Math.ceil(widest) + 1 + TYPED_PX * 0.3}px`
})

/** The field's height on screen, to set Cancel just beneath it. Matches the CSS below. */
const LINE_PX = 20
const PAD_PX = 0.15 * TYPED_PX
const below = computed(() => ((rows.value * LINE_PX + 2 * PAD_PX) * shrink.value) / 2 + 8)

/**
 * On the press rather than the click: the press is what takes focus from
 * the field, and the field losing focus places the label. Preventing it
 * keeps the field focused until the editor is gone.
 */
function onCancel(event: PointerEvent): void {
  event.preventDefault()
  emit('cancel')
}

/** Enter places it; Shift+Enter is a new line; Enter that ends an IME word is neither. */
function onEnter(event: KeyboardEvent): void {
  if (event.isComposing) return
  event.preventDefault()
  emit('done')
}

onMounted(() => {
  measureTracking()
  field.value?.focus()
  field.value?.select()
})
</script>

<template>
  <!-- One element to recognise the editor by: a press inside it is not a press on the board. -->
  <div data-label-editor class="layer">
  <textarea
    ref="field"
    data-label-input
    class="label-editor"
    aria-label="Label text"
    placeholder="Type here"
    wrap="soft"
    :value="modelValue"
    :rows="rows"
    :maxlength="MAX_LABEL_LENGTH"
    :style="{
      left: `${x}px`,
      width,
      letterSpacing: `${tracking}px`,
      top: `${y}px`,
      transform: `translate(-50%, -50%) scale(${shrink})`,
    }"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    @keydown.enter.exact="onEnter"
    @blur="emit('done')"
  ></textarea>
  <button
    type="button"
    data-label-cancel
    class="cancel"
    aria-label="Cancel this label"
    title="Cancel (Escape)"
    :style="{ left: `${x}px`, top: `${y + below}px` }"
    @pointerdown="onCancel"
    @keydown.enter.prevent="emit('cancel')"
    @keydown.space.prevent="emit('cancel')"
  >Cancel</button>
  </div>
</template>

<style scoped>
.layer { display: contents; }

.cancel {
  position: absolute;
  z-index: 26;
  transform: translateX(-50%);
  padding: 0.3rem 0.8rem;
  border: 1px solid #ffffff40;
  border-radius: var(--radius-control);
  background: #000000cc;
  color: #ffffff;
  font: 600 0.8rem system-ui, sans-serif;
  cursor: pointer;
}
@media (pointer: coarse) {
  .cancel { min-height: 44px; min-width: 88px; }
}

/* The label's own look — white on a dark plate — so it reads as the label, not a form. */
.label-editor {
  position: absolute;
  z-index: 26;
  transform-origin: center;
  box-sizing: content-box;
  margin: 0;
  padding: 0.15em 0.35em;
  border: none;
  border-radius: 0.35em;
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  background: #000000cc;
  color: #ffffff;
  font: 600 16px/1.25 system-ui, sans-serif;
  text-align: center;
  resize: none;
  overflow: hidden;
}
.label-editor::placeholder { color: #ffffff80; }
</style>
