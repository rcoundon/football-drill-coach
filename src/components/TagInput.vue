<script setup lang="ts">
import { computed, ref } from 'vue'
import { normaliseTags, toggleTag } from '../composables/useStorage'
import ChipRow from './ChipRow.vue'

/**
 * Choose a drill's tags: tap the ones already in use, type the ones that are
 * not.
 *
 * Two halves because they answer two different needs. A coach filing their
 * fiftieth rondo should not have to spell "rondo" again and risk "rondos"
 * beside it — a near-duplicate normalisation cannot catch, because both are
 * legitimate strings. A coach inventing a tag has nothing to tap.
 */
const props = defineProps<{
  /** Every tag already on some drill, for the chips. */
  available: string[]
  /**
   * The tags the drill starts with. Read ONCE, to press the chips a fork
   * inherits.
   *
   * Deliberately not a live binding. The parent stores what this emits, so a
   * merge that re-read the prop would fold its own output back in on the next
   * keystroke — which filed a drill under "r", "ro", "ron", "rond" and
   * "rondo" while the coach typed one word.
   */
  initial: string[]
}>()

const emit = defineEmits<{ update: [tags: string[]] }>()

/** The chips pressed. Seeded from `initial`, owned here afterwards. */
const chosen = ref<string[]>([...props.initial])
const typed = ref('')

/** What was typed, as tags. Normalised so the field cannot fork a tag by case. */
const typedTags = computed(() => normaliseTags(typed.value.split(',')))

/**
 * The chips pressed, then anything typed that is not already among them.
 *
 * A tag typed that is also pressed collapses to one — which is why the two
 * halves can be filled in either order without the coach having to keep track.
 */
function announce() {
  emit('update', normaliseTags([...chosen.value, ...typedTags.value]))
}

function toggle(tag: string) {
  chosen.value = toggleTag(chosen.value, tag)
  // Typing a tag does not press its chip, so pressing a chip off takes the tag
  // off even while the same word sits in the field. Whatever is still typed
  // when Save is pressed is added then.
  typed.value = normaliseTags(typedTags.value.filter((t) => t !== tag)).join(', ')
  announce()
}
</script>

<template>
  <div class="tags">
    <label for="drill-tags">Tags</label>
    <ChipRow :tags="available" :pressed="chosen" @toggle="toggle" />
    <input
      id="drill-tags"
      v-model="typed"
      data-tag-new
      class="input"
      placeholder="rondo, warm up"
      @input="announce"
    />
  </div>
</template>

<style scoped>
.tags { display: grid; gap: 0.35rem; margin-top: 0.75rem; }
.tags label { font-size: 0.8rem; opacity: 0.7; }
.input {
  padding: 0.4rem; border-radius: 0.3rem;
  border: 1px solid #ffffff40; background: #263238; color: inherit;
}
</style>
