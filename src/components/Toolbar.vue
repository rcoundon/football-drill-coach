<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CounterColor, ToolMode } from '../types'
import { COUNTER_COLORS } from '../geometry'
import { useBoard } from '../composables/useBoard'
import { useViewport } from '../composables/useViewport'
import { DRAW_COLORS, DRAW_COLOR_NAMES, PITCHES, SWATCHES, TOOLS } from './controls'

const props = withDefaults(
  defineProps<{
    tool: ToolMode
    drawColor: string
    /** The drill currently open, or '' when the board has never been saved. */
    patternName?: string
    /**
     * True when a ToolRail is showing the tools and player colours, so this
     * bar must not repeat them.
     */
    railed?: boolean
    /**
     * How many things the coach is holding on the board. A tablet has no Cmd
     * key and no Delete key, so buttons are the only way to copy or remove a
     * gathered group there.
     */
    selectionSize?: number
    /** True while a GIF export is sampling the board. */
    exporting?: boolean
  }>(),
  { patternName: '', railed: false, selectionSize: 0, exporting: false },
)

const emit = defineEmits<{
  'update:tool': [tool: ToolMode]
  'update:drawColor': [color: string]
  save: []
  saveAs: []
  open: []
  exportPng: []
  exportGif: []
  exportJson: []
  importJson: []
  reset: []
  duplicate: []
  deleteSelection: []
  help: []
}>()

const board = useBoard()

/**
 * A new player arrives where the board decides, which is rarely where the
 * coach wants them, so the next thing they do is drag them. Switching to
 * Move saves a trip to the tool row for a step that follows nearly every
 * time — and unlike Cone, a colour swatch is not a tool the coach chose to
 * stay in, so there is nothing to switch back to.
 *
 * The rail does the same thing. Both are covered by their own tests, so the
 * two layouts cannot drift apart on this.
 */
function addPlayer(color: CounterColor): void {
  board.addCounter(color)
  if (props.tool !== 'select') emit('update:tool', 'select')
}

const { isNarrow } = useViewport()
const menuOpen = ref(false)

/** Why Undo, Redo, Clear players, Clear drawings and Reset refuse mid-move. */
const lockedTitle = 'Nothing can change while the drill is playing or mid-move'

/**
 * True while a drawing sits on some frame, current or not.
 *
 * `board.state.drawings` is the current frame's own array, and Clear
 * drawings reaches every frame — a coach parked on a drawing-free moment
 * must still be able to press it when an earlier or later one has something
 * to rub out.
 */
const hasAnyDrawings = computed(() => board.state.frames.some((frame) => frame.drawings.length > 0))

/** True while any ball is attached to someone on some phase, current or not. */
const hasAttachedBall = computed(() =>
  board.state.frames.some((frame) => frame.balls.some((b) => b.attachedTo !== null)),
)

/**
 * Nothing to clear: no players, no drawings anywhere in the drill, and the
 * ball never moved. Counters, markers and labels are drill-wide — the same
 * set on every frame — so the current frame's own arrays already answer for
 * all of them; only drawings and the ball's possession are per-frame.
 */
const isBoardEmpty = computed(
  () =>
    board.state.counters.length === 0 &&
    board.state.markers.length === 0 &&
    board.state.labels.length === 0 &&
    board.state.notes === '' &&
    !hasAnyDrawings.value &&
    !hasAttachedBall.value,
)

function resetBoard() {
  // Reset refuses while the view is derived, same as every other mutator —
  // but unlike them it is reached through this wrapper rather than straight
  // from a template binding, so the wrapper has to know that too. Without
  // this, board.resetBoard() no-ops but 'reset' still fires, and the app
  // forgets the pattern that was open even though nothing on the board
  // changed — the next Save then writes a duplicate under a new id.
  if (board.isDerived.value) return
  board.resetBoard()
  // The board is no longer the pattern that was open, so the app must stop
  // treating a later Save as an update to it.
  emit('reset')
}

/** Says which of the two saves the button is about to perform. */
const saveTitle = computed(() =>
  props.patternName ? `Update “${props.patternName}”` : 'Save as a new drill',
)

/** Names what the button would act on, so a coach can see before pressing. */
const heldLabel = computed(() =>
  props.selectionSize === 1 ? '1 thing' : `${props.selectionSize} things`,
)

