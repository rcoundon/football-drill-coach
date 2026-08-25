<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { Pattern, ToolMode, Vec } from './types'
import { gifSchedule } from './animation'
import Toolbar from './components/Toolbar.vue'
import ToolRail from './components/ToolRail.vue'
import PitchBoard from './components/PitchBoard.vue'
import PatternLibrary from './components/PatternLibrary.vue'
import HelpPanel from './components/HelpPanel.vue'
import FrameStrip from './components/FrameStrip.vue'
import { MAX_LABEL_LENGTH, MAX_NOTES_LENGTH, useBoard } from './composables/useBoard'
import { useStorage } from './composables/useStorage'
import { useExport } from './composables/useExport'
import { useViewport } from './composables/useViewport'

const board = useBoard()
const storage = useStorage()
const { isPortrait, isRail } = useViewport()
const exporter = useExport()

const tool = ref<ToolMode>('select')
const drawColor = ref('#ffffff')
const boardRef = ref<InstanceType<typeof PitchBoard> | null>(null)

/**
 * How many things the board is holding. Kept here rather than read back out
 * of the board so the toolbar can be driven by a plain prop, the way every
 * other control in it already is.
 */
const selectionSize = ref(0)
const notice = ref<string | null>(null)

const libraryOpen = ref(false)
const helpOpen = ref(false)

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
  savePromptMode.value === 'fork' ? 'Save a copy as' : 'Name this drill',
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
  saveNameDraft.value = currentName.value || 'New drill'
  savePromptOpen.value = true
}

/** Save as…: fork the board into a new pattern under a new name. */
function openSaveAsPrompt() {
  savePromptMode.value = 'fork'
  saveNameDraft.value = currentName.value ? `${currentName.value} copy` : 'New drill'
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

/**
 * The board reports where a label should go, or which one to edit; the text
 * itself is typed here, in the same small dialog the other prompts use.
 */
const labelDraft = ref('')
const labelTarget = ref<{ kind: 'new'; at: Vec } | { kind: 'edit'; id: string } | null>(null)
const labelInput = ref<HTMLInputElement | null>(null)

function promptNewLabel(at: Vec) {
  labelDraft.value = ''
  labelTarget.value = { kind: 'new', at }
}

function promptEditLabel(id: string) {
  labelDraft.value = board.labelById(id)?.text ?? ''
  labelTarget.value = { kind: 'edit', id }
}

function confirmLabel() {
  const target = labelTarget.value
  if (!target) return
  if (target.kind === 'new') board.addLabel(target.at, labelDraft.value)
  else board.setLabelText(target.id, labelDraft.value)
  labelTarget.value = null
}

watch(labelTarget, (target) => focusWhenOpen(target !== null, () => labelInput.value), {
  flush: 'post',
})

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
    // Only notes the coach can currently see go into the image: if they are
    // toggled off, they are off everywhere.
    const blob = await exporter.svgToPngBlob(
      svg,
      board.state.notesVisible ? board.state.notes : '',
    )
    exporter.downloadBlob(blob, `${exporter.slugify(currentName.value || 'tactics-board')}.png`)
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The image could not be created.'
  }
}

const exporting = ref(false)

/**
 * Export the drill as an animation.
 *
 * The playhead is driven by hand and restored in a `finally`, so a failure
 * halfway through leaves the board where the coach left it rather than
 * parked mid-move. `nextTick` between samples is what makes the SVG show
 * the moment being captured; without it every sample would be the same
 * picture.
 */
