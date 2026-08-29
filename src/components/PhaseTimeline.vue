<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DEFAULT_FRAME_MS, MAX_FRAME_MS, MIN_FRAME_MS } from '../animation'
import { useBoard } from '../composables/useBoard'
import BoardView from './BoardView.vue'

withDefaults(defineProps<{ /** True while a GIF export is sampling the board. */ exporting?: boolean }>(), {
  exporting: false,
})

const board = useBoard()

/** Why adding, deleting, reordering and retiming a phase refuse mid-move. */
const lockedTitle = 'Nothing can change while the drill is playing or mid-move'

/** Why Play, Rewind and the scrubber are locked — only true during an export. */
const exportingTitle = 'The drill is being exported as an animation'

/**
 * A drill that has never used frames looks exactly as it did before frames
 * existed: the heading, one phase, and the way to add another. The playback
 * half opens only once there is a sequence to play.
 */
const hasSequence = computed(() => board.state.frames.length > 1)

const current = computed(() => board.state.currentFrame)
const last = computed(() => board.state.frames.length - 1)

/**
 * Seconds, not milliseconds. A coach thinks in seconds, and a field showing
 * 1500 invites someone to type 2 and wonder why nothing moved.
 */
function secondsOf(index: number): string {
  const ms = board.state.frames[index]?.duration ?? DEFAULT_FRAME_MS
  return String(Math.round(ms) / 1000)
}

function setDuration(index: number, event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  // A cleared field, or anything that is not a number, is not "zero
  // seconds" — it is an edit in progress. `Number('')` is 0, which would
  // otherwise sail past `isFinite` and silently clamp the frame to
  // MIN_FRAME_MS. Leaving the duration alone is the only option that
  // cannot surprise a coach who is mid-keystroke.
  if (raw.trim() === '') return
  const seconds = Number(raw)
  if (!Number.isFinite(seconds)) return
  board.setFrameDuration(index, seconds * 1000)
}

function onScrub(event: Event): void {
  board.scrubTo(Number((event.target as HTMLInputElement).value))
}

function togglePlay(): void {
  if (board.playback.playing) board.pause()
  else board.play()
}

/**
 * The clock, as minutes and seconds. Rendered in tabular figures so the
 * digits do not shuffle sideways while the drill plays.
 */
function clockOf(ms: number): string {
  const whole = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const elapsed = computed(() => clockOf(board.playback.at))
const total = computed(() => clockOf(board.timeline.value.total))

/** How far through the drill the playhead is, as a percentage of the track. */
const played = computed(() => {
  const whole = board.timeline.value.total
  if (whole <= 0) return 0
  return (board.playback.at / whole) * 100
})

/**
 * Where each phase begins, along the track. Marked so that scrubbing relates
 * visibly to the phases beside it rather than being one undivided run.
 */
const boundaries = computed(() => {
  const whole = board.timeline.value.total
  if (whole <= 0) return []
  return board.state.frames
    .map((_, index) => (board.timeline.value.startOf(index) / whole) * 100)
    .filter((percent) => percent > 0 && percent < 100)
})

/**
 * Which phase card has its overflow menu open. One at a time, because two
 * open menus over a strip this small is never something a coach asked for.
 */
const openMenu = ref<number | null>(null)

function toggleMenu(index: number): void {
  openMenu.value = openMenu.value === index ? null : index
}

function choose(run: () => void): void {
  openMenu.value = null
  run()
}

const stripEl = ref<HTMLElement | null>(null)

function onDocumentPointerDown(event: PointerEvent): void {
  if (openMenu.value === null) return
  const target = event.target as Node | null
  if (target && stripEl.value?.contains(target)) return
  openMenu.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && openMenu.value !== null) openMenu.value = null
}

/**
 * Reordering by dragging a card.
 *
 * A press that goes nowhere is still a press — it selects the phase, the way
 * it always did. Only travel makes it a drag, and the move is committed once
 * on release rather than on every card crossed, so dragging a phase across
 * three others is one thing to undo rather than three.
 */
const DRAG_THRESHOLD_PX = 6

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