</script>

<template>
  <div class="toolbar">
    <div v-if="!railed" class="group">
      <span class="group-label">Players</span>
      <button
        v-for="color in COUNTER_COLORS"
        :key="color"
        :data-add-counter="color"
        class="swatch"
        :style="{ background: SWATCHES[color] }"
        :disabled="board.isDerived.value"
        :title="
          board.isDerived.value
            ? 'A player appearing mid-drill is never what anyone meant'
            : `Add a ${color} player`
        "
        :aria-label="`Add a ${color} player`"
        @click="addPlayer(color)"
      />
    </div>

    <div v-if="!railed" class="group">
      <span class="group-label">Tool</span>
      <button
        v-for="t in TOOLS"
        :key="t.id"
        :data-tool="t.id"
        :class="['chip', { 'is-active': tool === t.id }]"
        @click="emit('update:tool', t.id)"
      >{{ t.label }}</button>
      <button
        v-for="c in DRAW_COLORS"
        :key="c"
        class="swatch swatch--sm"
        :class="{ 'is-active': drawColor === c }"
        :style="{ background: c }"
        :title="`Draw in ${DRAW_COLOR_NAMES[c] ?? c}`"
        :aria-label="`Draw in ${DRAW_COLOR_NAMES[c] ?? c}`"
        @click="emit('update:drawColor', c)"
      />
    </div>

    <div class="group">
      <button
        data-undo
        class="chip"
        :disabled="!board.canUndo.value || board.isDerived.value"
        :title="board.isDerived.value ? lockedTitle : undefined"
        @click="board.undo()"
      >Undo</button>
      <button
        data-redo
        class="chip"
        :disabled="!board.canRedo.value || board.isDerived.value"
        :title="board.isDerived.value ? lockedTitle : undefined"
        @click="board.redo()"
      >Redo</button>
      <!--
        Beside Undo, which is the one group never folded behind the More
        menu. A tablet has no Cmd+D and no Delete key, so on the device this
        board is mostly used on these buttons are the only way in.
      -->
      <button
        data-duplicate
        class="chip"
        :disabled="selectionSize === 0"
        :title="`Copy the ${heldLabel} you are holding`"
        @click="emit('duplicate')"
      >Copy</button>
      <button
        data-delete-selection
        class="chip"
        :disabled="selectionSize === 0"
        :title="`Remove the ${heldLabel} you are holding`"
        @click="emit('deleteSelection')"
      >Delete</button>
      <!--
        Also beside Undo rather than behind ☰ More: a coach who does not know
        what a control does needs the explanation to be at least as reachable
        as the control itself.
      -->
      <button
        data-help
        class="chip"
        title="What everything on this board does"
        @click="emit('help')"
      >Help</button>
    </div>

    <button
      v-if="isNarrow && !railed"
      data-more
      :class="['chip', 'more', { 'is-active': menuOpen }]"
      :aria-expanded="menuOpen"
      title="Pitch, saving and everything else"
      @click="menuOpen = !menuOpen"
    >☰ More</button>

    <!--
      Everything used once per drill rather than constantly. On a narrow
      screen it lives behind the More button so the controls above can stay
      big enough to hit with a finger; on a wide one it is simply part of
      the toolbar.
    -->
    <div
      v-if="!isNarrow || railed || menuOpen"
      :class="['secondary', { 'as-menu': isNarrow && !railed }]"
      @click="menuOpen = false"
    >
    <div class="group">
      <span class="group-label">Pitch</span>
      <button
        v-for="p in PITCHES"
        :key="p.id"
        :data-pitch="p.id"
        :class="['chip', { 'is-active': board.state.pitch.type === p.id }]"
        @click="board.setPitchType(p.id)"
      >{{ p.label }}</button>
      <button data-rotate class="chip" @click="board.toggleRotated()">Rotate</button>
    </div>

    <div class="group">
      <button
        data-clear-players
        class="chip"
        :disabled="board.state.counters.length === 0 || board.isDerived.value"
        :title="board.isDerived.value ? lockedTitle : 'Take every player off, leaving the drawings'"
        @click="board.clearCounters()"
      >Clear players</button>
      <button
        data-clear-drawings
        class="chip"
        :disabled="!hasAnyDrawings || board.isDerived.value"
        :title="board.isDerived.value ? lockedTitle : 'Rub out every drawing, leaving the players'"
        @click="board.clearDrawings()"
      >Clear drawings</button>
      <button
        data-toggle-labels
        :class="['chip', { 'is-active': board.state.labelsVisible }]"
        :title="board.state.labelsVisible ? 'Hide the pitch labels' : 'Show the pitch labels'"
        @click="board.toggleLabelsVisible()"
      >Labels</button>
      <button
        data-toggle-notes
        :class="['chip', { 'is-active': board.state.notesVisible }]"
        :title="board.state.notesVisible ? 'Hide the drill notes' : 'Show the drill notes'"
        @click="board.toggleNotesVisible()"
      >Notes</button>
      <button
        data-toggle-ball
        :class="['chip', { 'is-active': board.state.ballsVisible }]"
        :title="board.state.ballsVisible ? 'Take the balls off the pitch' : 'Put the balls back on the pitch'"
        @click="board.toggleBallsVisible()"
      >Ball</button>
      <button
        data-reset
        class="chip"
        :disabled="isBoardEmpty || board.isDerived.value"
        :title="board.isDerived.value ? lockedTitle : 'Start a fresh board, keeping the pitch you are on'"
        @click="resetBoard()"
      >Reset</button>
    </div>

    <div class="group">
      <span class="group-label">Drill</span>
      <span data-current-pattern class="current" :class="{ 'is-unsaved': !patternName }">
        {{ patternName || 'Unsaved' }}
      </span>
      <button data-save class="chip" :title="saveTitle" @click="emit('save')">Save</button>
      <button
        data-save-as
        class="chip"
        title="Save a copy under a new name"
        @click="emit('saveAs')"
      >Save as…</button>
      <button data-open class="chip" @click="emit('open')">Open</button>
      <button data-export-png class="chip" @click="emit('exportPng')">PNG</button>
      <button
        v-if="board.state.frames.length > 1"
        data-export-gif
        class="chip"
        :disabled="exporting"
        :title="exporting ? 'Already building an animation' : 'Save the drill as an animation'"
        @click="emit('exportGif')"
      >GIF</button>
      <button data-export-json class="chip" @click="emit('exportJson')">Export</button>
      <button data-import-json class="chip" @click="emit('importJson')">Import</button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.6rem 0.8rem;
  background: #263238;
  color: #eceff1;
  align-items: center;
}
/*
 * Wrapping, not overflowing. Without this a group is a single unbreakable
 * row: on a narrow screen the tools ran off the right edge, leaving Text
 * and Erase unreachable with no scrollbar to find them.
 */
