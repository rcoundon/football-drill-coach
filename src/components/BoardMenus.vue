<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { PITCH_H, PITCH_W } from '../geometry'
import { useBoard } from '../composables/useBoard'
import { PITCHES } from './controls'
import PitchMarkings from './PitchMarkings.vue'

/**
 * How the board is laid out, and what is drawn on it. Seven pills that all
 * looked like every other pill, gathered into the two questions they were
 * really answering: what pitch am I on, and what am I looking at.
 *
 * Used by both layouts — the rail on a tablet, the bar on a desktop — so
 * the same control cannot mean one thing in one and something else in the
 * other.
 */
withDefaults(defineProps<{ /** Lay the buttons out down a rail rather than across a bar. */ vertical?: boolean }>(), {
  vertical: false,
})

const board = useBoard()

const open = ref<'pitch' | 'view' | null>(null)

function toggle(menu: 'pitch' | 'view'): void {
  open.value = open.value === menu ? null : menu
}

const rootEl = ref<HTMLElement | null>(null)

function onDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const target = event.target as Node | null
  if (target && rootEl.value?.contains(target)) return
  open.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) open.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onKeydown)
})

/**
 * Portrait and landscape as two states rather than one verb.
 *
 * `Rotate` said what pressing it would do but never which way round the
 * board currently was, so a coach had to press it to find out.
 */
function setRotated(rotated: boolean): void {
  if (board.state.pitch.rotated !== rotated) board.toggleRotated()
}
</script>

<template>
  <div ref="rootEl" :class="['menus', { 'menus--vertical': vertical }]">
    <div class="menu-wrap">
      <button
        data-pitch-menu
        class="trigger"
        :class="{ 'is-open': open === 'pitch' }"
        aria-haspopup="menu"
        :aria-expanded="open === 'pitch'"
        aria-label="Pitch"
        title="Which pitch, and which way round"
        @click="toggle('pitch')"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16M3 10h3M3 14h3M21 10h-3M21 14h-3" /></svg>
        <span class="trigger-label">Pitch</span>
      </button>

      <div v-show="open === 'pitch'" data-pitch-panel class="panel" role="menu">
        <span class="eyebrow">Pitch</span>
        <!--
          Pictures of the three pitches rather than the words Blank, Full and
          Half. What a coach is choosing between is what the board will look
          like, so that is what the choice shows.
        -->
        <div class="thumbs">
          <button
            v-for="p in PITCHES"
            :key="p.id"
            :data-pitch="p.id"
            class="thumb"
            :class="{ 'is-active': board.state.pitch.type === p.id }"
            role="menuitemradio"
            :aria-checked="board.state.pitch.type === p.id"
            :aria-label="p.label"
            :title="p.label"
            @click="board.setPitchType(p.id)"
          >
            <svg class="thumb-art" :viewBox="`0 0 ${PITCH_W} ${PITCH_H}`" aria-hidden="true">
              <rect :x="0" :y="0" :width="PITCH_W" :height="PITCH_H" fill="#2e7d32" />
              <PitchMarkings :type="p.id" />
            </svg>
            <span class="thumb-label">{{ p.label }}</span>
          </button>
        </div>

        <span class="eyebrow">Orientation</span>
        <div class="segmented">
          <button
            data-orientation="landscape"
            class="segment"
            :class="{ 'is-active': !board.state.pitch.rotated }"
            role="menuitemradio"
            :aria-checked="!board.state.pitch.rotated"
            @click="setRotated(false)"
          >Landscape</button>
          <button
            data-rotate
            data-orientation="portrait"
            class="segment"
            :class="{ 'is-active': board.state.pitch.rotated }"
            role="menuitemradio"
            :aria-checked="board.state.pitch.rotated"
            @click="setRotated(true)"
          >Portrait</button>
        </div>
      </div>
    </div>

    <div class="menu-wrap">
      <button
        data-view-menu
        class="trigger"
        :class="{ 'is-open': open === 'view' }"
        aria-haspopup="menu"
        :aria-expanded="open === 'view'"
        aria-label="View"
        title="What is drawn on the board"
        @click="toggle('view')"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        <span class="trigger-label">View</span>
      </button>

      <!--
        Switches, not pills. A pill that is on and a pill that is off differ
        by a border, which is not a difference a coach reads across a pitch.
      -->
      <div v-show="open === 'view'" data-view-panel class="panel" role="menu">
        <span class="eyebrow">Show</span>
        <button
          data-toggle-labels
          class="switch-row"
          role="menuitemcheckbox"
          :aria-checked="board.state.labelsVisible"
          @click="board.toggleLabelsVisible()"
        >
          <span>Player labels</span>
          <span class="switch" :class="{ 'is-on': board.state.labelsVisible }" aria-hidden="true"></span>
        </button>

        <button
          data-toggle-ball
          class="switch-row"
          role="menuitemcheckbox"
          :aria-checked="board.state.ballsVisible"
          @click="board.toggleBallsVisible()"
        >
          <span>Ball</span>
          <span class="switch" :class="{ 'is-on': board.state.ballsVisible }" aria-hidden="true"></span>
        </button>

        <button
          data-toggle-notes
          class="switch-row"
          role="menuitemcheckbox"
          :aria-checked="board.state.notesVisible"
          @click="board.toggleNotesVisible()"
        >
          <span>Notes panel</span>
          <span class="switch" :class="{ 'is-on': board.state.notesVisible }" aria-hidden="true"></span>
        </button>

      </div>
    </div>
  </div>
