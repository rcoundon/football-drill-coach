<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../composables/useBoard'

/**
 * What is left of the board's controls once the drill is being shown to
 * players rather than built: play it, step through it, and get out.
 *
 * Everything that edits is gone, and the pitch itself takes no pointer
 * events while this is up — a coach holding a tablet out to a group should
 * not be able to drag a player off with their thumb.
 */
const emit = defineEmits<{ exit: [] }>()

const board = useBoard()

const current = computed(() => board.state.currentFrame)
const last = computed(() => board.state.frames.length - 1)

function togglePlay(): void {
  if (board.playback.playing) board.pause()
  else board.play()
}
</script>

<template>
  <div data-presentation-bar class="bar" role="toolbar" aria-label="Presenting">
    <button
      data-present-exit
      class="button"
      title="Back to the board (Escape)"
      aria-label="Back to the board"
      @click="emit('exit')"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
    </button>

    <div class="divider"></div>

    <button
      data-present-previous
      class="button"
      :disabled="current === 0"
      title="The phase before"
      aria-label="The phase before"
      @click="board.goToFrame(current - 1)"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    </button>

    <span data-present-phase class="count">{{ current + 1 }} / {{ last + 1 }}</span>

    <button
      data-present-next
      class="button"
      :disabled="current === last"
      title="The phase after"
      aria-label="The phase after"
      @click="board.goToFrame(current + 1)"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </button>

    <button
      data-present-play
      class="play"
      :title="board.playback.playing ? 'Pause' : 'Play the drill'"
      :aria-label="board.playback.playing ? 'Pause' : 'Play the drill'"
      @click="togglePlay()"
    >
      <svg v-if="board.playback.playing" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
      <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
    </button>
  </div>
</template>

<style scoped>
/*
 * Floating over the pitch rather than beside it: the point of presenting is
 * that the pitch has the whole screen, and this is the smallest thing that
 * can be left on it and still let a coach run the drill.
 */
.bar {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem;
  border-radius: var(--radius-card);
  background: #14100ee6;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-popover);
  color: var(--ink-1);
}

.button {
  width: 40px; height: 40px; display: grid; place-items: center;
  border: none; background: transparent; color: inherit;
  border-radius: var(--radius-control); cursor: pointer; padding: 0;
}
.button:hover:not(:disabled) { background: #ffffff1f; }
.button:disabled { opacity: 0.35; cursor: default; }

.play {
  width: 44px; height: 44px; flex: none;
  display: grid; place-items: center;
  border: none; border-radius: 50%; cursor: pointer; padding: 0;
  background: var(--brand-gradient);
  color: #ffffff;
  box-shadow: var(--brand-glow);
}

.count {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  padding: 0 0.2rem;
  white-space: nowrap;
}

.divider { width: 1px; align-self: stretch; margin: 0.3rem 0.1rem; background: var(--border); }

@media (pointer: coarse) {
  .button { width: 44px; height: 44px; }
}
</style>