.group { display: flex; flex-wrap: wrap; min-width: 0; gap: 0.35rem; align-items: center; }
.group-label { font-size: 0.7rem; text-transform: uppercase; opacity: 0.65; margin-right: 0.2rem; }
.swatch {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 2px solid #ffffff40; cursor: pointer; padding: 0;
}
.swatch--sm { width: 1.4rem; height: 1.4rem; }

.more { font-weight: 600; }

.secondary { display: contents; }

/*
 * Everything that is not a tool, gathered into a panel under the More
 * button. Scrolls rather than growing, so a long list can never push the
 * pitch off the screen.
 */
.secondary.as-menu {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  width: 100%;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #ffffff26;
  max-height: 50vh;
  overflow-y: auto;
}
.secondary.as-menu .group { flex-wrap: wrap; }

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the
 * side of a pitch. 44px is the smallest reliably hittable target, so on a
 * touch screen every control grows to it — even though that means fewer
 * fit per row.
 */
@media (pointer: coarse) {
  .chip { min-height: 44px; padding-inline: 0.85rem; }
  .swatch { width: 44px; height: 44px; }
  .swatch--sm { width: 36px; height: 36px; }
}
.swatch.is-active, .chip.is-active { border-color: #ffffff; }
.chip {
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
  border-radius: 0.4rem; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem;
}
.current { font-size: 0.85rem; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.current.is-unsaved { opacity: 0.6; font-style: italic; }
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.is-active { background: #546e7a; }
</style>
