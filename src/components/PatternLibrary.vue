<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import type { Pattern } from '../types'
import { useStorage } from '../composables/useStorage'
import { useBoard } from '../composables/useBoard'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const storage = useStorage()
const board = useBoard()

const patterns = ref<Pattern[]>([])
const confirmingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')

function refresh() {
  patterns.value = storage.listPatterns()
}

watch(() => props.open, (open) => { if (open) refresh() }, { immediate: true })

const isEmpty = computed(() => patterns.value.length === 0)

function load(pattern: Pattern) {
  // `pattern` arrives from a v-for over a ref-held array, so Vue has wrapped
  // it (and its nested objects) in reactive Proxies. patternToSnapshot calls
  // structuredClone directly, which throws DataCloneError on a Proxy, so the
  // outer Proxy must be peeled off before crossing that boundary. toRaw only
  // unwraps the OUTERMOST proxy, but that is enough here: the underlying
  // object was never itself mutated through a proxy, so everything nested
  // beneath it is already plain data.
  board.loadSnapshot(storage.patternToSnapshot(toRaw(pattern)))
  emit('close')
}

function askDelete(id: string) {
  confirmingId.value = id
}

function confirmDelete(id: string) {
  storage.deletePattern(id)
  confirmingId.value = null
  refresh()
}

function startRename(pattern: Pattern) {
  renamingId.value = pattern.id
  renameDraft.value = pattern.name
}

function saveRename(id: string) {
  const name = renameDraft.value.trim()
  if (name) storage.renamePattern(id, name)
  renamingId.value = null
  refresh()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Saved patterns">
      <header class="head">
        <h2>Saved patterns</h2>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <p v-if="isEmpty" class="empty">Nothing saved yet. Set up a pattern and press Save.</p>

      <ul v-else class="list">
        <li v-for="pattern in patterns" :key="pattern.id" data-pattern class="row">
          <template v-if="renamingId === pattern.id">
            <input v-model="renameDraft" data-rename-input class="input" />
            <button data-rename-save class="chip" @click="saveRename(pattern.id)">Save</button>
            <button class="chip" @click="renamingId = null">Cancel</button>
          </template>

          <template v-else-if="confirmingId === pattern.id">
            <span class="name">Delete “{{ pattern.name }}”?</span>
            <button data-confirm-delete class="chip chip--danger" @click="confirmDelete(pattern.id)">Delete</button>
            <button class="chip" @click="confirmingId = null">Cancel</button>
          </template>

          <template v-else>
            <span class="name">{{ pattern.name }}</span>
            <span class="date">{{ formatDate(pattern.updatedAt) }}</span>
            <button data-load class="chip" @click="load(pattern)">Load</button>
            <button data-rename class="chip" @click="startRename(pattern)">Rename</button>
            <button data-delete class="chip" @click="askDelete(pattern.id)">Delete</button>
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: #000000aa;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.panel {
  background: #263238; color: #eceff1; border-radius: 0.6rem;
  width: min(38rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; font-size: 1.1rem; }
.empty { opacity: 0.7; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
.row { display: flex; gap: 0.4rem; align-items: center; background: #37474f; padding: 0.45rem 0.6rem; border-radius: 0.4rem; }
.name { flex: 1; }
.date { opacity: 0.6; font-size: 0.8rem; }
.input { flex: 1; padding: 0.35rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #263238; color: inherit; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip--danger { background: #c62828; }
</style>
