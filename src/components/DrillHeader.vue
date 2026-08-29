<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBoard } from '../composables/useBoard'

const props = withDefaults(
  defineProps<{
    /** The drill currently open, or '' when the board has never been saved. */
    patternName?: string
    /**
     * Where the board stands against the library: 'unsaved' for a board that
     * has never been saved, 'dirty' between a change and the autosave that
     * follows it, 'saved' once the library holds what is on screen.
     */
    saveStatus?: 'unsaved' | 'dirty' | 'saved'
    /** When the last autosave landed, for the "Saved 2m ago" line. */
    lastSavedAt?: number | null
    /** True while a GIF export is sampling the board. */
    exporting?: boolean
  }>(),
  { patternName: '', saveStatus: 'unsaved', lastSavedAt: null, exporting: false },
)

const emit = defineEmits<{
  rename: [name: string]
  save: []
  saveAs: []
  duplicateDrill: []
  deleteDrill: []
  clearPlayers: []
  clearDrawings: []
  resetBoard: []
  open: []
  exportPng: []
  exportGif: []
  exportJson: []
  importJson: []
  help: []
}>()

const board = useBoard()

/**
 * True while a drawing sits on some frame, current or not.
 *
 * `board.state.drawings` is the current frame's own array, and Clear
 * drawings reaches every frame — a coach parked on a drawing-free moment
 * must still be able to press it when an earlier or later one has something
 * to rub out.
 */
const hasAnyDrawings = computed(() => board.state.frames.some((frame) => frame.drawings.length > 0))

/** Why Undo and Redo refuse mid-move. */
const lockedTitle = 'Nothing can change while the drill is playing or mid-move'

/**
 * One menu at a time. Two open menus overlapping is never something a coach
 * asked for, and it is the one state that makes an outside click ambiguous.
 */
const openMenu = ref<'drill' | 'share' | null>(null)

function toggle(menu: 'drill' | 'share'): void {
  openMenu.value = openMenu.value === menu ? null : menu
}

/** Every menu item does its thing and gets out of the way. */
function choose(run: () => void): void {
  openMenu.value = null
  run()
}

const headerEl = ref<HTMLElement | null>(null)

function onDocumentPointerDown(event: PointerEvent): void {
  if (!openMenu.value) return
  const target = event.target as Node | null
  if (target && headerEl.value?.contains(target)) return
  openMenu.value = null
}

/**
 * Escape closes the menu here rather than in App's global handler: the app
 * only knows about dialogs, and a menu that has to be dismissed by clicking
 * somewhere harmless is a menu that eventually gets dismissed by clicking
 * something harmful.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && openMenu.value) openMenu.value = null
}

/**
 * "2m ago" has to keep counting on its own — nothing else on the board
 * changes while a coach stands and thinks, so without this the header would
 * still be claiming the save happened just now ten minutes later.
 */
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onKeydown)
  clock = setInterval(() => (now.value = Date.now()), 30_000)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onKeydown)
  clearInterval(clock)
})

const savedAgo = computed(() => {
  if (props.lastSavedAt === null) return 'Saved'
  const minutes = Math.floor((now.value - props.lastSavedAt) / 60_000)
  if (minutes < 1) return 'Saved just now'
  if (minutes < 60) return `Saved ${minutes}m ago`
  return `Saved ${Math.floor(minutes / 60)}h ago`
})

/**
 * The library write is a synchronous localStorage call, so there is no
 * "Saving…" moment to report honestly — the three states a coach can
 * actually be in are never saved, changed since the last save, and saved.
 */
const statusLabel = computed(() => {
  if (props.saveStatus === 'unsaved') return 'Not saved yet'
  if (props.saveStatus === 'dirty') return 'Unsaved changes'
  return savedAgo.value
})

/**
 * The name being typed. Held locally so a keystroke is not a round trip
 * through the library, and pushed back out on blur or Enter.
 */
const nameDraft = ref(props.patternName)
watch(
  () => props.patternName,
  (name) => {
    nameDraft.value = name
  },
)

const nameField = ref<HTMLInputElement | null>(null)

