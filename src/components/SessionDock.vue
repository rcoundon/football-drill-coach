<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pattern, Session } from '../types'
import { useStorage } from '../composables/useStorage'
import { useViewport } from '../composables/useViewport'

/**
 * A session's running order, docked beside the pitch while the coach works
 * through it drill by drill.
 *
 * For checking a session over at a desk before training: the drill on the
 * board is fully editable, and the autosave files each edit, so moving on
 * to the next drill needs nothing pressed first. Arranging the session —
 * order, minutes, adding and removing — stays in SessionPlan; this only
 * moves between what is already there.
 *
 * App owns which entry is on the board, for the same reason it owns the
 * open pattern: loading a drill is App's job, and a dock that loaded drills
 * itself would be a second place the open pattern is decided.
 */
const props = defineProps<{ session: Session; currentEntryId: string | null }>()

const emit = defineEmits<{ go: [entryId: string]; editPlan: []; close: [] }>()

const storage = useStorage()
const { isCompact } = useViewport()

/**
 * A ref rather than a computed: the library lives in localStorage, which Vue
 * cannot track. Re-read whenever the coach moves, which is also when a
 * rename typed into the header has had its chance to be filed.
 */
const patterns = ref<Pattern[]>([])

watch(
  () => [props.session, props.currentEntryId],
  () => {
    patterns.value = storage.listPatterns()
  },
  { immediate: true },
)

const byId = computed(() => new Map(patterns.value.map((p) => [p.id, p])))

const total = computed(() =>
  props.session.entries.reduce((sum, e) => (byId.value.has(e.patternId) ? sum + e.minutes : sum), 0),
)

const currentIndex = computed(() => props.session.entries.findIndex((e) => e.id === props.currentEntryId))

/** The nearest drill still in the library, stepping `by` from the current one. */
function neighbour(by: -1 | 1): string | null {
  const entries = props.session.entries
  for (let i = currentIndex.value + by; i >= 0 && i < entries.length; i += by) {
    if (byId.value.has(entries[i].patternId)) return entries[i].id
  }
  return null
}

const previous = computed(() => neighbour(-1))
const next = computed(() => neighbour(1))

/**
 * Folded to a narrow strip on a small screen, where the pitch has no width
 * to give. Opening it is the coach's call; it starts folded again only when
 * a different session is reviewed.
 */
const folded = ref(isCompact.value)
watch(
  () => props.session.id,
  () => {
    folded.value = isCompact.value
  },
)
</script>

<template>
  <aside data-session-dock class="dock" :class="{ 'is-folded': folded }" :aria-label="`Reviewing ${session.name}`">
    <template v-if="folded">
      <button data-dock-unfold class="icon" title="Show the running order" aria-label="Show the running order" @click="folded = false">☰</button>
      <button data-dock-previous class="icon" :disabled="!previous" aria-label="The drill before" @click="previous && emit('go', previous)">‹</button>
      <span class="count">{{ currentIndex + 1 }}/{{ session.entries.length }}</span>
      <button data-dock-next class="icon" :disabled="!next" aria-label="The drill after" @click="next && emit('go', next)">›</button>
      <button data-dock-close class="icon" title="Stop reviewing" aria-label="Stop reviewing" @click="emit('close')">✕</button>
    </template>

    <template v-else>
      <header class="head">
        <strong class="title">{{ session.name }}</strong>
        <span data-dock-total class="meta">{{ total }} min</span>
      </header>

      <ol class="list">
        <li v-for="(entry, index) in session.entries" :key="entry.id">
          <button
            v-if="byId.has(entry.patternId)"
            data-dock-entry
            class="entry"
            :class="{ 'is-current': entry.id === currentEntryId }"
            :aria-current="entry.id === currentEntryId ? 'true' : undefined"
            @click="emit('go', entry.id)"
          >
            <span class="num">{{ index + 1 }}.</span>
            <span class="name">{{ byId.get(entry.patternId)!.name }}</span>
            <span class="meta">{{ entry.minutes }}</span>
          </button>
          <span v-else data-dock-missing class="entry is-missing">
            <span class="num">{{ index + 1 }}.</span>
            <span class="name">Drill no longer in your library</span>
          </span>
        </li>
      </ol>

      <div class="actions">
        <button data-dock-previous class="chip" :disabled="!previous" aria-label="The drill before" @click="previous && emit('go', previous)">‹</button>
        <button data-dock-next class="chip" :disabled="!next" aria-label="The drill after" @click="next && emit('go', next)">›</button>
        <span class="spacer"></span>
        <button v-if="isCompact" data-dock-fold class="chip" aria-label="Fold the running order" @click="folded = true">«</button>
        <button data-dock-close class="chip" title="Stop reviewing" aria-label="Stop reviewing" @click="emit('close')">✕</button>
      </div>
      <button data-dock-edit-plan class="link" @click="emit('editPlan')">Edit plan</button>
    </template>
  </aside>
</template>

<style scoped>
.dock {
  flex: none; width: 14rem; min-height: 0; overflow: auto;
  display: flex; flex-direction: column; gap: 0.5rem;
  padding: 0.6rem; border-radius: var(--radius-card);
  background: var(--surface-1); border: 1px solid var(--border); color: var(--ink-1);
}
.dock.is-folded { width: auto; align-items: center; gap: 0.3rem; padding: 0.4rem; }
.head { display: flex; align-items: baseline; gap: 0.4rem; }
.title { flex: 1; font-size: 0.9rem; overflow-wrap: anywhere; }
.meta { opacity: 0.6; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
.entry {
  width: 100%; display: flex; gap: 0.35rem; align-items: baseline; text-align: left;
  padding: 0.4rem 0.45rem; border-radius: var(--radius-control);
  border: 1px solid transparent; background: transparent; color: inherit;
  font: inherit; font-size: 0.82rem; cursor: pointer;
}
button.entry:hover { background: var(--surface-2); }
.entry.is-current { background: var(--surface-3); border-color: var(--brand); font-weight: 600; }
.entry.is-missing { opacity: 0.5; font-style: italic; cursor: default; }
.num { opacity: 0.6; font-variant-numeric: tabular-nums; }
.name { flex: 1; overflow-wrap: anywhere; }
.actions { display: flex; gap: 0.3rem; align-items: center; }
.spacer { flex: 1; }
.chip, .icon {
  border: 1px solid var(--border); background: var(--surface-3); color: inherit;
  border-radius: var(--radius-control); padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.85rem;
}
.icon { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; }
.chip:disabled, .icon:disabled { opacity: 0.35; cursor: default; }
.link { align-self: flex-start; border: none; background: none; color: inherit; opacity: 0.75; text-decoration: underline; cursor: pointer; padding: 0; font-size: 0.8rem; }
.count { font-family: var(--font-mono); font-size: 0.8rem; font-variant-numeric: tabular-nums; }

@media (pointer: coarse) {
  .icon { width: 44px; height: 44px; }
  .entry { padding: 0.6rem 0.5rem; }
}
</style>
