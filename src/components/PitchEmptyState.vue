<script setup lang="ts">
/**
 * What to do first, on the empty pitch itself.
 *
 * The one thing the tool never said was how a player gets onto the grass.
 * It is said here, once, over the only place a coach is looking — and it
 * goes for good the moment the first thing lands, because an instruction
 * that keeps coming back is an instruction that was not followed.
 */
</script>

<template>
  <div data-empty-state class="empty" aria-hidden="true">
    <p class="headline">Build your first phase</p>
    <p class="body">
      Drag a player colour onto the pitch, or press one to drop it in the middle. Then use Run
      and Pass to show how they move.
    </p>
  </div>
</template>

<style scoped>
/*
 * Deaf to the pointer, deliberately: this sits over the pitch, and a coach
 * following the instruction drops their first player straight through it.
 */
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  pointer-events: none;
  color: #ffffff;
  text-shadow: 0 2px 8px var(--shadow-ink);
}

.headline { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
.body { margin: 0; max-width: 26rem; font-size: 0.95rem; line-height: 1.45; opacity: 0.88; }

@media (max-width: 48rem) {
  .headline { font-size: 1.2rem; }
  .body { font-size: 0.85rem; }
}
</style>