/**
 * A drill with no name at all cannot be told apart in the library, so an
 * emptied field puts the old name back rather than saving the blank.
 */
function commitName(): void {
  const name = nameDraft.value.trim()
  if (!name) {
    nameDraft.value = props.patternName
    return
  }
  if (name === props.patternName) return
  emit('rename', name)
}
</script>

<template>
  <!--
    Everything done once per drill — naming it, saving it, sending it
    somewhere — gathered off the working surface. What is left below is only
    the things used while actually drawing.
  -->
  <header ref="headerEl" class="header">
    <img class="mark" src="/favicon.svg" alt="" width="24" height="24" />

    <input
      ref="nameField"
      data-current-pattern
      class="name"
      :value="nameDraft"
      placeholder="Untitled drill"
      aria-label="Drill name"
      maxlength="80"
      @input="nameDraft = ($event.target as HTMLInputElement).value"
      @change="commitName"
      @blur="commitName"
      @keyup.enter="nameField?.blur()"
    />

    <div class="menu-wrap">
      <button
        data-drill-menu
        class="icon-button"
        aria-haspopup="menu"
        :aria-expanded="openMenu === 'drill'"
        aria-label="Drill menu"
        title="Open, save and file this drill"
        @click="toggle('drill')"
      >
        <svg class="glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <div v-show="openMenu === 'drill'" class="menu" role="menu">
        <button data-open class="menu-item" role="menuitem" @click="choose(() => emit('open'))">Open…</button>
        <button data-save class="menu-item" role="menuitem" @click="choose(() => emit('save'))">Save now</button>
        <button data-save-as class="menu-item" role="menuitem" @click="choose(() => emit('saveAs'))">Save as…</button>
        <button
          data-duplicate-drill
          class="menu-item"
          role="menuitem"
          :disabled="!patternName"
          title="File a copy of this drill under its own name"
          @click="choose(() => emit('duplicateDrill'))"
        >Duplicate</button>
        <button data-import-json class="menu-item" role="menuitem" @click="choose(() => emit('importJson'))">Import…</button>
        <!--
          Everything below the divider takes something away. They are here
          rather than beside the routine controls because one mis-tap next to
          Undo was all it took to lose a board — and each of them either asks
          first or leaves a way back.
        -->
        <div class="menu-divider"></div>
        <button
          data-clear-players
          class="menu-item menu-item--danger"
          role="menuitem"
          :disabled="board.state.counters.length === 0 || board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : 'Take every player off, leaving the drawings'"
          @click="choose(() => emit('clearPlayers'))"
        >Clear players</button>
        <button
          data-clear-drawings
          class="menu-item menu-item--danger"
          role="menuitem"
          :disabled="!hasAnyDrawings || board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : 'Rub out every drawing, leaving the players'"
          @click="choose(() => emit('clearDrawings'))"
        >Clear drawings</button>
        <button
          data-reset
          class="menu-item menu-item--danger"
          role="menuitem"
          :disabled="board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : 'Start a fresh board, keeping the pitch you are on'"
          @click="choose(() => emit('resetBoard'))"
        >Reset the board…</button>
        <button
          data-delete-drill
          class="menu-item menu-item--danger"
          role="menuitem"
          :disabled="!patternName"
          @click="choose(() => emit('deleteDrill'))"
        >Delete drill</button>
      </div>
    </div>

    <span data-save-status class="status">{{ statusLabel }}</span>

    <div class="spacer"></div>

    <button
      data-undo
      class="icon-button"
      :disabled="!board.canUndo.value || board.isDerived.value"
      :title="board.isDerived.value ? lockedTitle : 'Undo'"
      aria-label="Undo"
      @click="board.undo()"
    >
      <svg class="glyph" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
    </button>
    <button
      data-redo
      class="icon-button"
      :disabled="!board.canRedo.value || board.isDerived.value"
      :title="board.isDerived.value ? lockedTitle : 'Redo'"
      aria-label="Redo"
      @click="board.redo()"
    >
      <svg class="glyph" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
    </button>

    <div class="divider"></div>

    <div class="menu-wrap">
      <button
        data-share-menu
        class="text-button"
        aria-haspopup="menu"
        :aria-expanded="openMenu === 'share'"
        title="Take this drill out of the app"
        @click="toggle('share')"
      >
        Share
        <svg class="glyph" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <div v-show="openMenu === 'share'" class="menu menu--right" role="menu">
        <button data-export-png class="menu-item" role="menuitem" @click="choose(() => emit('exportPng'))">Export PNG</button>
        <button
          v-if="board.state.frames.length > 1"
          data-export-gif
          class="menu-item"
          role="menuitem"
          :disabled="exporting"
          :title="exporting ? 'Already building an animation' : 'Save the drill as an animation'"
          @click="choose(() => emit('exportGif'))"
        >Export GIF</button>
        <button data-export-json class="menu-item" role="menuitem" @click="choose(() => emit('exportJson'))">Export JSON</button>
      </div>
    </div>

    <!--
      Beside Share rather than behind a menu: a coach who does not know what
      a control does needs the explanation to be at least as reachable as
      the control itself.
    -->
    <button
      data-help
      class="icon-button"
      title="What everything on this board does"
      aria-label="Help"
      @click="emit('help')"
    >
      <svg class="glyph" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
    </button>
  </header>
