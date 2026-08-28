<script setup lang="ts">
import { toggleTag } from '../composables/useStorage'
import ChipRow from './ChipRow.vue'

const props = defineProps<{ tags: string[]; selected: string[] }>()
const emit = defineEmits<{ update: [selected: string[]] }>()

/**
 * Chips narrow and combine with AND. "rondo" and "u12" together is the
 * question a coach with fifty drills is actually asking; a chip that cleared
 * the others would make that question unaskable.
 */
function toggle(tag: string) {
  emit('update', toggleTag(props.selected, tag))
}
</script>

<template>
  <ChipRow class="filter" :tags="tags" :pressed="selected" @toggle="toggle" />
</template>

<style scoped>
.filter { margin-top: 0.6rem; }
</style>
