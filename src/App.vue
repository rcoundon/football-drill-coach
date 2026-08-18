<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { ToolMode } from './types'
import Toolbar from './components/Toolbar.vue'
import PitchBoard from './components/PitchBoard.vue'
import { useBoard } from './composables/useBoard'
import { useStorage } from './composables/useStorage'

const board = useBoard()
const storage = useStorage()

const tool = ref<ToolMode>('select')
const drawColor = ref('#ffffff')

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
    <Toolbar v-model:tool="tool" v-model:drawColor="drawColor" />
    <div class="stage">
      <PitchBoard :tool="tool" :draw-color="drawColor" />
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
</style>
