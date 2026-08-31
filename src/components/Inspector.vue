<script setup lang="ts">
import { computed } from 'vue'
import type { CounterColor, SelectionRef } from '../types'
import { COUNTER_COLORS } from '../geometry'
import { MAX_NOTES_LENGTH, useBoard } from '../composables/useBoard'
import { useViewport } from '../composables/useViewport'
import { SWATCHES } from './controls'

const props = withDefaults(
  defineProps<{
    /** What the coach is holding on the board, in the order it was gathered. */
    selection?: SelectionRef[]
    /** False while the panel is a strip down the edge of the pitch. */
    open?: boolean
  }>(),
  { selection: () => [], open: false },
)

const emit = defineEmits<{
  'update:open': [open: boolean]
  duplicate: []
  removeSelection: []
}>()

const board = useBoard()

const { isCompact, isPortrait } = useViewport()

/**
 * Whether the panel comes up from the bottom rather than in from the side.
 *
 * The same condition the stylesheet switches on, kept in step with it by
 * COMPACT_MAX_PX, because the arrows have to point the way the panel
 * actually moves — a chevron pointing left above a sheet that rises from
 * the bottom edge describes a panel this one is not.
 */
const asSheet = computed(() => isCompact.value && isPortrait.value)

/**
 * The panel has one job at a time, and which one is decided by the board
 * rather than by a tab: something held means the coach is working on that
 * thing, and nothing held means they are working on the drill.
 */
const held = computed(() => props.selection.length)

/** The one thing being inspected, or null while a group is held. */
const only = computed(() => (held.value === 1 ? props.selection[0] : null))

const counter = computed(() => {
  const ref = only.value
  if (!ref || ref.kind !== 'counter') return null
  return board.counterById(ref.id) ?? null
})

const label = computed(() => {
  const ref = only.value
  if (!ref || ref.kind !== 'label') return null
  return board.labelById(ref.id) ?? null
})

/**
 * What the panel is about, in the coach's words. `Copy` and `Delete` used to
 * sit in the toolbar with no stated subject, so a coach had to remember what
 * they were holding before pressing either.
 */
const subject = computed(() => {
  if (held.value === 0) return 'Drill notes'
  if (held.value > 1) return `${held.value} things`
  const kind = only.value?.kind
  if (kind === 'counter') return 'Player'
  if (kind === 'marker') return 'Cone'
  if (kind === 'label') return 'Text label'
  if (kind === 'ball') return 'Ball'
  return 'Drawing'
})

/** Which phase the note beneath the drill notes belongs to. */
const phaseNumber = computed(() => board.state.currentFrame + 1)
const phaseNote = computed(() => board.frameNote(board.state.currentFrame))

function setNotes(event: Event): void {
  board.setNotes((event.target as HTMLTextAreaElement).value)
}

function setPhaseNote(event: Event): void {
  board.setFrameNote(board.state.currentFrame, (event.target as HTMLTextAreaElement).value)
}

function setLabel(event: Event): void {
  const text = (event.target as HTMLInputElement).value
  const ref = only.value
  if (!ref) return
  if (ref.kind === 'counter') board.setCounterLabel(ref.id, text)
  else if (ref.kind === 'label') board.setLabelText(ref.id, text)
}

function recolour(color: CounterColor): void {
  const ref = only.value
  if (ref?.kind === 'counter') board.setCounterColor(ref.id, color)
}

/** Names what the buttons would act on, so a coach can see before pressing. */
const heldLabel = computed(() => (held.value === 1 ? subject.value.toLowerCase() : `${held.value} things`))
</script>

<template>
  <!--
    A strip when there is nothing to say, and a panel when there is. The
    notes column used to hold a quarter of the screen open permanently for a
    field that is usually empty, and the pitch is the only thing on this
    page that a coach is actually looking at.
  -->
  <aside v-if="!open" class="rail-strip">
    <button
      data-inspector-open
      class="tab"
      :title="held ? `Show the ${heldLabel}` : 'Show the drill notes'"
      :aria-expanded="false"
      @click="emit('update:open', true)"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="asSheet ? 'm18 15-6-6-6 6' : 'm15 18-6-6 6-6'" /></svg>
      <span class="tab-label">Notes</span>
    </button>
  </aside>

  <aside v-else data-inspector class="panel">
    <header class="panel-head">
      <span data-inspector-title class="eyebrow">{{ subject }}</span>
      <button
        data-inspector-close
        class="icon-button"
        title="Give the room back to the pitch"
        aria-label="Close the panel"
        :aria-expanded="true"
        @click="emit('update:open', false)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="asSheet ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'" /></svg>
      </button>
    </header>

    <!--
      Nothing held: the drill, and the phase the coach is standing on. Two
      fields rather than one because a coaching point that applies to the
      third phase alone was previously either lost or filed under the whole
      drill.
    -->
    <template v-if="held === 0">
      <label class="field">
        <span class="field-label">For the whole drill</span>
        <textarea
          id="drill-notes"
          data-notes
          class="notes-field"
          :maxlength="MAX_NOTES_LENGTH"
          placeholder="Setup, coaching points, progressions…"
          :value="board.state.notes"
          @input="setNotes"
        ></textarea>
      </label>

      <label class="field field--short">
        <span class="field-label">Phase {{ phaseNumber }} note</span>
        <textarea
          data-phase-note
          class="notes-field notes-field--short"
          :maxlength="MAX_NOTES_LENGTH"
          :placeholder="`What happens in phase ${phaseNumber}`"
          :value="phaseNote"
          :disabled="board.isDerived.value"
          :title="board.isDerived.value ? 'Nothing can change while the drill is playing or mid-move' : undefined"
          @input="setPhaseNote"
        ></textarea>
      </label>
    </template>

    <!-- Something held: the thing itself, and the two things you can do to it. -->
    <template v-else>
      <div v-if="counter" class="field">
        <span class="field-label">Colour</span>
        <div class="swatches">
          <button
            v-for="color in COUNTER_COLORS"
            :key="color"
            :data-set-color="color"
            class="swatch"
            :class="{ 'is-active': counter.color === color }"
            :style="{ background: SWATCHES[color] }"
            :disabled="board.isDerived.value"
            :title="`Make this player ${color}`"
            :aria-label="`Make this player ${color}`"
            @click="recolour(color)"
          />
        </div>
      </div>

      <label v-if="counter || label" class="field">
        <span class="field-label">Label</span>
        <input
          data-selection-label
          class="input"
          :maxlength="counter ? 4 : undefined"
          :placeholder="counter ? '9, GK, CB' : 'What it says'"
          :value="counter ? counter.label : label?.text"
          :disabled="board.isDerived.value"
          @change="setLabel"
        />
      </label>

      <p v-if="held > 1" class="hint">
        Everything held moves, copies and comes off together.
      </p>

      <!--
        Where Copy and Delete went. They always have a subject here, which
        they never did in a toolbar shared with the whole board.
      -->
      <div class="actions">
        <button
          data-duplicate
          class="chip"
          :title="`Copy the ${heldLabel} you are holding`"
          @click="emit('duplicate')"
        >Duplicate</button>
        <button
          data-delete-selection
          class="chip chip--danger"
          :title="`Take the ${heldLabel} off the board`"
          @click="emit('removeSelection')"
        >Remove</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