async function exportGif() {
  const svg = boardRef.value?.svgEl
  if (!svg || exporting.value) return

  const samples = gifSchedule(board.state.frames)
  const wasAt = board.playback.at
  exporting.value = true
  // Locks the board for the export's duration, on top of the reentrancy
  // guard above: without it, Play or a frame jump fired while sampling races
  // this function's own seek loop and corrupts the samples, even though the
  // GIF button itself is disabled — a keyboard shortcut reaches `play()`
  // directly, past any button's disabled attribute.
  board.beginExport()

  try {
    const blob = await exporter.boardToGifBlob(
      svg,
      samples,
      async (atMs) => {
        board.scrubTo(atMs)
        await nextTick()
      },
      board.state.notesVisible ? board.state.notes : '',
      800,
      (done, total) => {
        notice.value = `Building the animation… ${done} of ${total}`
      },
    )
    exporter.downloadBlob(blob, `${exporter.slugify(currentName.value || 'tactics-board')}.gif`)
    notice.value = 'Animation saved.'
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The animation could not be created.'
  } finally {
    exporting.value = false
    // Released before the playhead is put back: `endScrub` lands on a frame
    // through `goToFrame`, which the export lock itself refuses.
    board.endExport()
    board.scrubTo(wasAt)
    board.endScrub()
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
/**
 * The field is behind a v-if, so it does not exist when the state changes.
 * These watchers run with flush: 'post', which fires after the DOM has been
 * patched, so the element is there to focus by the time we look for it.
 */
function focusWhenOpen(open: boolean, field: () => HTMLInputElement | null) {
  if (!open) return
  field()?.focus()
  field()?.select()
}

watch(savePromptOpen, (open) => focusWhenOpen(open, () => saveNameInput.value), { flush: 'post' })
watch(renameCounterId, (id) => focusWhenOpen(id !== null, () => renameLabelInput.value), {
  flush: 'post',
})

/** True while anything modal is on screen. */
const isDialogOpen = computed(
  () =>
    savePromptOpen.value ||
    libraryOpen.value ||
    helpOpen.value ||
    renameCounterId.value !== null ||
    labelTarget.value !== null,
)

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
    return

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

  /*
   * Only swallowed when there is something to copy. With an empty board the
   * key belongs to the browser, and taking Cmd+D away from a coach trying to
   * bookmark their own tactics board would be a poor trade.
   */
  if (modifier && event.key.toLowerCase() === 'd' && selectionSize.value > 0) {
    event.preventDefault()
    boardRef.value?.duplicateSelected()
    return
  }

  if (modifier) return

  if (event.key === 'Escape') {
    boardRef.value?.clearSelection()
    return
  }

  /*
   * Delete rubs out the chosen drawing. Backspace does the same because a
   * laptop keyboard has no Delete to speak of — and neither can reach here
   * while a field has focus, which the guard at the top of this function
   * already ensures.
   */
  if (event.key === 'Delete' || event.key === 'Backspace') {
    boardRef.value?.deleteSelected()
    return
  }

  if (event.key === ' ') {
    /*
     * Space alone carries this exemption because Space alone needs it: a
     * focused BUTTON, A or SELECT already activates itself on Space, so
     * stealing the key here would both toggle playback AND suppress the
     * chip's own press (preventDefault silences the platform's default
     * action too). Escape, Delete, Backspace and the tool letters do none
     * of that on a focused button — there is nothing native to protect —
     * so they must NOT be given this same exemption. Do not move this
     * check into the shared guard above: doing so once already broke
     * Escape/Delete/tool-switching for a coach who had just clicked a chip,
     * which is most of the time a chip has focus.
     */
    if (
      target &&
      (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SELECT')
    )
      return
    // Space is the universal play/pause, but it is also a character typed
    // into a field — the shared guard above is what keeps a space in the
    // drill notes from starting the animation.
    event.preventDefault()
    if (board.playback.playing) board.pause()
    else board.play()
    return
  }

  if (event.key.toLowerCase() === 'b') {
    board.toggleBallsVisible()
    return
  }

  const byKey: Record<string, ToolMode> = { v: 'select', p: 'pen', r: 'arrow-run', s: 'arrow-pass', l: 'line', c: 'cone', t: 'text', e: 'erase' }
  const next = byKey[event.key.toLowerCase()]
  if (next) tool.value = next
}

onMounted(() => {
  // restoreSnapshot, not loadSnapshot: putting the draft back is not
  // something the coach did, so it must not become the one undo entry a
  // freshly opened app offers.
  const draft = storage.loadDraft()
  if (draft) {
    board.restoreSnapshot(draft)
  } else if (isPortrait.value) {
    /*
     * A landscape pitch on a portrait phone fills under a third of the
     * screen, and a coach who has never seen the Rotate button has no
     * reason to look for it. Only ever done for a genuinely fresh board:
     * rotation belongs to the saved drill, so a pattern deliberately saved
     * landscape must come back landscape whatever it is opened on.
     */
    board.restoreSnapshot({ ...board.snapshot(), pitch: { ...board.state.pitch, rotated: true } })
  }
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Autosave the working board, debounced, so a refresh does not lose work.
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => board.state,
  () => {
    // Playing moves the playhead, not the drill. Writing a draft several
    // times a second during a play-through risks restoring a half-tweened
    // board on the next start, and none of it is a change worth saving.
    if (board.isDerived.value) return
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
      :railed="isRail"
      :selection-size="selectionSize"
      :exporting="exporting"
      @duplicate="boardRef?.duplicateSelected()"
      @deleteSelection="boardRef?.deleteSelected()"
      @save="openSavePrompt"
      @saveAs="openSaveAsPrompt"
      @open="libraryOpen = true"
      @exportPng="exportPng"
      @exportGif="exportGif"
      @exportJson="exportJson"
      @importJson="importJson"
      @reset="onBoardReset"
      @help="helpOpen = true"
    />
    <div class="workspace">
      <ToolRail
        v-if="isRail"
        v-model:tool="tool"
        v-model:drawColor="drawColor"
      />

      <div class="stage">
        <PitchBoard
          ref="boardRef"
          :tool="tool"
          :draw-color="drawColor"
          @rename="openRenamePrompt"
          @add-label="promptNewLabel"
          @edit-label="promptEditLabel"
          @selection-size="selectionSize = $event"
        />
        <FrameStrip :exporting="exporting" />
      </div>

      <aside v-if="board.state.notesVisible" class="notes">
        <label class="notes-label" for="drill-notes">Drill notes</label>
        <textarea
          id="drill-notes"
          data-notes
          class="notes-field"
          :maxlength="MAX_NOTES_LENGTH"
          placeholder="Setup, coaching points, progressions…"
          :value="board.state.notes"
          @input="board.setNotes(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </aside>
    </div>

    <PatternLibrary
      :open="libraryOpen"
      @close="libraryOpen = false"
      @load="onPatternLoaded"
      @rename="onPatternRenamed"
      @delete="onPatternDeleted"
    />

    <HelpPanel :open="helpOpen" @close="helpOpen = false" />

    <div v-if="labelTarget" class="overlay" @click.self="labelTarget = null">
      <div class="prompt" role="dialog" aria-label="Label text">
        <label for="label-text">Label</label>
        <input
          id="label-text"
          ref="labelInput"
          v-model="labelDraft"
          data-label-input
          class="input"
          :maxlength="MAX_LABEL_LENGTH"
          @keyup.enter="confirmLabel"
        />
        <div class="prompt-actions">
          <button data-label-save class="chip" @click="confirmLabel">Save</button>
          <button data-label-cancel class="chip" @click="labelTarget = null">Cancel</button>
        </div>
      </div>
    </div>

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
.workspace { flex: 1; min-height: 0; display: flex; gap: 0.75rem; padding: 0.75rem; }
/*
 * A column, so the frame strip is always on screen and the board gives up the
 * room for it. The board used to take the whole height and push the strip off
 * the bottom of the page, which made the way into frames something a coach had
 * to scroll to find.
 */
.stage { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.stage > :first-child { flex: 1; min-height: 0; }

/*
 * Beside the board on a wide screen, beneath it on a narrow one — a coach
 * on a phone at the side of a pitch needs the board to stay the priority.
 */
.notes { display: flex; flex-direction: column; gap: 0.35rem; width: min(22rem, 32vw); }
.notes-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.65; color: #eceff1; }
.notes-field {
  flex: 1; min-height: 8rem; resize: none; padding: 0.6rem;
  border-radius: 0.4rem; border: 1px solid #ffffff26; background: #1b2429;
  color: #eceff1; font: inherit; font-size: 0.9rem; line-height: 1.45;
}
/*
 * Wherever the rail is in use, the notes go under the board rather than
 * beside it. Measured on a 1194px tablet: side by side, the rail and a
 * 352px notes column left the pitch 663x430; stacked, it gets 919x597.
 * The board is what a coach is manipulating, so it takes the room.
 */
@media (max-width: 80rem) {
  /*
   * Grid rather than a wrapping flex row: a wrapped line takes its content
   * height, which let the board grow past the bottom of the screen. The
   * explicit 1fr row keeps it inside the viewport.
   */
  .workspace {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .stage { min-height: 0; }
  .notes { grid-column: 1 / -1; width: auto; }
  .notes-field { min-height: 5rem; max-height: 9rem; }
}

/* No rail below this, so the board simply sits above the notes. */
@media (max-width: 48rem) {
  .workspace { grid-template-columns: minmax(0, 1fr); }
}
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