/** Set while a drag is finishing, so the click it produces selects nothing. */
let dragJustEnded = false

function cardIndexAt(clientX: number, clientY: number): number | null {
  const strip = stripEl.value
  if (!strip) return null
  const cards = Array.from(strip.querySelectorAll<HTMLElement>('[data-frame]'))
  for (const card of cards) {
    const rect = card.getBoundingClientRect()
    const inside =
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    if (!inside) continue
    const index = Number(card.dataset.frame)
    return Number.isNaN(index) ? null : index
  }
  return null
}

function startCardDrag(index: number, event: PointerEvent): void {
  if (event.button > 0 || board.isDerived.value || board.state.frames.length < 2) return

  const startX = event.clientX
  const startY = event.clientY
  let travelled = false

  function onMove(move: PointerEvent): void {
    if (!travelled) {
      const far =
        Math.abs(move.clientX - startX) > DRAG_THRESHOLD_PX ||
        Math.abs(move.clientY - startY) > DRAG_THRESHOLD_PX
      if (!far) return
      travelled = true
      dragIndex.value = index
      openMenu.value = null
    }
    overIndex.value = cardIndexAt(move.clientX, move.clientY)
  }

  function onUp(up: PointerEvent): void {
    const to = travelled ? cardIndexAt(up.clientX, up.clientY) : null
    stop()
    if (!travelled) return
    // A drag that ends anywhere but on another card is a drag the coach
    // thought better of, and puts the phase back where it was.
    if (to !== null && to !== index) board.moveFrame(index, to)
    dragJustEnded = true
  }

  /** A pointer taken away by the system reorders nothing. */
  function onCancel(): void {
    stop()
  }

  function stop(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    dragIndex.value = null
    overIndex.value = null
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}

function selectFrame(index: number): void {
  // The click a drag leaves behind would otherwise land on whichever card
  // the phase was dropped onto, moving the coach somewhere they did not ask
  // to go straight after reordering.
  if (dragJustEnded) {
    dragJustEnded = false
    return
  }
  board.goToFrame(index)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="stripEl" class="timeline" :class="{ 'is-open': hasSequence }">
    <!--
      The transport, kept apart from the phases themselves: one is where the
      drill is, the other is what it is made of.

      It stays live while the view is merely a blend — pausing mid-move must
      not lock the coach out of pausing. An export is different: it drives
      the playhead itself, and Play racing its own seek loop would corrupt
      the samples, so these three are gated on `exporting` specifically
      rather than on the general lock.
    -->
    <div v-if="hasSequence" class="playback">
      <button
        data-rewind
        class="transport-button"
        :disabled="exporting"
        :title="exporting ? exportingTitle : 'Back to the start'"
        aria-label="Back to the start"
        @click="board.rewind()"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 20-9-8 9-8z" /><path d="M5 19V5" /></svg>
      </button>

      <button
        data-play
        class="play"
        :disabled="exporting"
        :title="exporting ? exportingTitle : board.playback.playing ? 'Pause' : 'Play the drill'"
        :aria-label="board.playback.playing ? 'Pause' : 'Play the drill'"
        @click="togglePlay()"
      >
        <svg v-if="board.playback.playing" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
      </button>

      <span data-clock class="clock">{{ elapsed }} / {{ total }}</span>

      <div class="scrub-wrap">
        <!--
          The played portion, and a tick where each phase begins, painted
          under a transparent range input. The input stays a real range
          input: it is what a keyboard and a screen reader already know how
          to drive, and nothing drawn here is worth losing that for.
        -->
        <div class="scrub-track" aria-hidden="true">
          <div class="scrub-played" :style="{ width: `${played}%` }"></div>
          <span
            v-for="(percent, index) in boundaries"
            :key="index"
            class="scrub-tick"
            :style="{ left: `${percent}%` }"
          ></span>
        </div>
        <input
          data-scrub
          class="scrub"
          type="range"
          min="0"
          :max="board.timeline.value.total"
          step="10"
          :value="board.playback.at"
          :disabled="exporting"
          :title="exporting ? exportingTitle : undefined"
          aria-label="Scrub through the drill"
          @input="onScrub"
          @change="board.endScrub()"
        />
      </div>
    </div>

    <div class="phases">
      <div v-if="!hasSequence" class="phases-head">
        <!--
          The heading says what the region is FOR, not what the thing inside
          it is called. Naming the container — a frame, a moment — told a
          coach nothing about why they would press anything here.
        -->
        <span data-strip-label class="eyebrow">Build the drill</span>
        <!--
          Shown only while the drill is a single phase, which is exactly when
          the coach does not yet know what any of this does. Once they have
          built a sequence they have learnt it.
        -->
        <span v-if="!hasSequence" data-strip-hint class="hint">
          Show it phase by phase, then play it back.
        </span>
      </div>

      <div class="cards">
        <div
          v-for="(frame, index) in board.state.frames"
          :key="index"
          :data-frame="index"
          :class="[
            'card',
            {
              'is-active': index === current,
              'is-dragging': dragIndex === index,
              'is-target': dragIndex !== null && overIndex === index && dragIndex !== index,
            },
          ]"
        >
          <button
            :data-frame-select="index"
            class="card-face"
            :title="`Go to phase ${index + 1}`"
            :aria-label="`Go to phase ${index + 1}`"
            :aria-current="index === current"
            @pointerdown="startCardDrag(index, $event)"
            @click="selectFrame(index)"
          >
            <!--
              The phase itself, drawn small. A number alone said nothing
              about what was in a phase, so telling two apart meant visiting
              both.
            -->
            <BoardView
              class="mini"
              :frame="frame"
              :pitch="board.state.pitch"
              :labels-visible="false"
              :balls-visible="board.state.ballsVisible"
            />
          </button>

          <span class="badge badge--number">{{ index + 1 }}</span>

          <!--
            Hidden on the first phase: a duration is how long the move INTO a
            moment takes, and nothing moves into the start of a drill.
          -->
          <template v-if="index > 0">
            <label v-if="index === current" class="badge badge--duration">
              <span class="visually-hidden">Duration in seconds</span>
              <input
                data-frame-duration
                class="duration-field"
                type="number"
                :min="MIN_FRAME_MS / 1000"
                :max="MAX_FRAME_MS / 1000"
                step="0.1"
                :value="secondsOf(index)"
                :disabled="board.isDerived.value"
                :title="board.isDerived.value ? lockedTitle : 'How long the move into this phase takes'"
                @change="setDuration(index, $event)"
              />
              <span aria-hidden="true">s</span>
            </label>
            <span v-else class="badge badge--duration">{{ secondsOf(index) }}s</span>
          </template>

          <!--
            Permanently visible rather than revealed on hover: a finger has
            no hover, and this is the only way to delete or reorder a phase
            on the device the board is mostly used on.
          -->
          <button
            :data-frame-menu="index"
            class="overflow"
            aria-haspopup="menu"
            :aria-expanded="openMenu === index"
            :aria-label="`Phase ${index + 1} options`"
            :title="`Phase ${index + 1} options`"
            @click="toggleMenu(index)"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="0.5" /><circle cx="12" cy="12" r="0.5" /><circle cx="12" cy="19" r="0.5" /></svg>
          </button>

          <div v-show="openMenu === index" class="menu" role="menu">
            <button
              data-duplicate-frame
              class="menu-item"
              role="menuitem"
              :disabled="board.isDerived.value"
              :title="board.isDerived.value ? lockedTitle : undefined"
              @click="choose(() => board.duplicateFrame(index))"
            >Duplicate phase</button>
            <button
              data-frame-earlier
              class="menu-item"
              role="menuitem"
              :disabled="index === 0 || board.isDerived.value"
              :title="board.isDerived.value ? lockedTitle : undefined"
              @click="choose(() => board.moveFrame(index, index - 1))"
            >Move earlier</button>
            <button
              data-frame-later
              class="menu-item"
              role="menuitem"
              :disabled="index === last || board.isDerived.value"
              :title="board.isDerived.value ? lockedTitle : undefined"
              @click="choose(() => board.moveFrame(index, index + 1))"
            >Move later</button>
            <div class="menu-divider"></div>
            <button
              data-delete-frame
              class="menu-item menu-item--danger"
              role="menuitem"
              :disabled="!hasSequence || board.isDerived.value"
              :title="hasSequence ? (board.isDerived.value ? lockedTitle : undefined) : 'A drill has to be something'"
              @click="choose(() => board.deleteFrame(index))"
            >Delete phase</button>
          </div>
        </div>

        <!--
          The last card in the strip rather than a green button beside it: it
          is one more phase, in the place the next phase would go, and the
          only green thing on the board was never the thing a coach most
          needed to see.
        -->
        <button
          data-add-frame
          class="card card--add"
          :disabled="board.isDerived.value"
          :title="
            board.isDerived.value
              ? lockedTitle
              : 'New phases start from a copy of the one you are on'
          "
          @click="board.addFrame()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span class="add-label">Add phase</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0.6rem;
  /*
   * The strip sits on the dark page whether or not it has opened, so it
   * carries the light text colour either way.
   */
  color: var(--ink-1);
}
.timeline.is-open {
  background: var(--surface-1);
  border-radius: 0.4rem;
}