</template>

<style scoped>
.menus { display: flex; gap: 0.3rem; align-items: center; }
.menus--vertical { flex-direction: row; justify-content: center; }

.menu-wrap { position: relative; flex: none; }

.trigger {
  display: flex; align-items: center; gap: 0.3rem;
  min-height: 34px; padding: 0.25rem 0.5rem;
  border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-1);
  border-radius: var(--radius-control); cursor: pointer; font-size: 0.8rem;
  transition: background var(--dur-fast) linear;
}
.trigger:hover { background: var(--surface-3); }
.trigger.is-open { background: var(--surface-4); border-color: #ffffff59; }
.menus--vertical .trigger-label { display: none; }
.menus--vertical .trigger { padding: 0.25rem; width: 34px; justify-content: center; }

.panel {
  position: absolute; z-index: 25;
  bottom: calc(100% + 0.35rem); left: 0;
  width: 240px;
  display: flex; flex-direction: column; gap: 0.35rem;
  padding: 0.5rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sheet);
  box-shadow: 0 16px 40px -12px var(--shadow-ink);
}
/*
 * In the bar the menus sit at the top of the screen, so their panels hang
 * below rather than above.
 */
.menus:not(.menus--vertical) .panel { bottom: auto; top: calc(100% + 0.35rem); }

.eyebrow {
  font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-2);
}

.thumbs { display: flex; gap: 0.35rem; }

.thumb {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
  padding: 0.2rem;
  border: 2px solid transparent; border-radius: 0.5rem;
  background: var(--surface-2); color: inherit; cursor: pointer;
}
.thumb:hover { border-color: #ffffff40; }
.thumb.is-active { border-color: #ff6b35; }
.thumb-art { width: 100%; height: 42px; border-radius: 0.25rem; display: block; }
.thumb-label { font-size: 0.65rem; }

.segmented { display: flex; border: 1px solid var(--border); border-radius: 0.4rem; overflow: hidden; }
.segment {
  flex: 1; padding: 0.4rem; border: none; background: transparent; color: inherit;
  cursor: pointer; font: inherit; font-size: 0.8rem;
}
.segment:hover { background: var(--surface-3); }
.segment.is-active { background: var(--brand-gradient); color: #ffffff; }

.switch-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  min-height: 40px; padding: 0.3rem 0.4rem;
  border: none; background: transparent; color: inherit;
  border-radius: 0.4rem; cursor: pointer; font: inherit; font-size: 0.85rem;
}
.switch-row:hover { background: var(--surface-3); }

.switch {
  flex: none; width: 34px; height: 20px; border-radius: 10px;
  background: #ffffff30; position: relative; transition: background 160ms linear;
}
.switch::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: #ffffff;
  transition: transform 160ms ease-out;
}
.switch.is-on { background: var(--brand-gradient); }
.switch.is-on::after { transform: translateX(14px); }

@media (pointer: coarse) {
  .trigger { min-height: 44px; }
  .menus--vertical .trigger { width: 44px; }
  .switch-row { min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .switch, .switch::after { transition: none; }
}
</style>
