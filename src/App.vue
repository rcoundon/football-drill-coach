<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { Pattern, SelectionRef, ToolMode, Vec } from './types'
import { gifSchedule } from './animation'
import { PITCH_H, PITCH_W } from './geometry'
import ActionToast from './components/ActionToast.vue'
import DrillHeader from './components/DrillHeader.vue'
import ToolRail from './components/ToolRail.vue'
import PitchBoard from './components/PitchBoard.vue'
import PitchEmptyState from './components/PitchEmptyState.vue'
import PlacementGhost from './components/PlacementGhost.vue'
import PatternLibrary from './components/PatternLibrary.vue'
import HelpPanel from './components/HelpPanel.vue'
import Inspector from './components/Inspector.vue'
import TagInput from './components/TagInput.vue'
import PhaseTimeline from './components/PhaseTimeline.vue'
import { MAX_LABEL_LENGTH, useBoard } from './composables/useBoard'
import { useStorage } from './composables/useStorage'
import { useExport } from './composables/useExport'
import { useViewport } from './composables/useViewport'

const board = useBoard()
const storage = useStorage()
const { isPortrait, isCompact } = useViewport()

/**
 * Which way the rail lies.
 *
 * By whichever dimension is scarce, not by width alone. A phone held
 * upright has width to spare nowhere and height to spare everywhere, so
 * the rail lies along the bottom; the same phone turned on its side has
 * 800px of width and barely 300 of height once the header is off, and a
 * rail lying down there took the pitch away entirely.
 */
const railLiesDown = computed(() => isCompact.value && isPortrait.value)
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

/**
 * What the coach is holding, which is what the inspector is about.
 *
 * Held here rather than read back out of the board for the same reason the
 * count is: the panel is driven by plain props, the way every other
 * component in this app already is.
 */
const selection = ref<SelectionRef[]>([])

/**
 * Whether the panel beside the pitch is open.
 *
 * Closed by default, and stored with the drill the way it always was — a
 * coach who wants the notes up while they work says so once, and gets them
 * back next time they open that drill.
 */
/**
 * Open because something is held, rather than because the coach asked.
 *
 * Kept out of the board deliberately. Picking a player up is not an edit to
 * the drill: routing it through `toggleNotesVisible` put an entry on the
 * undo stack, marked the drill dirty and set the autosave going, all for a
 * panel sliding open.
 */
const heldOpen = ref(false)

const inspectorOpen = computed({
  get: () => board.state.notesVisible || heldOpen.value,
  set: (open: boolean) => {
    // Asking for it either way settles it: a panel the coach closes while
    // still holding something stays closed.
    heldOpen.value = false
    if (board.state.notesVisible !== open) board.toggleNotesVisible()
  },
})

/**
 * Anything held populates the panel, which is no use behind a closed one.
 * Opening it is what makes Duplicate and Remove reachable at all on a
 * tablet, where there is no Cmd+D and no Delete key.
 */
function onSelectionChanged(held: SelectionRef[]): void {
  selection.value = held
  heldOpen.value = held.length > 0 && !board.state.notesVisible
}

/**
 * Whether the pitch has ever had anything on it this session.
 *
 * The prompt telling a coach how to place their first player goes for good
 * the moment one lands — including on a drill loaded from the library, which
 * arrives with its players already on. An instruction that comes back every
 * time the board is cleared is one the coach has already read.
 */
const everPlaced = ref(false)
watch(
  () => board.state.counters.length + board.state.markers.length + board.state.labels.length,
  (count) => {
    if (count > 0) everPlaced.value = true
  },
  { immediate: true },
)

const showEmptyState = computed(() => !everPlaced.value)

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
 * What the header says about the library. 'unsaved' is a board that has
 * never been saved, 'dirty' the gap between a change and the autosave that
 * follows it, 'saved' once the library holds what is on screen.
 */
const saveStatus = ref<'unsaved' | 'dirty' | 'saved'>('unsaved')
const lastSavedAt = ref<number | null>(null)

