<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { ToolMode } from './types'
import Toolbar from './components/Toolbar.vue'
import PitchBoard from './components/PitchBoard.vue'
import PatternLibrary from './components/PatternLibrary.vue'
import { useBoard } from './composables/useBoard'
import { useStorage } from './composables/useStorage'

const board = useBoard()
const storage = useStorage()

const tool = ref<ToolMode>('select')
const drawColor = ref('#ffffff')

const libraryOpen = ref(false)
const currentPatternId = ref<string | null>(null)
const currentName = ref('')
const savePromptOpen = ref(false)
const saveNameDraft = ref('')

function openSavePrompt() {
  saveNameDraft.value = currentName.value || 'New pattern'
  savePromptOpen.value = true
}

function confirmSave() {
  const name = saveNameDraft.value.trim()
  if (!name) return
  const saved = storage.savePattern(name, board.snapshot(), currentPatternId.value ?? undefined)
  currentPatternId.value = saved.id
  currentName.value = saved.name
  savePromptOpen.value = false
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

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) board.redo()
    else board.undo()
    return
  }

  if (modifier) return

  const byKey: Record<string, ToolMode> = { v: 'select', p: 'pen', r: 'arrow-run', s: 'arrow-pass', e: 'erase' }
  const next = byKey[event.key.toLowerCase()]
  if (next) tool.value = next
}

onMounted(() => {
  const draft = storage.loadDraft()
  if (draft) board.loadSnapshot(draft)
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
    <Toolbar v-model:tool="tool" v-model:drawColor="drawColor" @save="openSavePrompt" @open="libraryOpen = true" />
    <div class="stage">
      <PitchBoard :tool="tool" :draw-color="drawColor" @rename="openRenamePrompt" />
    </div>

    <PatternLibrary :open="libraryOpen" @close="libraryOpen = false" />

    <div v-if="savePromptOpen" class="overlay" @click.self="savePromptOpen = false">
      <div class="prompt" role="dialog" aria-label="Save pattern">
        <label for="pattern-name">Name this pattern</label>
        <input id="pattern-name" v-model="saveNameDraft" class="input" @keyup.enter="confirmSave" />
        <div class="prompt-actions">
          <button class="chip" @click="confirmSave">Save</button>
          <button class="chip" @click="savePromptOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="renamePromptOpen" class="overlay" @click.self="renamePromptOpen = false">
      <div class="prompt" role="dialog" aria-label="Rename player">
        <label for="counter-label">Player label</label>
        <input
          id="counter-label"
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

    <p v-if="storage.lastError.value" class="error" role="status">{{ storage.lastError.value }}</p>
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
  margin: 0; padding: 0.6rem 0.9rem; background: #b71c1c; color: #fff; font-size: 0.85rem;
}
.overlay { position: fixed; inset: 0; background: #000000aa; display: flex; align-items: center; justify-content: center; }
.prompt { background: #263238; color: #eceff1; padding: 1rem; border-radius: 0.6rem; display: grid; gap: 0.5rem; min-width: 18rem; }
.prompt-actions { display: flex; gap: 0.4rem; }
.input { padding: 0.4rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #37474f; color: inherit; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.35rem 0.7rem; cursor: pointer; }
</style>
