<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

/**
 * What just happened, and the way back from it.
 *
 * Preferred over a confirmation for anything that can be undone: asking
 * "are you sure?" before every clear costs a press every time to protect
 * against the once it was a mistake, while a toast costs nothing until it
 * is needed.
 */
const props = withDefaults(
  defineProps<{
    /** What happened, in plain words. Absent means nothing is showing. */
    message?: string | null
    /** How long it stays, in milliseconds. */
    life?: number
  }>(),
  { message: null, life: 6000 },
)

const emit = defineEmits<{ undo: []; dismiss: [] }>()

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * The countdown restarts whenever the message changes, so a second clear
 * gets its own six seconds rather than inheriting what was left of the
 * first one's.
 */
watch(
  () => props.message,
  (message) => {
    clearTimeout(timer)
    if (!message) return
    timer = setTimeout(() => emit('dismiss'), props.life)
  },
  { immediate: true },
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div v-if="message" data-toast class="toast" role="status">
    <span class="text">{{ message }}</span>
    <button data-toast-undo class="undo" @click="emit('undo')">Undo</button>
    <button data-toast-dismiss class="dismiss" aria-label="Dismiss" @click="emit('dismiss')">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  z-index: 50;
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-card);
  background: var(--surface-2);
  border: 1px solid var(--border);
  box-shadow: 0 16px 40px -12px var(--shadow-ink);
  color: #FFF8F3;
  font-size: 0.85rem;
  max-width: min(28rem, calc(100vw - 2rem));
}

.text { flex: 1; min-width: 0; }

.undo {
  flex: none;
  border: none; border-radius: var(--radius-control);
  padding: 0.35rem 0.7rem;
  background: var(--button-gradient);
  color: #ffffff; font: inherit; font-weight: 700; cursor: pointer;
  box-shadow: inset 0 1px 0 #ffffff40;
}

.dismiss {
  flex: none;
  width: 28px; height: 28px; display: grid; place-items: center;
  border: none; background: transparent; color: inherit;
  border-radius: 0.4rem; cursor: pointer; padding: 0; opacity: 0.7;
}
.dismiss:hover { opacity: 1; background: #ffffff14; }

@media (pointer: coarse) {
  .undo { min-height: 44px; }
  .dismiss { width: 44px; height: 44px; }
}
</style>