/** Note that the open drill and the library now agree. */
function markSaved(): void {
  saveStatus.value = 'saved'
  lastSavedAt.value = Date.now()
}

/**
 * Write the open drill back to the library.
 *
 * A drill that has never been saved has nowhere to go, so it stays a draft
 * until the coach names it — autosave can update a drill in place, but it
 * cannot decide what a new one is called.
 */
function autosavePattern(): void {
  const id = currentPatternId.value
  if (!id || board.isDerived.value) return
  const saved = storage.savePattern(currentName.value, board.snapshot(), id)
  if (!storage.lastWriteSucceeded.value) return
  currentName.value = saved.name
  markSaved()
}

let autosaveTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Debounced, because a drag is hundreds of changes and the library is a
 * single localStorage key. A second of quiet is the coach having stopped.
 */
function scheduleAutosave(): void {
  if (!currentPatternId.value) return
  saveStatus.value = 'dirty'
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(autosavePattern, 1000)
}

/**
 * The name is edited in the header itself, so there is no rename dialog to
 * confirm: typing a new one is the change, and the autosave that follows
 * files it.
 */
function onHeaderRename(name: string): void {
  currentName.value = name
  if (currentPatternId.value) scheduleAutosave()
}

/**
 * Duplicate: file a copy under its own name and leave the original where it
 * was. Unlike Save as… this asks nothing — the name is derived and can be
 * edited in the header straight afterwards, which is faster than a dialog
 * for the thing a coach does when adapting a saved drill for today.
 */
function duplicateDrill(): void {
  const from = currentPatternId.value
  if (!from) return
  const saved = storage.savePattern(`${currentName.value} copy`, board.snapshot(), undefined, from)
  if (!storage.lastWriteSucceeded.value) return
  currentPatternId.value = saved.id
  currentName.value = saved.name
  markSaved()
  notice.value = `Working on “${saved.name}”. The original is untouched.`
}

/**
 * Deleting the open drill throws work away that no undo on the board can
 * bring back, so it is the one header action that asks first.
 */
const deleteDrillPromptOpen = ref(false)

/**
 * What was just taken off the board, and the offer to put it back.
 *
 * Preferred over asking first: a confirmation costs a press every time to
 * protect against the once it was a mistake. The undo entry is the board's
 * own, so pressing Undo here and pressing Undo in the header do the same
 * thing.
 */
const toast = ref<string | null>(null)

function clearPlayers(): void {
  const count = board.state.counters.length
  if (count === 0) return
  board.clearCounters()
  toast.value = `Cleared ${count} ${count === 1 ? 'player' : 'players'}.`
}

function clearDrawings(): void {
  const count = board.state.frames.reduce((total, frame) => total + frame.drawings.length, 0)
  if (count === 0) return
  board.clearDrawings()
  toast.value = `Cleared ${count} ${count === 1 ? 'drawing' : 'drawings'}.`
}

function undoFromToast(): void {
  board.undo()
  toast.value = null
}

/**
 * Reset is the one that asks first.
 *
 * It is not one thing taken off the board but all of them at once, and it
 * also detaches the board from the drill it was saved as — more than a
 * six-second window is worth resting on.
 */
const resetPromptOpen = ref(false)

function confirmReset(): void {
  resetPromptOpen.value = false
  // Reset refuses while the view is derived, same as every other mutator.
  // Without this check the board no-ops but the app still forgets the open
  // pattern, and the next save writes a duplicate under a new id.
  if (board.isDerived.value) return
  board.resetBoard()
  onBoardReset()
}

function confirmDeleteDrill(): void {
  const id = currentPatternId.value
  deleteDrillPromptOpen.value = false
  if (!id) return
  const name = currentName.value
  storage.deletePattern(id)
  if (!storage.lastWriteSucceeded.value) return
  // The board keeps what is on it — only its place in the library is gone.
  onPatternDeleted(id)
  notice.value = `Deleted “${name}”. What is on the board is still here.`
}