.playback { display: flex; align-items: center; gap: 0.5rem; flex: 1 1 20rem; min-width: 0; }

.transport-button {
  width: 36px; height: 36px; display: grid; place-items: center;
  border: 1px solid var(--border); background: var(--surface-2); color: inherit;
  border-radius: var(--radius-control); cursor: pointer; padding: 0;
  transition: background var(--dur-fast) linear, transform var(--dur-fast) var(--ease-pop);
}
.transport-button:hover:not(:disabled) { background: var(--surface-3); transform: translateY(-1px); }
.transport-button:disabled { opacity: 0.4; cursor: default; }

/*
 * The one round control on the board, and the only place the brand gradient
 * is spent: playing the drill back is what the phases are for.
 */
.play {
  width: 48px; height: 48px; flex: none;
  display: grid; place-items: center;
  border: none; border-radius: 50%; cursor: pointer; padding: 0;
  background: var(--brand-gradient);
  color: #ffffff;
  box-shadow: 0 8px 18px -8px rgba(238, 10, 36, 0.45), inset 0 1px 0 #ffffff40;
}
.play:disabled { opacity: 0.4; cursor: default; box-shadow: none; }

/*
 * Tabular figures, so the clock does not shuffle sideways as it counts —
 * a width that changes every second reads as the layout twitching.
 */
