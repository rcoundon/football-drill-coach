<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import type { Pattern } from '../types'
import { matchesTags, useStorage } from '../composables/useStorage'
import { useSessions } from '../composables/useSessions'
import TagFilter from './TagFilter.vue'

const props = defineProps<{ open: boolean }>()
/**
 * Rename and delete are reported as well as performed. App owns which pattern
 * is open; the library writes through useStorage, so a rename or delete it
 * keeps to itself leaves App holding a stale name — which its in-place Save
 * then writes back — or a dead id it would resurrect.
 */
const emit = defineEmits<{
  close: []
  load: [pattern: Pattern]
  rename: [change: { id: string; name: string }]
  delete: [id: string]
}>()

const storage = useStorage()
const sessions = useSessions()

const patterns = ref<Pattern[]>([])
const confirmingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const selectedTags = ref<string[]>([])
const taggingId = ref<string | null>(null)
const tagDraft = ref('')

/**
 * Held in a ref refreshed beside the list, not computed.
 *
 * `allTags` reads localStorage, which Vue cannot track — a computed over it
 * would be evaluated once and cached forever, so a tag added through this very
 * panel would not reach the filter row until the panel was remounted.
 */
const availableTags = ref<string[]>([])

function refresh() {
  patterns.value = storage.listPatterns()
  availableTags.value = storage.allTags()
  // A tag can disappear from the library entirely — the coach untags the
  // last drill that carried it — while the panel stays mounted underneath.
  // Without this, its chip vanishes from the filter row but the selection
  // survives, leaving a permanently empty list with no chip left to clear.
  selectedTags.value = selectedTags.value.filter((tag) => availableTags.value.includes(tag))
}

watch(() => props.open, (open) => { if (open) refresh() }, { immediate: true })

/** Every chosen tag must be on the drill: chips narrow, they do not widen. */
const shown = computed(() =>
  patterns.value.filter((pattern) => matchesTags(pattern, selectedTags.value)),
)

const isEmpty = computed(() => patterns.value.length === 0)
/** The library has drills, but none carry every tag the coach chose. */
const noMatches = computed(() => !isEmpty.value && shown.value.length === 0)

/**
 * Report what the coach chose; App puts it on the board.
 *
 * This component does not call `loadSnapshot` itself. There is one owner of
 * "the pattern that is open", and it is App: when the library loaded the
 * board directly, App never learned the id or name, so Save forked a second
 * pattern with the same name and diverging content, and the PNG filename
 * and save prompt fell back to placeholders.
 *
 * `pattern` arrives from a v-for over a ref-held array, so Vue has wrapped
 * it (and its nested objects) in reactive Proxies. `patternToSnapshot` calls
 * structuredClone directly, which throws DataCloneError on a Proxy, so the
 * outer Proxy is peeled off before it crosses that boundary. toRaw only
 * unwraps the OUTERMOST proxy, but that is enough here: the underlying
 * object was never itself mutated through a proxy, so everything nested
 * beneath it is already plain data.
 */
function load(pattern: Pattern) {
  emit('load', toRaw(pattern))
  emit('close')
}

function askDelete(id: string) {
  confirmingId.value = id
}

/**
 * How many sessions hold the drill awaiting confirmation.
 *
 * Computed at the moment of asking rather than kept alongside the list: a
 * session can be edited in another panel between the library opening and the
 * coach reaching for Delete. Deletion is not blocked or cascaded on this —
 * the coach may well mean it — but they should not find out a session was
 * left pointing at nothing after the fact.
 */
const usageCount = computed(() =>
  confirmingId.value === null ? 0 : sessions.sessionsUsing(confirmingId.value).length,
)

function confirmDelete(id: string) {
  storage.deletePattern(id)
  confirmingId.value = null
  // deletePattern writes nothing when the library is unreadable, and a write
  // can fail on quota, so success is not something to claim on faith: refresh()
  // starts with lastError cleared, which would erase the error banner that is
  // the only thing telling the coach the delete did not happen.
  if (!storage.lastWriteSucceeded.value) return
  emit('delete', id)
  refresh()
}