/**
 * The tags the drill will be filed under, and every tag already in use to
 * offer as chips.
 *
 * Gathered when the prompt opens rather than watched: the library cannot
 * change while a modal is over it, and `allTags` reads localStorage, which
 * Vue cannot track anyway.
 */
const saveTagsDraft = ref<string[]>([])
const availableTags = ref<string[]>([])

/** The tags on the drill that is open, for a fork to start from. */
function openPatternTags(): string[] {
  const id = currentPatternId.value
  if (!id) return []
  return storage.listPatterns().find((p) => p.id === id)?.tags ?? []
}

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
    markSaved()
    notice.value = `Saved “${saved.name}”.`
    return
  }
  savePromptMode.value = 'new'
  saveNameDraft.value = currentName.value || 'New drill'
  saveTagsDraft.value = []
  availableTags.value = storage.allTags()
  savePromptOpen.value = true
}

/** Save as…: fork the board into a new pattern under a new name. */
function openSaveAsPrompt() {
  // A fork only when there is a drill to fork. Save as… on a board that has
  // never been saved is simply its first save, and offering to copy a drill
  // that does not exist — "Save copy", "X stays as it is" — describes
  // something that is not happening.
  savePromptMode.value = currentPatternId.value ? 'fork' : 'new'
  saveNameDraft.value = currentName.value ? `${currentName.value} copy` : 'New drill'
  // The copy starts filed where the original is, which is what `savePattern`
  // would do unasked — shown as pressed chips so the coach can see it and
  // untick what does not apply to the copy.
  saveTagsDraft.value = openPatternTags()
  availableTags.value = storage.allTags()
  savePromptOpen.value = true
}

function confirmSave() {
  const name = saveNameDraft.value.trim()
  if (!name) return
  const isFork = savePromptMode.value === 'fork'
  // A fork deliberately passes no id, so savePattern mints a new one — but it
  // still passes the source pattern's id separately, so the copy carries that
  // drill's tags across rather than starting untagged.
  const id = isFork ? undefined : currentPatternId.value ?? undefined
  const forkFromId = isFork ? currentPatternId.value ?? undefined : undefined
  const saved = storage.savePattern(name, board.snapshot(), id, forkFromId)
  savePromptOpen.value = false
  // A pattern that was never written is not the pattern that is open.
  if (!storage.lastWriteSucceeded.value) return
  currentPatternId.value = saved.id
  currentName.value = saved.name
  markSaved()

  // A second write, and only when there is something to say: `setTags` owns
  // normalisation, the unreadable-library guard and the quota message, so
  // going through it beats teaching `savePattern` a fifth parameter. Skipped
  // when the drill has no tags and is asking for none, which is most saves.
  const tags = saveTagsDraft.value
  const already = saved.tags ?? []
  const unchanged = tags.length === already.length && tags.every((t, i) => t === already[i])
  if (unchanged) return

  storage.setTags(saved.id, tags)
  // The drill itself is saved either way — only its filing failed, and the
  // library's Tags button can still set it. Saying which half went wrong beats
  // setTags' generic banner, which reads as though nothing was written.
  if (!storage.lastWriteSucceeded.value) {
    notice.value = `Saved “${saved.name}”, but its tags could not be stored.`
  }
}

function onPatternLoaded(pattern: Pattern) {
  board.loadSnapshot(storage.patternToSnapshot(pattern))
  currentPatternId.value = pattern.id
  currentName.value = pattern.name
  markSaved()
}

function onPatternRenamed(change: { id: string; name: string }) {
  if (change.id !== currentPatternId.value) return
  currentName.value = change.name
  markSaved()
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
  saveStatus.value = 'unsaved'
}

/**
 * A reset board is not the pattern that was open any more, so the app must
 * stop treating it as one — otherwise the next Save silently overwrites
 * that pattern with an empty board.
 */
