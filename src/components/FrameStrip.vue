<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_FRAME_MS, MAX_FRAME_MS, MIN_FRAME_MS } from '../animation'
import { useBoard } from '../composables/useBoard'

withDefaults(defineProps<{ /** True while a GIF export is sampling the board. */ exporting?: boolean }>(), {
  exporting: false,
})

const board = useBoard()

/** Why adding, deleting, reordering and retiming a moment refuse mid-move. */
const lockedTitle = 'Nothing can change while the drill is playing or mid-move'

/** Why Play, Rewind and the scrubber are locked — only true during an export. */
const exportingTitle = 'The drill is being exported as an animation'

/**
 * A drill that has never used frames looks exactly as it did before frames
 * existed: the heading and one button offering another moment, and nothing
 * else. The strip opens only once there is a sequence to show.
 */
const hasSequence = computed(() => board.state.frames.length > 1)

const current = computed(() => board.state.currentFrame)
const last = computed(() => board.state.frames.length - 1)

/**
 * Seconds, not milliseconds. A coach thinks in seconds, and a field showing
 * 1500 invites someone to type 2 and wonder why nothing moved.
 */
const durationSeconds = computed(() => {
  const ms = board.state.frames[current.value]?.duration ?? DEFAULT_FRAME_MS
  return String(Math.round(ms) / 1000)
})

function setDuration(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  // A cleared field, or anything that is not a number, is not "zero
  // seconds" — it is an edit in progress. `Number('')` is 0, which would
  // otherwise sail past `isFinite` and silently clamp the frame to
  // MIN_FRAME_MS. Leaving the duration alone is the only option that
  // cannot surprise a coach who is mid-keystroke.
  if (raw.trim() === '') return
  const seconds = Number(raw)
  if (!Number.isFinite(seconds)) return
  board.setFrameDuration(current.value, seconds * 1000)
}

function onScrub(event: Event): void {
  board.scrubTo(Number((event.target as HTMLInputElement).value))
}

function togglePlay(): void {
  if (board.playback.playing) board.pause()
  else board.play()
}
</script>

