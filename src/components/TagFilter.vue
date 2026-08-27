<script setup lang="ts">
const props = defineProps<{ tags: string[]; selected: string[] }>()
const emit = defineEmits<{ update: [selected: string[]] }>()

/**
 * Chips toggle rather than replace, and combine with AND. "rondo" and "u12"
 * together is the question a coach with fifty drills is actually asking; a
 * chip that cleared the others would make that question unaskable.
 */
function toggle(tag: string) {
  emit(
    'update',
    props.selected.includes(tag)
      ? props.selected.filter((t) => t !== tag)
      : [...props.selected, tag],
  )
}
</script>

<template>
  <!-- Nothing at all until a drill has a tag: an empty row is furniture. -->
  <div v-if="tags.length > 0" class="row">
    <button
      v-for="tag in tags"
      :key="tag"
      data-tag-chip
      class="chip"
      :class="{ 'chip--on': selected.includes(tag) }"
      @click="toggle(tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.6rem; }
.chip {
  border: 1px solid #ffffff40; background: #455a64; color: inherit;
  border-radius: 0.8rem; padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.8rem;
}
.chip--on { background: #2e7d32; border-color: #ffffff80; }
</style>