function onBoardReset() {
  currentPatternId.value = null
  currentName.value = ''
  saveStatus.value = 'unsaved'
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

/** A label pressed for in the rail rather than dragged: it lands mid-pitch. */
function promptCentreLabel() {
  promptNewLabel({ x: PITCH_W / 2, y: PITCH_H / 2 })
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
    deleteDrillPromptOpen.value ||
    resetPromptOpen.value ||
    libraryOpen.value ||
    helpOpen.value ||
    renameCounterId.value !== null ||
    labelTarget.value !== null,
)

/**
 * Close the innermost thing that is open, and say whether there was one.
 *
 * Prompts before panels, one per press: a coach who has the library open and
 * a prompt over it means the prompt, and closing both at once would take away
 * the thing they were about to go back to.
 */
function closeTopmostDialog(): boolean {
  if (savePromptOpen.value) {
    savePromptOpen.value = false
    return true
  }
  if (deleteDrillPromptOpen.value) {
    deleteDrillPromptOpen.value = false
    return true
  }
  if (resetPromptOpen.value) {
    resetPromptOpen.value = false
    return true
  }
  if (renamePromptOpen.value) {
    renamePromptOpen.value = false
    return true
  }
  if (labelTarget.value !== null) {
    labelTarget.value = null
    return true
  }
  if (libraryOpen.value) {
    libraryOpen.value = false
    return true
  }
  if (helpOpen.value) {
    helpOpen.value = false
    return true
  }
  return false
}

function onKeydown(event: KeyboardEvent) {
  /*
   * Escape is handled before both guards below, deliberately.
   *
   * It has to reach past the focused-field guard because a prompt focuses its
   * own input, which is exactly where the coach is standing when they want
   * out — and past the dialog guard because closing the dialog IS the
   * shortcut, rather than something that must not leak through to the board.
   *
   * Escaping a prompt discards what was typed, which is what pressing Cancel
   * or the backdrop already does.
   */
  if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey) {
    if (closeTopmostDialog()) {
      event.preventDefault()
      return
    }
  }

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

  const byKey: Record<string, ToolMode> = { v: 'select', d: 'pen', r: 'arrow-run', p: 'arrow-pass', l: 'line', c: 'cone', t: 'text', e: 'erase' }
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

// Autosave the working board, debounced, so a refresh does not lose work.
let saveTimer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  // Both debounces, or a board torn down mid-keystroke writes after it is gone.
  clearTimeout(autosaveTimer)
  clearTimeout(saveTimer)
})
watch(
  () => board.state,
  () => {
    // Playing moves the playhead, not the drill. Writing a draft several
    // times a second during a play-through risks restoring a half-tweened
    // board on the next start, and none of it is a change worth saving.
    if (board.isDerived.value) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => storage.saveDraft(board.snapshot()), 400)
    // The draft keeps the working board across a refresh; this keeps the
    // drill itself up to date in the library, so Save is something a coach
    // may press rather than something they must remember.
    scheduleAutosave()
  },
  { deep: true },
)
</script>