function startRename(pattern: Pattern) {
  renamingId.value = pattern.id
  renameDraft.value = pattern.name
}

function saveRename(id: string) {
  const name = renameDraft.value.trim()
  renamingId.value = null
  if (!name) return
  storage.renamePattern(id, name)
  // renamePattern writes nothing when the library is unreadable, and a write
  // can fail on quota, so success is not something to claim on faith: refresh()
  // starts with lastError cleared, which would erase the error banner that is
  // the only thing telling the coach the rename did not happen.
  if (!storage.lastWriteSucceeded.value) return
  emit('rename', { id, name })
  refresh()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function startTagging(pattern: Pattern) {
  taggingId.value = pattern.id
  tagDraft.value = (pattern.tags ?? []).join(', ')
}

function saveTags(id: string) {
  storage.setTags(id, tagDraft.value.split(','))
  taggingId.value = null
  // setTags writes nothing when the library is unreadable, and a write can
  // fail on quota, so success is not something to claim on faith: refresh()
  // starts with lastError cleared, which would erase the error banner that
  // is the only thing telling the coach the tags were not saved.
  if (!storage.lastWriteSucceeded.value) return
  refresh()
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Saved drills">
      <header class="head">
        <h2>Saved drills</h2>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <TagFilter :tags="availableTags" :selected="selectedTags" @update="selectedTags = $event" />

      <p v-if="isEmpty" class="empty">Nothing saved yet. Build a drill and press Save.</p>
      <p v-else-if="noMatches" data-no-matches class="empty">No drills match these tags.</p>

      <ul v-else class="list">
        <li v-for="pattern in shown" :key="pattern.id" data-pattern class="row">
          <template v-if="renamingId === pattern.id">
            <input v-model="renameDraft" data-rename-input class="input" />
            <button data-rename-save class="chip" @click="saveRename(pattern.id)">Save</button>
            <button class="chip" @click="renamingId = null">Cancel</button>
          </template>

          <template v-else-if="confirmingId === pattern.id">
            <span class="name">Delete “{{ pattern.name }}”?</span>
            <span v-if="usageCount > 0" data-usage-warning class="warning">
              Used in {{ usageCount }} session{{ usageCount === 1 ? '' : 's' }}.
            </span>
            <button data-confirm-delete class="chip chip--danger" @click="confirmDelete(pattern.id)">Delete</button>
            <button class="chip" @click="confirmingId = null">Cancel</button>
          </template>

          <template v-else-if="taggingId === pattern.id">
            <!--
              Named after the drill it belongs to: the row is one of many, and
              a placeholder is an example of what to type rather than a name
              for the field, so it cannot be what a screen reader announces.
            -->
            <input
              v-model="tagDraft"
              data-tags-input
              class="input"
              :aria-label="`Tags for ${pattern.name}`"
              placeholder="rondo, warm up"
            />
            <button data-tags-save class="chip" @click="saveTags(pattern.id)">Save</button>
            <button class="chip" @click="taggingId = null">Cancel</button>
          </template>

          <template v-else>
            <span class="name">{{ pattern.name }}</span>
            <span class="date">{{ formatDate(pattern.updatedAt) }}</span>
            <button data-load class="chip" @click="load(pattern)">Load</button>
            <button data-rename class="chip" @click="startRename(pattern)">Rename</button>
            <button data-tags class="chip" @click="startTagging(pattern)">Tags</button>
            <button data-delete class="chip" @click="askDelete(pattern.id)">Delete</button>
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: var(--scrim);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.panel {
  background: var(--surface-1); color: var(--ink-1); border-radius: 0.6rem;
  width: min(38rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; font-size: 1.1rem; }
.empty { opacity: 0.7; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
.row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; background: var(--surface-2); padding: 0.45rem 0.6rem; border-radius: 0.4rem; }
.name { flex: 1; }
.date { opacity: 0.6; font-size: 0.8rem; }
.input { flex: 1; padding: 0.35rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: var(--surface-1); color: inherit; }
.chip { border: 1px solid #ffffff40; background: var(--surface-3); color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip--danger { background: #c62828; }
.warning { color: #ffcc80; font-size: 0.8rem; }
</style>