/*
 * Closed: a tab against the right edge, over the pitch rather than beside
 * it. The notes were a permanent column, then a permanent 40px strip, and
 * both took room from the one thing on this page anyone is looking at. On
 * a phone held upright there is no room to take.
 */
.rail-strip {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 22;
}

.tab {
  width: 40px;
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0;
  border: 1px solid var(--border); border-right: none;
  border-radius: var(--radius-control) 0 0 var(--radius-control);
  background: var(--surface-1); color: var(--ink-1); cursor: pointer;
  box-shadow: var(--shadow-card);
}
.tab:hover { background: var(--surface-2); }
/*
 * Read up the strip, so the word stays a word rather than a stack of
 * letters.
 */
.tab-label {
  writing-mode: vertical-rl;
  font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
}

/*
 * Open: a card floating over the pitch, not a column carved out of it.
 * Nothing behind it is dimmed and nothing behind it is blocked — a coach
 * can drag a player with the notes still up, which is the point of a panel
 * that follows what is held.
 */
.panel {
  position: absolute;
  top: 0.75rem; right: 0.75rem; bottom: 0.75rem;
  z-index: 24;
  width: min(300px, 34vw);
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.6rem;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-popover);
  color: var(--ink-1);
  min-height: 0;
  overflow-y: auto;
}

/*
 * Upright on a phone there is no width to float into, so it comes up from
 * the bottom edge instead, over the rail and the timeline, and no taller
 * than it has to be.
 */
@media (max-width: 1023px) and (orientation: portrait) {
  .panel {
    top: auto; left: 0; right: 0; bottom: 0;
    width: auto;
    max-height: min(60vh, 22rem);
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  }
}

.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.eyebrow {
  font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-2);
}

.icon-button {
  width: 28px; height: 28px; display: grid; place-items: center;
  border: none; background: transparent; color: inherit;
  border-radius: 0.4rem; cursor: pointer; padding: 0;
}
.icon-button:hover { background: #ffffff14; }

.field { display: flex; flex-direction: column; gap: 0.25rem; min-height: 0; flex: 1; }
.field--short { flex: none; }
.field-label { font-size: 0.7rem; opacity: 0.7; }

.notes-field {
  flex: 1; min-height: 6rem; resize: none; padding: 0.5rem;
  border-radius: 0.4rem; border: 1px solid var(--border); background: var(--field-bg);
  color: var(--ink-1); font: inherit; font-size: 0.85rem; line-height: 1.45;
}
.notes-field--short { min-height: 3.5rem; max-height: 6rem; flex: none; }
.notes-field:disabled { opacity: 0.5; }

.swatches { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.swatch {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 2px solid var(--ring); cursor: pointer; padding: 0;
}
.swatch.is-active { border-color: #ffffff; box-shadow: 0 0 0 2px #ff6b35; }
.swatch:disabled { opacity: 0.4; cursor: default; }

.input {
  padding: 0.4rem; border-radius: 0.35rem;
  border: 1px solid var(--ring); background: var(--surface-2); color: inherit; font: inherit;
}

.hint { margin: 0; font-size: 0.8rem; opacity: 0.7; }

.actions { display: flex; gap: 0.4rem; margin-top: auto; }
.chip {
  flex: 1;
  border: 1px solid var(--ring); background: var(--surface-2); color: inherit;
  border-radius: var(--radius-control); padding: 0.45rem 0.7rem; cursor: pointer; font-size: 0.85rem;
  transition: background var(--dur-fast) linear;
}
.chip:hover { background: var(--surface-3); }
.chip--danger { color: var(--error-ink); }

@media (pointer: coarse) {
  .chip { min-height: 44px; }
  .swatch { width: 44px; height: 44px; }
  .tab { min-height: 88px; }
  .icon-button { width: 44px; height: 44px; }
}
</style>