<template>
  <div class="app">
    <DrillHeader
      :pattern-name="currentName"
      :save-status="saveStatus"
      :last-saved-at="lastSavedAt"
      :exporting="exporting"
      @rename="onHeaderRename"
      @save="openSavePrompt"
      @saveAs="openSaveAsPrompt"
      @duplicateDrill="duplicateDrill"
      @deleteDrill="deleteDrillPromptOpen = true"
      @clearPlayers="clearPlayers"
      @clearDrawings="clearDrawings"
      @resetBoard="resetPromptOpen = true"
      @open="libraryOpen = true"
      @exportPng="exportPng"
      @exportGif="exportGif"
      @exportJson="exportJson"
      @importJson="importJson"
      @help="helpOpen = true"
    />
    <div class="workspace">
      <!--
        One rail, at every width. A coach who plans a session on a desktop
        and runs it from a tablet at the side of a pitch used to learn the
        tool twice: the same controls sat in a bar across the top on one and
        down the edge on the other. There is no bar now.
      -->
      <ToolRail
        v-if="!railLiesDown"
        v-model:tool="tool"
        v-model:drawColor="drawColor"
        @add-label="promptCentreLabel"
      />

      <div class="stage">
        <div class="board-wrap">
          <PitchBoard
            ref="boardRef"
            :tool="tool"
            :draw-color="drawColor"
            @rename="openRenamePrompt"
            @add-label="promptNewLabel"
            @edit-label="promptEditLabel"
            @selection-size="selectionSize = $event"
            @selection-changed="onSelectionChanged"
          />
          <PitchEmptyState v-if="showEmptyState" />
        </div>
        <!--
          The same rail, lying down: directly above the timeline, where the
          hand holding a phone already is.
        -->
        <ToolRail
          v-if="railLiesDown"
          horizontal
          v-model:tool="tool"
          v-model:drawColor="drawColor"
          @add-label="promptCentreLabel"
        />

        <PhaseTimeline :exporting="exporting" />
      </div>

      <Inspector
        v-model:open="inspectorOpen"
        :selection="selection"
        @duplicate="boardRef?.duplicateSelected()"
        @remove-selection="boardRef?.deleteSelected()"
      />
    </div>

    <PlacementGhost />

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
        <TagInput
          :available="availableTags"
          :initial="saveTagsDraft"
          @update="saveTagsDraft = $event"
        />
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

    <div v-if="resetPromptOpen" class="overlay" @click.self="resetPromptOpen = false">
      <div class="prompt" role="dialog" aria-label="Reset the board">
        <p class="prompt-text">Start again on an empty board?</p>
        <p class="hint">
          Every player, drawing and phase goes. The pitch you are on stays, and this board stops
          being the drill it was saved as.
        </p>
        <div class="prompt-actions">
          <button data-confirm-reset class="chip chip--danger" @click="confirmReset">Reset</button>
          <button class="chip" @click="resetPromptOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <div
      v-if="deleteDrillPromptOpen"
      class="overlay"
      @click.self="deleteDrillPromptOpen = false"
    >
      <div class="prompt" role="dialog" aria-label="Delete this drill">
        <p class="prompt-text">Delete “{{ currentName }}” from your saved drills?</p>
        <p class="hint">What is on the board stays. The saved drill does not come back.</p>
        <div class="prompt-actions">
          <button data-confirm-delete-drill class="chip chip--danger" @click="confirmDeleteDrill">
            Delete
          </button>
          <button class="chip" @click="deleteDrillPromptOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <ActionToast :message="toast" @undo="undoFromToast" @dismiss="toast = null" />

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
/*
 * The board's tokens, in one place.
 *
 * Warm charcoal rather than blue-grey: the tool stays dark, because a
 * bright screen at the side of a pitch is unreadable and a coach's own
 * drill is the only thing on it worth looking at — but the greys are warm
 * enough to belong to the same family as the pitch and the ember the
 * active tool is painted in.
 */