<template>
  <div class="strip" :class="{ 'is-open': hasSequence }">
    <!--
      Named like every other group of controls on the page. Without it this
      was the one region with no heading, which is most of why the way into
      frames read as stray furniture below the pitch rather than a thing the
      board offers.
    -->
    <span data-strip-label class="group-label">Moments</span>
    <button
      data-add-frame
      class="chip chip--primary"
      :disabled="board.isDerived.value"
      :title="board.isDerived.value ? lockedTitle : 'Add a moment, copied from the one you are on'"
      @click="board.addFrame()"
    >+ Add a moment</button>

    <template v-if="hasSequence">
      <div class="frames">
        <button
          v-for="(_, index) in board.state.frames"
          :key="index"
          :data-frame="index"
          :class="['chip', 'frame', { 'is-active': index === current }]"
          :title="`Go to moment ${index + 1}`"
          @click="board.goToFrame(index)"
        >{{ index + 1 }}</button>
      </div>

      <div class="group">
        <button
          data-frame-earlier
          class="chip"
          :disabled="current === 0 || board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : 'Move this moment earlier'"
          aria-label="Move this moment earlier"
          @click="board.moveFrame(current, current - 1)"
        >◀</button>
        <button
          data-frame-later
          class="chip"
          :disabled="current === last || board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : 'Move this moment later'"
          aria-label="Move this moment later"
          @click="board.moveFrame(current, current + 1)"
        >▶</button>
        <button
          data-delete-frame
          class="chip"
          :disabled="board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : 'Remove this moment'"
          @click="board.deleteFrame(current)"
        >Delete moment</button>
      </div>

      <!--
        Hidden on the first frame: a duration is how long the move INTO a
        moment takes, and nothing moves into the start of a drill.
      -->
      <label v-if="current > 0" class="duration">
        <span class="duration-label">Takes</span>
        <input
          data-frame-duration
          class="duration-field"
          type="number"
          :min="MIN_FRAME_MS / 1000"
          :max="MAX_FRAME_MS / 1000"
          step="0.1"
          :value="durationSeconds"
          :disabled="board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : undefined"
          @change="setDuration"
        />
        <span class="duration-label">s</span>
      </label>

      <!--
        The transport itself stays live while the view is merely a blend —
        pausing mid-move must not lock the coach out of pausing. An export is
        different: it drives the playhead itself, and Play racing its own
        seek loop would corrupt the samples, so these three are gated on
        `exporting` specifically rather than on the general lock.
      -->
      <div class="group transport">
        <button
          data-rewind
          class="chip"
          :disabled="exporting"
          :title="exporting ? exportingTitle : 'Back to the start'"
          aria-label="Back to the start"
          @click="board.rewind()"
        >⏮</button>
        <button
          data-play
          class="chip"
          :disabled="exporting"
          :title="exporting ? exportingTitle : board.playback.playing ? 'Pause' : 'Play the drill'"
          :aria-label="board.playback.playing ? 'Pause' : 'Play the drill'"
          @click="togglePlay()"
        >{{ board.playback.playing ? '❚❚' : '▶' }}</button>
        <input
          data-scrub
          class="scrub"
          type="range"
          min="0"
          :max="board.timeline.value.total"
          step="10"
          :value="board.playback.at"
          :disabled="exporting"
          :title="exporting ? exportingTitle : undefined"
          aria-label="Scrub through the drill"
          @input="onScrub"
          @change="board.endScrub()"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0.6rem;
  /*
   * The strip sits on the dark page whether or not it has opened, so it
   * carries the light text colour either way. Setting this only on `.is-open`
   * left the heading and the button inheriting the page default, which
   * rendered dark on dark and dark on green respectively.
   */
  color: #eceff1;
}
.strip.is-open {
  background: #263238;
  border-radius: 0.4rem;
}
.group-label { font-size: 0.7rem; text-transform: uppercase; opacity: 0.65; margin-right: 0.2rem; }
.frames { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.group { display: flex; gap: 0.3rem; align-items: center; }
.transport { flex: 1 1 12rem; min-width: 0; }
.chip {
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
  border-radius: 0.4rem; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem;
}
/*
 * The way in, and the only green control on a page of blue-greys — which is
 * what makes it findable at a glance. Nothing else takes this class: a second
 * green button would cost the first one the distinction it exists for. Once
 * the strip opens it sits beside the numbered chips rather than competing
 * with them, because they are what the coach is reaching for by then.
 */
.chip--primary {
  /*
   * Lighter and bluer than the pitch it sits beneath, which is the one thing
   * it must not be mistaken for. The colour is stated outright rather than
   * inherited, so the label reads white whatever the strip is doing.
   */
  background: #43a047;
  border-color: #43a047;
  color: #ffffff;
  padding-inline: 0.95rem;
  font-weight: 600;
}
.chip--primary:hover:not(:disabled) { background: #4caf50; border-color: #4caf50; }
.chip--primary:disabled {
  background: #37474f;
  border-color: #ffffff40;
  color: #eceff1;
  font-weight: 400;
}
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.is-active { background: #546e7a; border-color: #ffffff; }
.frame { min-width: 2.2rem; }
.duration { display: flex; gap: 0.3rem; align-items: center; font-size: 0.8rem; }
.duration-field {
  width: 4.5rem; border-radius: 0.3rem; padding: 0.3rem;
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
}
.scrub { flex: 1 1 auto; min-width: 6rem; }

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the side
 * of a pitch. 44px is the smallest reliably hittable target.
 */
@media (pointer: coarse) {
  .chip { min-height: 44px; padding-inline: 0.85rem; }
  .duration-field { min-height: 44px; }
  .scrub { height: 44px; }
}
</style>
