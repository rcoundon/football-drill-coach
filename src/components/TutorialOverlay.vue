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

/**
 * The anchor's immediate group — what the card has to clear, as opposed to
 * what the spotlight cuts a hole in.
 *
 * A control that hugs an edge nearly always sits in a block of its
 * neighbours: the rail's colours are a grid two columns wide, so a card that
 * steps past the red swatch alone still covers the blue one beside it. The
 * parent element is that block, and it costs no per-step knowledge and no
 * new markup to ask for it. It can be useless — the whole pitch, or a body
 * that jsdom gives no size — so it is only ever a first preference, and the
 * anchor itself is what the placement falls back to.
 */
const group = ref<DOMRect | null>(null)

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
    group.value = null
    return
  }
  const el = document.querySelector(selector)
  rect.value = el ? el.getBoundingClientRect() : null
  const parent = el?.parentElement?.getBoundingClientRect() ?? null
  group.value = parent && parent.width > 0 && parent.height > 0 ? parent : null
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
 * Which axis is tried first depends on where the anchor sits, because a
 * control that hugs an edge nearly always has its neighbours along that
 * edge with it. The rail's colour swatches sit one under the other down
 * the left, so a card dropped below the red one lands on the rest of the
 * colours the step is asking the coach to choose from; stepping sideways
 * clears the whole rail in one move. Out in the middle of the pitch there
 * is no such run of neighbours, and below reads better than beside.
 *
 * Measured rather than given per step, because the rail runs down the edge
 * on a desktop and along the bottom on a portrait phone, and the same step
 * has to work in both. Within an axis the roomier side wins, and a card
 * that fits nowhere goes back to the middle.
 */
const cardStyle = computed(() => {
  const r = rect.value
  const { w, h } = viewport.value
  const middle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  if (!r || r.width === 0 || r.height === 0) return middle

  const clampLeft = (left: number) => px(Math.min(Math.max(GAP, left), Math.max(GAP, w - CARD_W - GAP)))
  const clampTop = (top: number) => px(Math.min(Math.max(GAP, top), Math.max(GAP, h - CARD_H - GAP)))

  /** The first side of `box` the card fits beside, or nothing. */
  function beside(box: DOMRect): Record<string, string> | null {
    const below = () =>
      h - box.bottom >= CARD_H + GAP ? { top: px(box.bottom + GAP), left: clampLeft(box.left) } : null
    const above = () =>
      box.top >= CARD_H + GAP ? { top: px(box.top - CARD_H - GAP), left: clampLeft(box.left) } : null
    const right = () =>
      w - box.right >= CARD_W + GAP ? { top: clampTop(box.top), left: px(box.right + GAP) } : null
    const left = () =>
      box.left >= CARD_W + GAP ? { top: clampTop(box.top), left: px(box.left - CARD_W - GAP) } : null

    // Which edge the box is nearest, and so which way its neighbours run.
    const toSide = Math.min(box.left, w - box.right)
    const toEndwise = Math.min(box.top, h - box.bottom)

    const vertical = h - box.bottom >= box.top ? [below, above] : [above, below]
    const horizontal = w - box.right >= box.left ? [right, left] : [left, right]
    const order = toSide <= toEndwise ? [...horizontal, ...vertical] : [...vertical, ...horizontal]

    for (const place of order) {
      const at = place()
      if (at) return at
    }
    return null
  }

  // The group first, so the card clears the anchor's neighbours as well as
  // the anchor. A group too big to step around — the whole pitch behind a
  // player — leaves the anchor itself, which is the old behaviour.
  return (group.value && beside(group.value)) ?? beside(r) ?? middle
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
        One live region for the counter, the title and the body together,
        not three. The counter and body were each `aria-live="polite"` on
        their own, with a plain `h2` between them — so a step completing
        spoke the number and the instruction but never the title, and two
        regions updating in the same tick risk a reader dropping one of
        them. Wrapping every advance in a single update is what a step
        completing actually is: one change, announced once.
      -->
      <div data-tour-live aria-live="polite">
        <p data-tour-count class="count">
          Step {{ tutorial.stepIndex.value + 1 }} of {{ tutorial.steps.length }}
        </p>
        <h2>{{ tutorial.step.value.title }}</h2>
        <p class="body">{{ tutorial.step.value.body }}</p>
      </div>
      <div class="actions">
        <!--
          Same button, same action — but a coach on the last card has
          finished the tour rather than walked out of it, and the word is
          what tells them which of the two they are doing.
        -->
        <button data-tour-skip class="chip" @click="emit('end')">
          {{ isLast ? 'Finish' : 'Skip' }}
        </button>
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
