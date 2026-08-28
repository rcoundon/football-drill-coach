<script setup lang="ts">
import { computed, ref } from 'vue'
import { normaliseTags } from '../composables/useStorage'

/**
 * Choose a drill's tags: tap the ones already in use, type the ones that are
 * not.
 *
 * Two halves because they answer two different needs. A coach filing their
 * fiftieth rondo should not have to spell "rondo" again and risk "rondos"
 * beside it — that is a near-duplicate normalisation cannot catch, because
 * both are legitimate strings. A coach inventing a tag has nothing to tap.
 */
const props = defineProps<{
  /** Every tag already on some drill, for the chips. */
  available: string[]
  /** The tags this drill already carries. Chips for these start pressed. */
  selected: string[]
}>()

const emit = defineEmits<{ update: [tags: string[]] }>()

const typed = ref('')

/**
 * What was typed, as tags.
 *
 * Normalised here rather than only on the way to storage, so that a tag typed
 * as "Rondo" is recognised as the "rondo" chip already pressed instead of
 * riding along beside it as far as the write.
 */
const typedTags = computed(() => normaliseTags(typed.value.split(',')))

/** The chips pressed, then anything typed that is not already among them. */
function combined(chosen: string[]): string[] {
  return normaliseTags([...chosen, ...typedTags.value])
}

function toggle(tag: string) {
  const chosen = props.selected.includes(tag)
    ? props.selected.filter((t) => t !== tag)
    : [...props.selected, tag]
  emit('update', combined(chosen))
}

/**
 * Typing re-emits the whole list rather than waiting for the save.
 *
 * The prompt holds one value for the drill's tags, so a half-typed field that
 * only counted on submit would be a second place the answer lived — and the
 * one the coach could not see.
 */
function onTyped() {
  emit('update', combined(props.selected))
}
</script>

<template>
  <div class="tags">
    <label for="drill-tags">Tags</label>
    <!-- Nothing at all until some drill has a tag: an empty row is furniture. -->
    <div v-if="available.length > 0" class="row">
      <button
        v-for="tag in available"
        :key="tag"
        data-tag-choice
        type="button"
        class="chip"
        :class="{ 'chip--on': selected.includes(tag) }"
        :aria-pressed="selected.includes(tag)"
        @click="toggle(tag)"
      >
        {{ tag }}
      </button>
    </div>
    <input
      id="drill-tags"
      v-model="typed"
      data-tag-new
      class="input"
      placeholder="rondo, warm up"
      @input="onTyped"
    />
  </div>
</template>

<style scoped>
.tags { display: grid; gap: 0.35rem; margin-top: 0.75rem; }
.tags label { font-size: 0.8rem; opacity: 0.7; }
.row { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.chip {
  border: 1px solid #ffffff40; background: #455a64; color: inherit;
  border-radius: 0.8rem; padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.8rem;
}
.chip--on { background: #2e7d32; border-color: #ffffff80; }
.input {
  padding: 0.4rem; border-radius: 0.3rem;
  border: 1px solid #ffffff40; background: #263238; color: inherit;
}
</style>
