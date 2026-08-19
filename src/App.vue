<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { Pattern, ToolMode } from './types'
import Toolbar from './components/Toolbar.vue'
import PitchBoard from './components/PitchBoard.vue'
import PatternLibrary from './components/PatternLibrary.vue'
import { useBoard } from './composables/useBoard'
import { useStorage } from './composables/useStorage'
import { useExport } from './composables/useExport'

const board = useBoard()
const storage = useStorage()
const exporter = useExport()

const tool = ref<ToolMode>('select')
const drawColor = ref('#ffffff')
const boardRef = ref<InstanceType<typeof PitchBoard> | null>(null)
const notice = ref<string | null>(null)

const libraryOpen = ref(false)

/**
 * The pattern the board came from, and the single owner of that fact.
 *
 * PatternLibrary reports what the coach chose rather than loading it itself,
 * so these cannot drift out of step with what is on the board.
 */
const currentPatternId = ref<string | null>(null)
const currentName = ref('')

const savePromptOpen = ref(false)
const saveNameDraft = ref('')

/**
 * Which save the open prompt will perform.
 *
 * 'new' writes a pattern the board has never been saved as; 'fork' copies
 * the open pattern under a new name and leaves the original alone. Updating
 * the open pattern in place needs no prompt at all — it keeps its name — so
 * typing a new name can never silently rename and overwrite the source.
 */
const savePromptMode = ref<'new' | 'fork'>('new')

const savePromptTitle = computed(() =>
  savePromptMode.value === 'fork' ? 'Save a copy as' : 'Name this pattern',
)

/** Save: update the open pattern in place, or ask for a name if there is none. */
function openSavePrompt() {
  if (currentPatternId.value) {
    const saved = storage.savePattern(currentName.value, board.snapshot(), currentPatternId.value)
    // savePattern writes nothing when the library is unreadable, and a write
    // can fail on quota, so success is not something to claim on faith: the
    // error banner is the message in that case.
    if (!storage.lastWriteSucceeded.value) return
    currentName.value = saved.name
    notice.value = `Saved “${saved.name}”.`
    return
  }
  savePromptMode.value = 'new'
  saveNameDraft.value = currentName.value || 'New pattern'
  savePromptOpen.value = true
}

/** Save as…: fork the board into a new pattern under a new name. */
function openSaveAsPrompt() {
  savePromptMode.value = 'fork'
  saveNameDraft.value = currentName.value ? `${currentName.value} copy` : 'New pattern'
  savePromptOpen.value = true
}

function confirmSave() {
  const name = saveNameDraft.value.trim()
  if (!name) return
  // A fork deliberately passes no id, so savePattern mints a new one.
  const id = savePromptMode.value === 'fork' ? undefined : currentPatternId.value ?? undefined
  const saved = storage.savePattern(name, board.snapshot(), id)
  savePromptOpen.value = false
  // A pattern that was never written is not the pattern that is open.
  if (!storage.lastWriteSucceeded.value) return
  currentPatternId.value = saved.id
  currentName.value = saved.name
}

function onPatternLoaded(pattern: Pattern) {
  board.loadSnapshot(storage.patternToSnapshot(pattern))
  currentPatternId.value = pattern.id
  currentName.value = pattern.name
}

function onPatternRenamed(change: { id: string; name: string }) {
  if (change.id === currentPatternId.value) currentName.value = change.name
}

/**
 * The board keeps its contents, but it is no longer a saved pattern: Save
 * must ask for a name rather than write the deleted pattern back under its
 * old id.
 */
function onPatternDeleted(id: string) {
  if (id !== currentPatternId.value) return
  notice.value = `“${currentName.value}” was deleted. This board is no longer saved.`
  currentPatternId.value = null
  currentName.value = ''
}

/**
 * A reset board is not the pattern that was open any more, so the app must
 * stop treating it as one — otherwise the next Save silently overwrites
 * that pattern with an empty board.
 */
function onBoardReset() {
  currentPatternId.value = null
  currentName.value = ''
}

const renameCounterId = ref<string | null>(null)
const renameLabelDraft = ref('')
const renamePromptOpen = ref(false)

function openRenamePrompt(id: string) {
  const counter = board.counterById(id)
  if (!counter) return
  renameCounterId.value = id
  renameLabelDraft.value = counter.label
  renamePromptOpen.value = true
}

function confirmRenameLabel() {
  if (renameCounterId.value) board.setCounterLabel(renameCounterId.value, renameLabelDraft.value)
  renamePromptOpen.value = false
}

async function exportPng() {
  const svg = boardRef.value?.svgEl
  if (!svg) return
  try {
    const blob = await exporter.svgToPngBlob(svg)
    exporter.downloadBlob(blob, `${exporter.slugify(currentName.value || 'tactics-board')}.png`)
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The image could not be created.'
  }
}

function exportJson() {
  const patterns = storage.listPatterns()
  if (patterns.length === 0) {
    notice.value = 'There are no saved patterns to export.'
    return
  }
  exporter.downloadText(storage.exportPatternsJson(patterns), 'tactics-patterns.json')
}

async function importJson() {
  try {
    const text = await exporter.pickJsonFile()
    const added = storage.importPatterns(text)
    notice.value = `Imported ${added.length} pattern(s).`
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'That file could not be imported.'
  }
}

const saveNameInput = ref<HTMLInputElement | null>(null)
const renameLabelInput = ref<HTMLInputElement | null>(null)