:root {
  --bg-app: #140E0A;
  --surface-1: #1F1410;
  --surface-2: #2A1810;
  --surface-3: #35201A;
  --surface-4: #43281F;
  --field-bg: #17100D;

  --border: #ffffff1a;
  --border-strong: #ff6b354d;
  --ring: #ffffff40;

  --ink-1: #FFF8F3;
  --ink-2: #fff8f3b8;
  --ink-3: #fff8f37a;

  /*
   * Two embers, and the difference between them is white text.
   *
   * `--brand` is the bright one, for borders, glows and focus rings — light
   * on a dark board, and never asked to carry a word. `--brand-gradient` is
   * where white text sits: an active tool's label, the Play button, the
   * segmented control. Its lightest point clears 4.5:1 against white, which
   * the brighter orange does not manage at any point along it (2.84:1), so
   * the tool a coach is holding used to be the least readable thing on the
   * board.
   */
  --brand: #ff6b35;
  --brand-deep: #ee0a24;
  --brand-gradient: linear-gradient(135deg, #d1400c, #c8091d);
  --button-gradient: linear-gradient(180deg, #d1400c, #c8091d);
  --brand-glow: 0 8px 18px -8px #ee0a2473;

  /* The bright red reads as red on a dark surface; the deep one carries white. */
  --error: #EF4444;
  --error-solid: #cc2626;
  --error-ink: #ff8a80;

  --radius-control: 0.75rem;
  --radius-card: 1rem;
  --radius-sheet: 1.5rem;

  --shadow-ink: #000000a6;
  --scrim: #0b0705d1;
  --shadow-card: 0 4px 12px -4px #00000080;
  --shadow-popover: 0 16px 40px -12px var(--shadow-ink);

  /*
   * Satoshi and JetBrains Mono are asked for in index.html and fall back to
   * the platform's own faces, so a coach on a pitch with no signal gets a
   * board that reads the same, in a different typeface.
   */
  --font-ui: 'Satoshi', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  --dur-fast: 160ms;
  --dur-base: 200ms;
  /* Overshoots, so a tool taking hold reads as a thing landing. */
  --ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1);
}

* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { font-family: var(--font-ui); background: var(--bg-app); }

/*
 * Where the keyboard is, said once for the whole board.
 *
 * Most controls here had no focus style of their own, which leaves a
 * keyboard user tabbing blind through a rail of eight tools and two menus.
 * `:focus-visible` rather than `:focus`, so a coach pressing a button with
 * a finger or a mouse is not given a ring they did not ask for.
 */
:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: 0.35rem;
}

/* Every number the board shows, in figures that do not change width. */
[data-clock], [data-frame-duration], .badge {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/*
 * Honoured everywhere at once rather than component by component. Only the
 * timing is dropped: several layouts here are built on transforms — a
 * centred toast, the knob in a switch — and removing those would not calm
 * the interface, it would break it.
 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
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
 * Only so the first-run prompt has something to be positioned against. The
 * board itself is the svg, and an overlay inside it would end up in the PNG.
 */
/*
 * A floor under the pitch. Everything else in the column can be given room
 * by shrinking, and the board is `flex: 1`, so on a short screen it was the
 * one thing that gave way until there was none of it left.
 */
.board-wrap { position: relative; display: flex; min-height: 8rem; min-width: 0; }
.board-wrap > :first-child { flex: 1; min-height: 0; min-width: 0; }

/*
 * The notes used to be a permanent column roughly a quarter of the screen
 * wide, which on a tablet left the pitch 663x430 of a 1194px screen. The
 * panel is a 40px strip until a coach asks for it, so the same tablet gives
 * the board the whole middle — and the board is the only thing on this page
 * anyone is actually looking at.
 */
.error {
  margin: 0; padding: 0.6rem 0.9rem; background: var(--error); color: #fff; font-size: 0.85rem; cursor: pointer;
}
.hint { margin: 0; font-size: 0.8rem; opacity: 0.7; }
/* Quieter than the error bar beneath it: this one is only ever good news. */
.notice {
  margin: 0; padding: 0.6rem 0.9rem;
  background: var(--surface-2); color: var(--ink-1);
  border-left: 3px solid var(--brand);
  font-size: 0.85rem; cursor: pointer;
}
.overlay { position: fixed; inset: 0; background: var(--scrim); display: flex; align-items: center; justify-content: center; }
.prompt {
  background: var(--surface-1); color: var(--ink-1);
  padding: 1.1rem; border-radius: var(--radius-sheet);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-popover);
  display: grid; gap: 0.5rem; min-width: 18rem; max-width: min(26rem, calc(100vw - 2rem));
}
.prompt-actions { display: flex; gap: 0.4rem; }
.input { padding: 0.4rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: var(--surface-2); color: inherit; }
.chip { border: 1px solid #ffffff40; background: var(--surface-3); color: inherit; border-radius: 0.4rem; padding: 0.35rem 0.7rem; cursor: pointer; }
.chip--danger { background: var(--error-solid); border-color: transparent; color: #ffffff; }
.chip--danger:hover { background: #b81f1f; }
.prompt-text { margin: 0; font-size: 0.95rem; }
</style>