</template>

<style scoped>
.header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 56px;
  padding: 0 0.8rem;
  background: var(--surface-1);
  color: var(--ink-1);
  border-bottom: 1px solid var(--border);
}

.mark { flex: none; display: block; }

/*
 * A field that does not look like one until it is being used. The name is
 * something a coach reads far more often than they change, so it reads as
 * the title it is, and the border only appears where it is being typed.
 */
.name {
  min-width: 6rem;
  max-width: 18rem;
  flex: 0 1 auto;
  padding: 0.25rem 0.4rem;
  border: 2px solid transparent;
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  text-overflow: ellipsis;
}
.name::placeholder { color: var(--ink-3); font-weight: 500; font-style: italic; }
.name:hover { border-color: var(--border); }
.name:focus { outline: none; border-color: #ff6b35; background: var(--field-bg); }

.status { font-size: 0.8rem; color: var(--ink-2); white-space: nowrap; }

.spacer { flex: 1; }

.divider { width: 1px; align-self: stretch; margin: 0.6rem 0.15rem; background: var(--border); }

.icon-button {
  flex: none;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border: none; background: transparent; color: inherit;
  border-radius: var(--radius-control); cursor: pointer; padding: 0;
  transition: background var(--dur-fast) linear;
}
.icon-button:hover { background: #ffffff14; }
.icon-button:disabled { opacity: 0.4; cursor: default; background: transparent; }

.text-button {
  display: flex; align-items: center; gap: 0.25rem;
  min-height: 40px; padding: 0 0.7rem;
  border: 1px solid #ffffff40; background: var(--surface-2); color: inherit;
  border-radius: 0.4rem; cursor: pointer; font-size: 0.85rem;
}
.text-button:hover { background: var(--surface-3); }

.glyph { display: block; }

.menu-wrap { position: relative; flex: none; }

.menu {
  position: absolute; top: calc(100% + 0.35rem); left: 0; z-index: 20;
  min-width: 12rem;
  display: flex; flex-direction: column;
  padding: 0.3rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sheet);
  box-shadow: 0 16px 40px -12px var(--shadow-ink);
}
/* Anchored to the right edge, because Share sits near it. */
.menu--right { left: auto; right: 0; }

.menu-item {
  text-align: left;
  border: none; background: transparent; color: inherit;
  padding: 0.5rem 0.6rem; border-radius: 0.35rem;
  cursor: pointer; font: inherit; font-size: 0.85rem; white-space: nowrap;
}
.menu-item:hover { background: var(--surface-4); }
.menu-item:disabled { opacity: 0.4; cursor: default; background: transparent; }
.menu-item--danger { color: var(--error-ink); }

.menu-divider { height: 1px; margin: 0.3rem 0.2rem; background: var(--border); }

@media (pointer: coarse) {
  .menu-item { min-height: 44px; }
  .icon-button { width: 44px; height: 44px; }
  .text-button { min-height: 44px; }
}
</style>