/**
 * A dialog that opens without focus makes the coach click into the field
 * before typing, and on a tablet the keyboard never appears at all.
 */
async function focusWhenOpen(open: boolean, field: () => HTMLInputElement | null) {
  if (!open) return
  // The field is behind a v-if, so it does not exist until after this
  // render — read the ref after the tick, not before it.
  await nextTick()
  field()?.focus()
  field()?.select()
}

watch(savePromptOpen, (open) => focusWhenOpen(open, () => saveNameInput.value))
watch(renameCounterId, (id) => focusWhenOpen(id !== null, () => renameLabelInput.value))

/** True while anything modal is on screen. */
const isDialogOpen = computed(
  () => savePromptOpen.value || libraryOpen.value || renameCounterId.value !== null,
)

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

  /*
   * Shortcuts must not reach the board while a dialog is up. Checking the
   * focused element is not enough: with a dialog open and focus anywhere
   * else, typing a pattern name drives the tool shortcuts behind it —
   * "Cone grid" contains an r, so the board switches to the Run tool
   * while the coach is naming their drill.
   */
  if (isDialogOpen.value) return

  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) board.redo()
    else board.undo()
    return
  }

  if (modifier) return

  if (event.key.toLowerCase() === 'b') {
    board.toggleBallVisible()
    return
  }

  const byKey: Record<string, ToolMode> = { v: 'select', p: 'pen', r: 'arrow-run', s: 'arrow-pass', l: 'line', c: 'cone', e: 'erase' }
  const next = byKey[event.key.toLowerCase()]
  if (next) tool.value = next
}

onMounted(() => {
  // restoreSnapshot, not loadSnapshot: putting the draft back is not
  // something the coach did, so it must not become the one undo entry a
  // freshly opened app offers.
  const draft = storage.loadDraft()
  if (draft) board.restoreSnapshot(draft)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Autosave the working board, debounced, so a refresh does not lose work.
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => board.state,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => storage.saveDraft(board.snapshot()), 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="app">
    <Toolbar
      v-model:tool="tool"
      v-model:drawColor="drawColor"
      :pattern-name="currentName"
      @save="openSavePrompt"
      @saveAs="openSaveAsPrompt"
      @open="libraryOpen = true"
      @exportPng="exportPng"
      @exportJson="exportJson"
      @importJson="importJson"
      @reset="onBoardReset"
    />
    <div class="stage">
      <PitchBoard ref="boardRef" :tool="tool" :draw-color="drawColor" @rename="openRenamePrompt" />
    </div>

    <PatternLibrary
      :open="libraryOpen"
      @close="libraryOpen = false"
      @load="onPatternLoaded"
      @rename="onPatternRenamed"
      @delete="onPatternDeleted"
    />

    <div v-if="savePromptOpen" class="overlay" @click.self="savePromptOpen = false">
      <div class="prompt" role="dialog" :aria-label="savePromptTitle">
        <label for="pattern-name">{{ savePromptTitle }}</label>
        <input
          id="pattern-name"
          ref="saveNameInput"
          v-model="saveNameDraft"
          class="input"
          @keyup.enter="confirmSave"
        />
        <p v-if="savePromptMode === 'fork' && currentName" class="hint">
          “{{ currentName }}” stays as it is.
        </p>
        <div class="prompt-actions">
          <button data-confirm-save class="chip" @click="confirmSave">
            {{ savePromptMode === 'fork' ? 'Save copy' : 'Save' }}
          </button>
          <button class="chip" @click="savePromptOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="renamePromptOpen" class="overlay" @click.self="renamePromptOpen = false">
      <div class="prompt" role="dialog" aria-label="Rename player">
        <label for="counter-label">Player label</label>
        <input
          id="counter-label"
          ref="renameLabelInput"
          v-model="renameLabelDraft"
          class="input"
          maxlength="4"
          @keyup.enter="confirmRenameLabel"
        />
        <div class="prompt-actions">
          <button class="chip" @click="confirmRenameLabel">Save</button>
          <button class="chip" @click="renamePromptOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Both messages dismiss on click; an error the coach cannot clear is worse than a notice. -->
    <p v-if="notice" class="notice" role="status" @click="notice = null">{{ notice }}</p>
    <p
      v-if="storage.lastError.value"
      class="error"
      role="status"
      title="Dismiss"
      @click="storage.lastError.value = null"
    >{{ storage.lastError.value }}</p>
  </div>
</template>

<style>
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; background: #102010; }
</style>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.stage { flex: 1; min-height: 0; padding: 0.75rem; }
.error {
  margin: 0; padding: 0.6rem 0.9rem; background: #b71c1c; color: #fff; font-size: 0.85rem; cursor: pointer;
}
.hint { margin: 0; font-size: 0.8rem; opacity: 0.7; }
.notice { margin: 0; padding: 0.6rem 0.9rem; background: #1565c0; color: #fff; font-size: 0.85rem; cursor: pointer; }
.overlay { position: fixed; inset: 0; background: #000000aa; display: flex; align-items: center; justify-content: center; }
.prompt { background: #263238; color: #eceff1; padding: 1rem; border-radius: 0.6rem; display: grid; gap: 0.5rem; min-width: 18rem; }
.prompt-actions { display: flex; gap: 0.4rem; }
.input { padding: 0.4rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #37474f; color: inherit; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.35rem 0.7rem; cursor: pointer; }
</style>
