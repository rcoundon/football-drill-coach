<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useTutorial } from '../composables/useTutorial'

/**
 * Whether one of App's own dialogs is standing over the tour right now —
 * the rename prompt the `label` step's own action opens, chiefly. Those
 * dialogs carry no `z-index` of their own, and this component's `.tour`
 * has the highest in the app, so left alone it would paint over the very
 * dialog its step just caused to open. Stepping out of the way entirely,
 * rather than only lowering `.tour`'s `z-index`, is what keeps this
 * component's own stacking free of every other dialog in the app — nothing
 * here has to know their order, only that one of them is up.
 */
const props = withDefaults(defineProps<{ blocked?: boolean }>(), { blocked: false })

const emit = defineEmits<{ end: []; openHelp: [] }>()

const tutorial = useTutorial()

/** Roughly what the card needs. Used only to choose a side, never to size it. */
const CARD_W = 320
const CARD_H = 190
const GAP = 12

const rect = ref<DOMRect | null>(null)

/*
 * The viewport, read fresh on every `measure()`. `getBoundingClientRect()`
 * returns a new object each call, so `rect` re-triggers `dims` and
 * `cardStyle` on its own — but a no-anchor step sets `rect` to `null` every
 * time, and `null` equals `null`, so nothing would tell those computeds a
 * resize had happened. A plain object here, replaced wholesale rather than
 * mutated, gives them the same fresh-reference trigger `rect` already has.
 */
const viewport = ref({ w: window.innerWidth, h: window.innerHeight })

const isLast = computed(() => tutorial.stepIndex.value === tutorial.steps.length - 1)

/**
 * Measure the current step's anchor.
 *
 * A step with no anchor, and a step whose anchor is not on screen at this
 * width, both land on `null` — the card still shows, centred, and the goal
 * still completes. The tour never depends on a control being visible.
 */
function measure(): void {
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
  const selector = tutorial.step.value?.anchor
  if (!selector) {
    rect.value = null
    return
  }
  const el = document.querySelector(selector)
  rect.value = el ? el.getBoundingClientRect() : null
}

let observer: ResizeObserver | null = null

function observeAnchor(): void {
  observer?.disconnect()
  observer = null
  const selector = tutorial.step.value?.anchor
  if (!selector || typeof ResizeObserver === 'undefined') return
  const el = document.querySelector(selector)
  if (!el) return
  observer = new ResizeObserver(measure)
  observer.observe(el)
}

/*
 * Measured once straight away and again after a tick. The first pass covers
 * every anchor here, since they are all part of the app's permanent chrome
 * rather than something the tour itself renders — and measuring before this
 * component's own first paint means that paint is already correct, with no
 * reactive update racing the caller's own `await nextTick()`. The second
 * pass is the belt-and-braces one, for a layout still settling under it.
 */
async function remeasure(): Promise<void> {
  measure()
  observeAnchor()
  await nextTick()
  measure()
  observeAnchor()
}

watch(() => tutorial.step.value?.id, remeasure, { immediate: true })

onMounted(() => {
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  void remeasure()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  observer?.disconnect()
})

type Box = { top: string; left: string; width: string; height: string }

function px(n: number): string {
  return `${Math.max(0, Math.round(n))}px`
}

/*
 * Four dimmed rectangles round the anchor rather than an SVG mask or a huge
 * box-shadow. It is the one approach where the hole genuinely has nothing
 * over it, so the coach's press reaches the real control underneath with no
 * pointer-events juggling — and pressing the real control is the whole point.
 */
const dims = computed<Box[]>(() => {
  const r = rect.value
  const { w, h } = viewport.value
  if (!r || r.width === 0 || r.height === 0) {
    return [{ top: '0px', left: '0px', width: px(w), height: px(h) }]
  }
  return [
    { top: '0px', left: '0px', width: px(w), height: px(r.top) },
    { top: px(r.bottom), left: '0px', width: px(w), height: px(h - r.bottom) },
    { top: px(r.top), left: '0px', width: px(r.left), height: px(r.height) },
    { top: px(r.top), left: px(r.right), width: px(w - r.right), height: px(r.height) },
  ]
})