.clock {
  font-family: ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  white-space: nowrap;
}

.scrub-wrap { position: relative; flex: 1 1 6rem; min-width: 5rem; height: 24px; }

.scrub-track {
  position: absolute; inset: 50% 0 auto; transform: translateY(-50%);
  height: 4px; border-radius: 2px; background: #ffffff24;
  pointer-events: none; overflow: hidden;
}
.scrub-played { height: 100%; background: var(--brand-gradient); }
/* Where each phase begins, so scrubbing relates visibly to the cards. */
.scrub-tick { position: absolute; top: 0; width: 2px; height: 100%; background: #14100ecc; }

/*
 * The native input, made invisible but left in place: it is what a keyboard
 * and a screen reader already know how to drive.
 */
.scrub {
  position: absolute; inset: 0; width: 100%; height: 100%;
  margin: 0; background: transparent; -webkit-appearance: none; appearance: none;
}
.scrub::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: #ffffff; border: none; cursor: pointer;
  box-shadow: 0 2px 6px #00000080;
}
.scrub::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: #ffffff; border: none; cursor: pointer;
}
.scrub:disabled { cursor: default; }

.phases { display: flex; align-items: center; gap: 0.6rem; flex: 2 1 20rem; min-width: 0; }
.phases-head { display: flex; flex-direction: column; gap: 0.15rem; flex: none; max-width: 11rem; }
.eyebrow {
  font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-2);
}
/* Quiet enough to read as explanation rather than as another control. */
.hint { font-size: 0.75rem; opacity: 0.7; line-height: 1.3; }

