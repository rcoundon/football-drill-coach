<script setup lang="ts">
import { computed } from 'vue'
import { usePlacement } from '../composables/usePlacement'
import { SWATCHES } from './controls'

/**
 * The thing being carried, drawn under the pointer.
 *
 * Without it a drag from the palette is a gesture with no feedback: the
 * coach is holding something they cannot see until they let go of it.
 */
const { dragging, pointer } = usePlacement()

const style = computed(() => ({
  left: `${pointer.value?.x ?? 0}px`,
  top: `${pointer.value?.y ?? 0}px`,
}))

const playerColor = computed(() =>
  dragging.value?.kind === 'player' ? SWATCHES[dragging.value.color] : null,
)
</script>

<template>
  <!--
    Pinned to the viewport and deaf to the pointer: this follows the drag, it
    never receives it. Anything else here would swallow the drop it exists to
    illustrate.
  -->
  <div v-if="dragging && pointer" data-placement-ghost class="ghost" :style="style" aria-hidden="true">
    <span v-if="playerColor" class="disc" :style="{ background: playerColor }"></span>
    <span v-else-if="dragging.kind === 'ball'" class="ball"></span>
    <span v-else-if="dragging.kind === 'cone'" class="cone"></span>
    <span v-else class="text">T</span>
  </div>
</template>

<style scoped>
.ghost {
  position: fixed;
  z-index: 40;
  transform: translate(-50%, -50%);
  opacity: 0.7;
  pointer-events: none;
}

.disc {
  display: block; width: 44px; height: 44px; border-radius: 50%;
  border: 2px solid #ffffff99;
}
.ball {
  display: block; width: 22px; height: 22px; border-radius: 50%;
  background: #ffffff; border: 2px solid #212121;
}
.cone {
  display: block; width: 0; height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-bottom: 22px solid #f97316;
}
.text {
  display: grid; place-items: center; width: 28px; height: 28px;
  border-radius: 0.3rem; background: var(--surface-1); color: var(--ink-1);
  font-weight: 800; font-size: 0.9rem;
}

@media (prefers-reduced-motion: reduce) {
  .ghost { opacity: 0.85; }
}
</style>
