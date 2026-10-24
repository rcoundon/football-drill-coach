<script setup lang="ts">
import { computed } from 'vue'
import type { ImportReview } from '../importLink'
import type { Issue } from '../drillLint'

/**
 * What a file or an import link holds, shown before any of it is saved.
 *
 * Every import comes through here, file or link, so a coach always sees
 * what they are about to add — and a link they did not expect to carry
 * drills cannot add any without them pressing Import.
 *
 * Only what the app's own import refuses blocks the button. The stricter
 * checks are listed, but a coach restoring their own backup may well have a
 * session naming a drill they have since deleted, and that must still load.
 */
const props = defineProps<{ review: ImportReview | null }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

/** Enough to act on; the rest is one line, not a wall. */
const SHOWN = 8

function firstFew(list: Issue[]) {
  return { shown: list.slice(0, SHOWN), more: Math.max(0, list.length - SHOWN) }
}

const errors = computed(() => firstFew(props.review?.lint.errors ?? []))
const warnings = computed(() => firstFew(props.review?.lint.warnings ?? []))
const empty = computed(() => !!props.review && props.review.patterns.length === 0 && props.review.sessions.length === 0)
const blocked = computed(() => !props.review || props.review.lint.refused || empty.value)
</script>

<template>
  <div v-if="review" class="overlay" @click.self="emit('cancel')">
    <section class="panel" role="dialog" aria-label="Import drills">
      <header class="head">
        <h2>Import drills</h2>
        <span class="meta">{{ review.source === 'link' ? 'From a link' : 'From a file' }}</span>
      </header>

      <template v-if="!review.lint.refused">
        <p v-if="empty" data-import-empty class="empty">There are no drills or sessions in this file.</p>
        <section v-if="review.patterns.length" class="group">
          <h3>Drills ({{ review.patterns.length }})</h3>
          <ul class="list">
            <li v-for="(p, i) in review.patterns" :key="i" data-import-drill>
              <span class="name">{{ p.name }}</span>
              <span class="meta">{{ p.phases }} {{ p.phases === 1 ? 'phase' : 'phases' }}</span>
            </li>
          </ul>
        </section>
        <section v-if="review.sessions.length" class="group">
          <h3>Sessions ({{ review.sessions.length }})</h3>
          <ul class="list">
            <li v-for="(s, i) in review.sessions" :key="i" data-import-session>
              <span class="name">{{ s.name }}</span>
              <span class="meta">{{ s.drills }} {{ s.drills === 1 ? 'drill' : 'drills' }} · {{ s.minutes }} min</span>
            </li>
          </ul>
        </section>
      </template>

      <section v-if="review.lint.errors.length" data-import-errors class="issues issues--error">
        <h3>{{ review.lint.refused ? 'This can’t be imported' : 'Problems — it will import, but may not look right' }}</h3>
        <ul>
          <li v-for="(issue, i) in errors.shown" :key="i"><span class="where">{{ issue.where }}</span> {{ issue.message }}</li>
          <li v-if="errors.more" class="meta">and {{ errors.more }} more</li>
        </ul>
      </section>

      <section v-if="review.lint.warnings.length && !review.lint.refused" data-import-warnings class="issues">
        <h3>Worth checking</h3>
        <ul>
          <li v-for="(issue, i) in warnings.shown" :key="i"><span class="where">{{ issue.where }}</span> {{ issue.message }}</li>
          <li v-if="warnings.more" class="meta">and {{ warnings.more }} more</li>
        </ul>
      </section>

      <p class="hint">Nothing you already have is changed: a drill that is already saved comes in as a copy.</p>

      <div class="actions">
        <button data-cancel-import class="chip" @click="emit('cancel')">Cancel</button>
        <button data-confirm-import class="chip chip--primary" :disabled="blocked" @click="emit('confirm')">Import</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 70; background: var(--scrim);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.panel {
  background: var(--surface-1); color: var(--ink-1); border: 1px solid var(--border);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-popover);
  width: min(34rem, 100%); max-height: 85vh; overflow: auto; padding: 1rem;
  display: grid; gap: 0.75rem;
}
.head { display: flex; align-items: baseline; gap: 0.6rem; }
.head h2 { margin: 0; font-size: 1.1rem; flex: 1; }
h3 { margin: 0 0 0.35rem; font-size: 0.85rem; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
.list li { display: flex; gap: 0.5rem; align-items: baseline; background: var(--surface-2); padding: 0.4rem 0.6rem; border-radius: var(--radius-control); }
.name { flex: 1; overflow-wrap: anywhere; }
.meta { opacity: 0.6; font-size: 0.8rem; }
.empty, .hint { margin: 0; font-size: 0.8rem; opacity: 0.7; }
.issues { border-left: 3px solid var(--brand); padding: 0.4rem 0.6rem; background: var(--surface-2); border-radius: var(--radius-control); font-size: 0.8rem; }
.issues--error { border-left-color: var(--error); }
.issues ul { margin: 0; padding-left: 1rem; display: grid; gap: 0.2rem; }
.where { font-family: var(--font-mono); opacity: 0.75; overflow-wrap: anywhere; }
.actions { display: flex; justify-content: flex-end; gap: 0.4rem; }
.chip { border: 1px solid var(--border); background: var(--surface-3); color: inherit; border-radius: var(--radius-control); padding: 0.4rem 0.8rem; cursor: pointer; }
.chip:disabled { opacity: 0.4; cursor: default; }
.chip--primary { background: var(--brand-gradient); border-color: transparent; color: #ffffff; }
</style>
