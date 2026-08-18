<script setup lang="ts">
import type { CounterColor, PitchType, ToolMode } from '../types'
import { COUNTER_COLORS } from '../geometry'
import { useBoard } from '../composables/useBoard'

defineProps<{ tool: ToolMode; drawColor: string }>()

const emit = defineEmits<{
  'update:tool': [tool: ToolMode]
  'update:drawColor': [color: string]
  save: []
  open: []
  exportPng: []
  exportJson: []
  importJson: []
}>()

const board = useBoard()

const SWATCHES: Record<CounterColor, string> = {
  red: '#e53935',
  blue: '#1e88e5',
  yellow: '#fdd835',
  green: '#43a047',
  black: '#212121',
}

const TOOLS: { id: ToolMode; label: string }[] = [
  { id: 'select', label: 'Move' },
  { id: 'pen', label: 'Draw' },
  { id: 'arrow-run', label: 'Run' },
  { id: 'arrow-pass', label: 'Pass' },
  { id: 'erase', label: 'Erase' },
]

const PITCHES: { id: PitchType; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'full', label: 'Full' },
  { id: 'half', label: 'Half' },
]

const DRAW_COLORS = ['#ffffff', '#ffeb3b', '#212121', '#e53935']
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <span class="group-label">Players</span>
      <button
        v-for="color in COUNTER_COLORS"
        :key="color"
        :data-add-counter="color"
        class="swatch"
        :style="{ background: SWATCHES[color] }"
        :title="`Add a ${color} player`"
        @click="board.addCounter(color)"
      />
    </div>

    <div class="group">
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
        :title="'Draw in this colour'"
        @click="emit('update:drawColor', c)"
      />
    </div>

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
      <button data-undo class="chip" :disabled="!board.canUndo.value" @click="board.undo()">Undo</button>
      <button data-redo class="chip" :disabled="!board.canRedo.value" @click="board.redo()">Redo</button>
      <button class="chip" @click="board.clearDrawings()">Clear drawings</button>
    </div>

    <div class="group">
      <button data-save class="chip" @click="emit('save')">Save</button>
      <button data-open class="chip" @click="emit('open')">Open</button>
      <button data-export-png class="chip" @click="emit('exportPng')">PNG</button>
      <button data-export-json class="chip" @click="emit('exportJson')">Export</button>
      <button data-import-json class="chip" @click="emit('importJson')">Import</button>
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
.group { display: flex; gap: 0.35rem; align-items: center; }
.group-label { font-size: 0.7rem; text-transform: uppercase; opacity: 0.65; margin-right: 0.2rem; }
.swatch {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 2px solid #ffffff40; cursor: pointer; padding: 0;
}
.swatch--sm { width: 1.4rem; height: 1.4rem; }
.swatch.is-active, .chip.is-active { border-color: #ffffff; }
.chip {
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
  border-radius: 0.4rem; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem;
}
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.is-active { background: #546e7a; }
</style>