.cards {
  display: flex; gap: 0.4rem; align-items: stretch;
  flex: 1; min-width: 0;
  overflow-x: auto; overflow-y: hidden;
  padding: 0.15rem;
}

.card {
  position: relative;
  flex: none;
  width: 96px; height: 72px;
  border-radius: var(--radius-card);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 0;
  overflow: visible;
}
.card.is-active { border: 2px solid #ff6b35; box-shadow: 0 6px 16px -8px rgba(238, 10, 36, 0.55); }
/* The card being carried, and the card it would land on. */
.card.is-dragging { opacity: 0.5; }
.card.is-target { outline: 2px dashed #ff6b35; outline-offset: 2px; }

.card-face {
  display: block; width: 100%; height: 100%;
  border: none; background: transparent; padding: 0; cursor: pointer;
  border-radius: inherit; overflow: hidden;
  /* Without this a drag on a tablet scrolls the strip instead of the card. */
  touch-action: none;
}
.mini { pointer-events: none; }

.badge {
  position: absolute;
  display: flex; align-items: center; gap: 0.1rem;
  padding: 0.05rem 0.25rem;
  border-radius: 0.3rem;
  background: #14100ecc;
  color: #ffffff;
  font-family: ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 0.65rem;
  pointer-events: none;
}
.badge--number { top: 3px; left: 3px; }
.badge--duration { bottom: 3px; right: 3px; gap: 0; pointer-events: auto; }

.duration-field {
  width: 1.7rem; text-align: right;
  border: none; background: transparent; color: inherit;
  font: inherit; padding: 0;
  -moz-appearance: textfield;
}
.duration-field::-webkit-outer-spin-button,
.duration-field::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.duration-field:focus { outline: 1px solid #ff6b35; border-radius: 0.2rem; }
.duration-field:disabled { opacity: 0.5; }

.overflow {
  position: absolute; top: 2px; right: 2px;
  width: 22px; height: 22px; display: grid; place-items: center;
  border: none; border-radius: 0.35rem; padding: 0;
  background: #14100ecc; color: #ffffff; cursor: pointer;
  opacity: 0;
  transition: opacity 160ms linear;
}
.card:hover .overflow,
.overflow:focus-visible,
.overflow[aria-expanded='true'] { opacity: 1; }

.menu {
  position: absolute; bottom: calc(100% + 0.3rem); right: 0; z-index: 30;
  min-width: 10rem;
  display: flex; flex-direction: column;
  padding: 0.25rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sheet);
  box-shadow: 0 16px 40px -12px var(--shadow-ink);
}
.menu-item {
  text-align: left;
  border: none; background: transparent; color: inherit;
  padding: 0.4rem 0.5rem; border-radius: 0.3rem;
  cursor: pointer; font: inherit; font-size: 0.8rem; white-space: nowrap;
}
.menu-item:hover:not(:disabled) { background: var(--surface-4); }
.menu-item:disabled { opacity: 0.4; cursor: default; }
.menu-item--danger { color: var(--error-ink); }
.menu-divider { height: 1px; margin: 0.2rem; background: var(--border); }

/*
 * Dashed, and the same footprint as a phase, because that is what pressing
 * it produces. It used to be the only green control on the board, which made
 * the thing a coach reaches for least the loudest thing on screen.
 */
.card--add {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.15rem;
  border: 2px dashed #ffffff40;
  background: transparent;
  color: var(--ink-1);
  cursor: pointer;
}
.card--add:hover:not(:disabled) { border-color: #ff6b35; color: #ffffff; }
.card--add:disabled { opacity: 0.4; cursor: default; }
.add-label { font-size: 0.7rem; font-weight: 600; }

.visually-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the side
 * of a pitch. Nothing here may depend on hover to be reachable.
 */
@media (pointer: coarse) {
  .overflow { opacity: 1; width: 28px; height: 28px; }
  .transport-button { width: 44px; height: 44px; }
  .menu-item { min-height: 44px; }
  .scrub-wrap { height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .overflow { transition: none; }
}
</style>
