<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pattern, Session } from '../types'
import { useSessions } from '../composables/useSessions'
import { matchesTags, useStorage } from '../composables/useStorage'
import TagFilter from './TagFilter.vue'

const props = withDefaults(defineProps<{ session: Session | null; exporting?: boolean }>(), {
  exporting: false,
})

/**
 * The PDF is not built here. App owns the export lock, the progress notice
 * and the download, exactly as it does for the PNG and the GIF, and a panel
 * that exported for itself would be a second place those live.
 */
const emit = defineEmits<{ close: []; exportPdf: [session: Session] }>()

const sessions = useSessions()
const storage = useStorage()

// Named `entries`/`patterns`/etc — deliberately nothing here is called
// `session`. SessionLibrary shipped with a local `open(session)` function
// that shadowed its own `open` prop inside `<script setup>`'s single scope,
// turning `v-if="open"` into "is this function" (always truthy). This
// component's prop is `session` rather than a boolean, so the same slip
// would hide the panel behind `v-if="session"` resolving to a truthy ref or
// computed instead of `null` — every local name below is chosen to avoid it.
const entries = ref<Session['entries']>([])
const patterns = ref<Pattern[]>([])
const picking = ref(false)
const pickerTags = ref<string[]>([])

/**
 * A ref rather than a computed, for the reason given in PatternLibrary:
 * `allTags` reads localStorage, which Vue cannot track.
 */
const availableTags = ref<string[]>([])

watch(
  () => props.session,
  (session) => {
    entries.value = session ? [...session.entries] : []
    patterns.value = storage.listPatterns()
    availableTags.value = storage.allTags()
    // Reopening on a different session starts the picker closed and its
    // filter cleared — a tag chosen while arranging Tuesday's plan has no
    // business narrowing Thursday's picker the next time this panel opens.
    picking.value = false
    pickerTags.value = []
  },
  { immediate: true },
)

const known = computed(() => new Set(patterns.value.map((p) => p.id)))

const byId = computed(() => new Map(patterns.value.map((p) => [p.id, p])))

/** A missing drill contributes nothing: `totalMinutes` owns that rule. */
const total = computed(() =>
  props.session ? sessions.totalMinutes({ ...props.session, entries: entries.value }, known.value) : 0,
)

// The same predicate the library filters by, not a second copy of it. Two
// spellings of "carries every chosen tag" would drift, and the picker would
// quietly answer a different question from the panel beside it.
const pickable = computed(() => patterns.value.filter((pattern) => matchesTags(pattern, pickerTags.value)))

/**
 * Every edit writes through. There is no Save button to forget to press.
 *
 * `entries` is mutated optimistically before this runs, so a quota failure
 * that goes unchecked would report success while the row visibly moved, was
 * added or was removed with nothing actually saved — the coach reopens the
 * session later to find their edit was never there. `previous` is the state
 * `entries` held right before that mutation; a failed write restores it
 * rather than leaving the optimistic change standing.
 */
function commit(previous: Session['entries']) {
  if (!props.session) return
  sessions.saveSession({ ...props.session, entries: [...entries.value] })
  if (!sessions.lastWriteSucceeded.value) entries.value = previous
}

function move(index: number, by: number) {
  const to = index + by
  if (to < 0 || to >= entries.value.length) return
  const before = [...entries.value]
  const [entry] = entries.value.splice(index, 1)
  entries.value.splice(to, 0, entry)
  commit(before)
}

function remove(index: number) {
  const before = [...entries.value]
  entries.value.splice(index, 1)
  commit(before)
}

function setMinutes(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const minutes = Number(input.value)
  // Refuse rather than store: minutes are validated on the way back in, and a
  // zero or blank field would make the whole session unreadable next time it
  // is opened. `:value` will not repaint the input on its own here — Vue
  // skips the DOM write when the bound number hasn't changed — so the field
  // is pushed back to what is actually stored by hand, or a rejected edit
  // leaves it showing blank (or whatever was typed) instead.
  if (!Number.isFinite(minutes) || minutes <= 0) {
    input.value = String(entries.value[index].minutes)
    return
  }
  const before = [...entries.value]
  entries.value[index] = { ...entries.value[index], minutes }
  commit(before)
}

function add(pattern: Pattern) {
  const before = [...entries.value]
  entries.value.push(sessions.newEntry(pattern.id, 10))
  picking.value = false
  commit(before)
}

/**
 * The session as it stands, not as it arrived.
 *
 * `props.session` is the object App handed over when the panel opened; every
 * edit since has gone into `entries`. Exporting the prop would build a PDF of
 * the running order the coach started with rather than the one they just
 * finished arranging.
 */
function currentSession(): Session {
  return { ...(props.session as Session), entries: [...entries.value] }
}
</script>

<template>
  <div v-if="session" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" :aria-label="session.name">
      <header class="head">
        <h2>{{ session.name }}</h2>
        <span data-total class="meta">{{ total }} min</span>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <p v-if="entries.length === 0" class="empty">No drills yet. Add one below.</p>

      <ul v-else class="list">
        <li v-for="(entry, index) in entries" :key="entry.id" data-entry class="row">
          <span v-if="byId.has(entry.patternId)" class="name">{{ byId.get(entry.patternId)!.name }}</span>
          <span v-else data-missing class="name missing">Drill no longer in your library</span>

          <input
            data-minutes
            class="minutes"
            type="number"
            min="1"
            :value="entry.minutes"
            :aria-label="`Minutes for ${byId.get(entry.patternId)?.name ?? 'this drill'}`"
            @change="setMinutes(index, $event)"
          />
          <span class="meta">min</span>

          <button data-up class="chip" :disabled="index === 0" @click="move(index, -1)">Up</button>
          <button
            data-down
            class="chip"
            :disabled="index === entries.length - 1"
            @click="move(index, 1)"
          >Down</button>
          <button data-remove class="chip chip--danger" @click="remove(index)">Remove</button>
        </li>
      </ul>

      <div class="row row--actions">
        <button data-add-drill class="chip" @click="picking = !picking">Add drill</button>
        <button
          data-export-pdf
          class="chip"
          :disabled="exporting"
          :title="exporting ? 'Already building a PDF' : 'Save this session as a PDF'"
          @click="emit('exportPdf', currentSession())"
        >Export PDF</button>
      </div>

      <div v-if="picking" class="picker">
        <TagFilter :tags="availableTags" :selected="pickerTags" @update="pickerTags = $event" />
        <p v-if="pickable.length === 0" class="empty">No drills match these tags.</p>
        <ul v-else class="list">
          <li v-for="pattern in pickable" :key="pattern.id" class="row">
            <span class="name">{{ pattern.name }}</span>
            <button data-pick class="chip" @click="add(pattern)">Add</button>
          </li>
        </ul>
      </div>
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
  width: min(42rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem;
}
.head { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.head h2 { margin: 0; font-size: 1.1rem; flex: 1; }
.empty { opacity: 0.7; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
.row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; background: var(--surface-2); padding: 0.45rem 0.6rem; border-radius: 0.4rem; }
.row--actions { margin-top: 0.75rem; background: none; padding: 0; }
.name { flex: 1; }
.missing { opacity: 0.6; font-style: italic; }
.minutes { width: 4rem; padding: 0.3rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: var(--surface-1); color: inherit; }
.meta { opacity: 0.6; font-size: 0.8rem; }
.picker { margin-top: 0.75rem; border-top: 1px solid #ffffff20; padding-top: 0.5rem; }
.chip { border: 1px solid #ffffff40; background: var(--surface-3); color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip:disabled { opacity: 0.4; cursor: default; }
.chip--danger { background: #c62828; }
</style>