/**
 * Put the card wherever there is room, measured against the viewport.
 *
 * Below, then above, then to one side, then centred. Chosen by measurement
 * rather than by a per-step opinion about direction, because the rail runs
 * down the edge on a desktop and along the bottom on a portrait phone, and
 * the same step has to work in both.
 */
const cardStyle = computed(() => {
  const r = rect.value
  const { w, h } = viewport.value
  if (!r || r.width === 0 || r.height === 0) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const clampLeft = (left: number) => px(Math.min(Math.max(GAP, left), Math.max(GAP, w - CARD_W - GAP)))
  const clampTop = (top: number) => px(Math.min(Math.max(GAP, top), Math.max(GAP, h - CARD_H - GAP)))

  if (h - r.bottom >= CARD_H + GAP) {
    return { top: px(r.bottom + GAP), left: clampLeft(r.left) }
  }
  if (r.top >= CARD_H + GAP) {
    return { top: px(r.top - CARD_H - GAP), left: clampLeft(r.left) }
  }
  if (w - r.right >= CARD_W + GAP) {
    return { top: clampTop(r.top), left: px(r.right + GAP) }
  }
  if (r.left >= CARD_W + GAP) {
    return { top: clampTop(r.top), left: px(r.left - CARD_W - GAP) }
  }
  return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
})
</script>

<template>
  <!--
    `data-transient` so an export taken mid-tour is clean, the same way the
    bend handles and endpoint rings are already treated.
  -->
  <div v-if="tutorial.active.value && tutorial.step.value && !props.blocked" class="tour" data-transient>
    <div v-for="(box, i) in dims" :key="i" data-tour-dim class="dim" :style="box"></div>

    <section
      data-tour-card
      class="card"
      role="dialog"
      :aria-label="tutorial.step.value.title"
      :style="cardStyle"
    >
      <!--
        Live, same as the body below: which step this is changes on every
        advance, and a screen reader only catches that if it is announced
        rather than merely redrawn.
      -->
      <p data-tour-count class="count" aria-live="polite">
        Step {{ tutorial.stepIndex.value + 1 }} of {{ tutorial.steps.length }}
      </p>
      <h2>{{ tutorial.step.value.title }}</h2>
      <!--
        Live, so a step completing is spoken rather than only seen. The
        instruction is in the words, so a coach who cannot see the spotlight
        can still follow the tour.
      -->
      <p class="body" aria-live="polite">{{ tutorial.step.value.body }}</p>
      <div class="actions">
        <button data-tour-skip class="chip" @click="emit('end')">Skip</button>
        <button
          data-tour-back
          class="chip"
          :disabled="tutorial.stepIndex.value === 0"
          @click="tutorial.back()"
        >
          Back
        </button>
        <button v-if="isLast" data-tour-help class="chip chip--go" @click="emit('openHelp')">
          Open Help
        </button>
        <button
          v-else-if="!tutorial.step.value.goal"
          data-tour-next
          class="chip chip--go"
          @click="tutorial.next()"
        >
          Next
        </button>
        <span v-else class="waiting">Your turn</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*
 * Above every panel: the tour is the outermost thing on screen while it
 * runs. Only the card takes the pointer — the dimmed boxes are decoration
 * and the hole between them is the real control.
 */
.tour {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

.dim {
  position: fixed;
  background: rgb(0 0 0 / 0.55);
}

.card {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 24px);
  pointer-events: auto;
  padding: 0.9rem 1rem 0.8rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--ink-1);
  box-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
}

.count {
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.card h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.body {
  margin: 0 0 0.8rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--ink-2);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.actions .chip:last-child {
  margin-left: auto;
}

.chip--go {
  background: var(--brand);
  border-color: var(--brand);
  color: #1F1410;
}

.waiting {
  margin-left: auto;
  font-size: 0.78rem;
  color: var(--ink-3);
}
</style>
