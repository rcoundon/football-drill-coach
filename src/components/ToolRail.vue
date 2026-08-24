<script setup lang="ts">
import type { CounterColor, ToolMode } from '../types'
import { COUNTER_COLORS } from '../geometry'
import { useBoard } from '../composables/useBoard'
import { DRAW_COLORS, DRAW_COLOR_NAMES, SWATCHES, TOOLS } from './controls'

const props = defineProps<{ tool: ToolMode; drawColor: string }>()

const emit = defineEmits<{
  'update:tool': [tool: ToolMode]
  'update:drawColor': [color: string]
}>()

const board = useBoard()

/**
 * A new player arrives where the board decides, which is rarely where the
 * coach wants them, so the next thing they do is drag them. Switching to
 * Move saves a trip to the tool row for a step that follows nearly every
 * time — and unlike Cone, a colour swatch is not a tool the coach chose to
 * stay in, so there is nothing to switch back to.
 *
 * The toolbar does the same thing. Both are covered by their own tests, so
 * the two layouts cannot drift apart on this.
 */
function addPlayer(color: CounterColor): void {
  board.addCounter(color)
  if (props.tool !== 'select') emit('update:tool', 'select')
}
</script>

<template>
  <!--
    The modes a coach changes constantly, down the edge the hand holding a
    tablet is already on. Everything used once per drill stays in the bar
    across the top.
  -->
  <nav class="rail" aria-label="Players and tools">
    <div class="rail-group">
      <button
        v-for="color in COUNTER_COLORS"
        :key="color"
        :data-add-counter="color"
        class="swatch"
        :style="{ background: SWATCHES[color] }"
        :disabled="board.isDerived.value"
        :title="
          board.isDerived.value
            ? 'A player appearing mid-drill is never what anyone meant'
            : `Add a ${color} player`
        "
        :aria-label="`Add a ${color} player`"
        @click="addPlayer(color)"
      />
    </div>

    <div class="rail-group">
      <button
        v-for="t in TOOLS"
        :key="t.id"
        :data-tool="t.id"
        :class="['rail-chip', { 'is-active': tool === t.id }]"
        @click="emit('update:tool', t.id)"
      >{{ t.label }}</button>
    </div>

    <div class="rail-group rail-group--colors">
      <button
        v-for="c in DRAW_COLORS"
        :key="c"
        :data-draw-color="c"
        class="swatch swatch--sm"
        :class="{ 'is-active': drawColor === c }"
        :style="{ background: c }"
        :title="`Draw in ${DRAW_COLOR_NAMES[c] ?? c}`"
        :aria-label="`Draw in ${DRAW_COLOR_NAMES[c] ?? c}`"
        @click="emit('update:drawColor', c)"
      />
    </div>

  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0.6rem 0.5rem;
  background: #263238;
  border-radius: 0.5rem;
  overflow-y: auto;
}

.rail-group { display: flex; flex-direction: column; gap: 0.35rem; align-items: stretch; }

/* Draw colours are small enough to pair up rather than run down the rail. */
.rail-group--colors { flex-direction: row; flex-wrap: wrap; justify-content: center; }

.rail-chip {
  border: 1px solid #ffffff40; background: #37474f; color: #eceff1;
  border-radius: 0.4rem; padding: 0.45rem 0.6rem; cursor: pointer;
  font-size: 0.8rem; text-align: center; white-space: nowrap;
}
.rail-chip:disabled { opacity: 0.4; cursor: default; }
.rail-chip.is-active { background: #546e7a; border-color: #ffffff; }

.swatch {
  width: 2.1rem; height: 2.1rem; border-radius: 50%;
  border: 2px solid #ffffff40; cursor: pointer; padding: 0;
  align-self: center;
}
.swatch--sm { width: 1.5rem; height: 1.5rem; }
.swatch.is-active { border-color: #ffffff; }

@media (pointer: coarse) {
  .rail-chip { min-height: 44px; }
  .swatch { width: 44px; height: 44px; }
  .swatch--sm { width: 36px; height: 36px; }
}
</style>
