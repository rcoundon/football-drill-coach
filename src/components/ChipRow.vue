<script setup lang="ts">
/**
 * A row of tags that can be pressed on and off.
 *
 * Both places a coach meets tags use it: the library's filter row, where
 * pressing narrows the list, and the save prompt, where pressing files the
 * drill. The two answer different questions but they are the same control,
 * and drawing it twice is how the two come to disagree — a chip that looks
 * pressed in one and not the other.
 *
 * It decides nothing. What a press means belongs to whoever owns the list.
 */
defineProps<{ tags: string[]; pressed: string[] }>()

defineEmits<{ toggle: [tag: string] }>()
</script>

<template>
  <!-- Nothing at all until there is a tag: an empty row is furniture. -->
  <div v-if="tags.length > 0" class="row">
    <button
      v-for="tag in tags"
      :key="tag"
      data-chip
      type="button"
      class="chip"
      :class="{ 'chip--on': pressed.includes(tag) }"
      :aria-pressed="pressed.includes(tag)"
      @click="$emit('toggle', tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.chip {
  border: 1px solid #ffffff40; background: var(--surface-3); color: inherit;
  border-radius: 0.8rem; padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.8rem;
}
.chip--on { background: #2e7d32; border-color: #ffffff80; }
</style>
