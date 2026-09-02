<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import type { Session } from '../types'
import { useSessions } from '../composables/useSessions'
import { useStorage } from '../composables/useStorage'

const props = defineProps<{ open: boolean }>()
/**
 * `renamed` and `deleted` exist because App (Task 12) will hold the opened
 * session in its own state, and SessionPlan commits edits with
 * `saveSession({ ...props.session, entries })`. Left unreported, a rename
 * from this panel would be silently reverted by the next edit, and a delete
 * would be resurrected by it — `saveSession` upserts by id, so it does not
 * know the row it is writing back is one this panel just renamed or removed.
 */
const emit = defineEmits<{
  close: []
  open: [session: Session]
  renamed: [session: Session]
  deleted: [id: string]
}>()

const sessions = useSessions()
const storage = useStorage()

const list = ref<Session[]>([])
const newName = ref('')
const confirmingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')

/** Which drills still exist, so a session's total can leave out those that do not. */
const knownPatternIds = ref<Set<string>>(new Set())

function refresh() {
  list.value = sessions.listSessions()
  knownPatternIds.value = new Set(storage.listPatterns().map((p) => p.id))
}

watch(() => props.open, (open) => { if (open) refresh() }, { immediate: true })

const isEmpty = computed(() => list.value.length === 0)

function create() {
  const name = newName.value.trim()
  // A session with no name cannot be told apart from another in the list, and
  // there is nothing to put at the top of its PDF.
  if (!name) return
  sessions.createSession(name)
  newName.value = ''
  // createSession writes nothing when the library is unreadable, and a write
  // can fail on quota, so success is not something to claim on faith: refresh()
  // starts with lastError cleared, which would erase the error banner that is
  // the only thing telling the coach the session was not saved.
  if (!sessions.lastWriteSucceeded.value) return
  refresh()
}

/**
 * `toRaw` before the session leaves: it comes from a v-for over a ref-held
 * array, so Vue has wrapped it in a Proxy, and the PDF path clones it.
 *
 * Named `openSession`, not `open` — the prop is called `open`, and a
 * same-named local function shadows it inside this file's own template
 * expressions, which silently turns `v-if="open"` into "is this function",
 * always truthy.
 */
function openSession(session: Session) {
  emit('open', toRaw(session))
}

function saveRename(id: string) {
  const name = renameDraft.value.trim()
  renamingId.value = null
  if (!name) return
  sessions.renameSession(id, name)
  if (!sessions.lastWriteSucceeded.value) return
  refresh()
  // Read the renamed session back off the refreshed list rather than
  // building `{ id, name }` by hand, so App gets the same updatedAt the
  // store now holds.
  const renamed = list.value.find((s) => s.id === id)
  if (renamed) emit('renamed', toRaw(renamed))
}

function confirmDelete(id: string) {
  sessions.deleteSession(id)
  confirmingId.value = null
  if (!sessions.lastWriteSucceeded.value) return
  refresh()
  emit('deleted', id)
}

/**
 * The same total the plan panel and the PDF show, through the same function.
 *
 * A drill that is no longer in the library contributes nothing — it will not
 * be run and it is not in the document — so summing every entry here would
 * have this list promise a session length the PDF then contradicts.
 */
function totalOf(session: Session): number {
  return sessions.totalMinutes(session, knownPatternIds.value)
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Sessions">
      <header class="head">
        <h2>Sessions</h2>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <div class="row">
        <input v-model="newName" data-new-name class="input" placeholder="Tuesday U12" />
        <button data-new-session class="chip" @click="create">New session</button>
      </div>

      <p v-if="isEmpty" class="empty">No sessions yet. Name one above and add drills to it.</p>

      <ul v-else class="list">
        <li v-for="session in list" :key="session.id" data-session class="row">
          <template v-if="renamingId === session.id">
            <input v-model="renameDraft" data-rename-input class="input" />
            <button data-rename-save class="chip" @click="saveRename(session.id)">Save</button>
            <button class="chip" @click="renamingId = null">Cancel</button>
          </template>

          <template v-else-if="confirmingId === session.id">
            <span class="name">Delete “{{ session.name }}”?</span>
            <button data-confirm-delete class="chip chip--danger" @click="confirmDelete(session.id)">Delete</button>
            <button class="chip" @click="confirmingId = null">Cancel</button>
          </template>

          <template v-else>
            <span class="name">{{ session.name }}</span>
            <span class="meta">{{ session.entries.length }} drills · {{ totalOf(session) }} min</span>
            <button data-open class="chip" @click="openSession(session)">Open</button>
            <button data-rename class="chip" @click="renamingId = session.id; renameDraft = session.name">Rename</button>
            <button data-delete class="chip" @click="confirmingId = session.id">Delete</button>
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
.meta { opacity: 0.6; font-size: 0.8rem; }
.input { flex: 1; padding: 0.35rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: var(--surface-1); color: inherit; }
.chip { border: 1px solid #ffffff40; background: var(--surface-3); color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip--danger { background: #c62828; }
</style>
